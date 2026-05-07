import {
  NetworkFailure,
  NetworkStat,
  NetworkBatchPayload,
  FailureType,
} from "./types";

interface EndpointStat {
  url: string;
  method: string;
  hour: string;
  total_count: number;
  total_duration_ms: number;
  error_count: number;
  max_duration_ms: number;
  slowest_occurred_at: string;
  slowest_url: string;
}

let isInstalled = false;
let appVersion = "";
let slowThreshold = 3000;
let flushInterval = 30000;
let flushTimer: ReturnType<typeof setInterval> | null = null;

let originalFetch: typeof fetch | null = null;
let originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
let originalXHRSend: typeof XMLHttpRequest.prototype.send | null = null;

const failureQueue: NetworkFailure[] = [];
const statsMap: Map<string, EndpointStat> = new Map();

let onBatchCallback: ((payload: NetworkBatchPayload) => Promise<void>) | null =
  null;

function getCurrentHour(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString();
}

function recordStat(
  rawUrl: string,
  method: string,
  durationMs: number,
  isError: boolean,
): void {
  const normalized = rawUrl;
  const hour = getCurrentHour();
  const key = `${method}:${normalized}:${hour}`;
  const now = new Date().toISOString();

  const existing = statsMap.get(key);

  if (existing) {
    existing.total_count += 1;
    existing.total_duration_ms += durationMs;
    existing.error_count += isError ? 1 : 0;

    if (durationMs > existing.max_duration_ms) {
      existing.max_duration_ms = durationMs;
      existing.slowest_occurred_at = now;
      existing.slowest_url = rawUrl;
    }
  } else {
    statsMap.set(key, {
      url: normalized,
      method,
      hour,
      total_count: 1,
      total_duration_ms: durationMs,
      error_count: isError ? 1 : 0,
      max_duration_ms: durationMs,
      slowest_occurred_at: now,
      slowest_url: rawUrl,
    });
  }
}

function recordFailure(
  rawUrl: string,
  method: string,
  durationMs: number,
  failureType: FailureType,
  statusCode?: number,
  errorMessage?: string,
): void {
  failureQueue.push({
    url: rawUrl,
    method,
    status_code: statusCode,
    duration_ms: durationMs,
    failure_type: failureType,
    error_message: errorMessage,
    app_version: appVersion,
    occurred_at: new Date().toISOString(),
  });
}

function buildBatchPayload(): NetworkBatchPayload {
  const stats: NetworkStat[] = Array.from(statsMap.values()).map((s) => ({
    url: s.url,
    method: s.method,
    hour: s.hour,
    total_count: s.total_count,
    error_count: s.error_count,
    avg_duration_ms: Math.round(s.total_duration_ms / s.total_count),
    max_duration_ms: s.max_duration_ms,
    slowest_occurred_at: s.slowest_occurred_at,
    slowest_url: s.slowest_url,
    app_version: appVersion,
  }));

  return {
    failures: [...failureQueue],
    stats,
  };
}

function interceptFetch(): void {
  originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? "GET";
    const start = Date.now();

    try {
      const response = await originalFetch!(input, init);
      const duration = Date.now() - start;

      recordStat(url, method, duration, !response.ok);

      if (!response.ok) {
        recordFailure(url, method, duration, "error_status", response.status);
      } else if (duration > slowThreshold) {
        recordFailure(url, method, duration, "slow");
      }

      return response;
    } catch (error: unknown) {
      const duration = Date.now() - start;
      const isTimeout =
        error instanceof Error &&
        error.message.toLowerCase().includes("timeout");
      const failureType: FailureType = isTimeout ? "timeout" : "no_connection";
      const message = error instanceof Error ? error.message : "Unknown error";

      recordStat(url, method, duration, true);
      recordFailure(url, method, duration, failureType, undefined, message);

      throw error;
    }
  };
}

function interceptXHR(): void {
  originalXHROpen = XMLHttpRequest.prototype.open;
  originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { _rnbugkit?: { url: string; method: string } },
    method: string,
    url: string | URL,
    ...rest: any[]
  ) {
    this._rnbugkit = {
      url: typeof url === "string" ? url : url.href,
      method,
    };
    return originalXHROpen!.call(
      this,
      method,
      typeof url === "string" ? url : url.href,
      ...rest,
    );
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & { _rnbugkit?: { url: string; method: string } },
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const meta = this._rnbugkit;
    if (!meta) return originalXHRSend!.call(this, body);

    const start = Date.now();

    this.addEventListener("loadend", () => {
      const duration = Date.now() - start;
      const isError = this.status === 0 || this.status >= 400;

      recordStat(meta.url, meta.method, duration, isError);

      if (this.status >= 400) {
        recordFailure(
          meta.url,
          meta.method,
          duration,
          "error_status",
          this.status,
        );
      } else if (this.status === 0) {
        recordFailure(
          meta.url,
          meta.method,
          duration,
          "no_connection",
          undefined,
          "XHR failed",
        );
      } else if (duration > slowThreshold) {
        recordFailure(meta.url, meta.method, duration, "slow");
      }
    });

    return originalXHRSend!.call(this, body);
  };
}

async function flush(): Promise<void> {
  if (failureQueue.length === 0 && statsMap.size === 0) return;

  const payload = buildBatchPayload();

  try {
    await onBatchCallback?.(payload);
    failureQueue.length = 0;
    statsMap.clear();
  } catch {}
}

export const NetworkMonitor = {
  install(
    version: string,
    threshold: number,
    interval: number,
    onBatch: (payload: NetworkBatchPayload) => Promise<void>,
  ): void {
    if (isInstalled) return;

    appVersion = version;
    slowThreshold = threshold;
    flushInterval = interval;
    onBatchCallback = onBatch;
    isInstalled = true;

    interceptFetch();
    interceptXHR();

    flushTimer = setInterval(flush, flushInterval);
  },

  uninstall(): void {
    if (!isInstalled) return;

    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    }

    if (originalXHROpen) XMLHttpRequest.prototype.open = originalXHROpen;
    if (originalXHRSend) XMLHttpRequest.prototype.send = originalXHRSend;

    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }

    isInstalled = false;
  },

  async flush(): Promise<void> {
    await flush();
  },
};
