import { Platform, Dimensions, AppState, AppStateStatus } from "react-native";
import {
  BugKitConfig,
  BugLevel,
  BugReportPayload,
  NetworkBatchPayload,
  UserAction,
} from "./types";
import { CrashHandler } from "./CrashHandler";
import { NetworkMonitor } from "./NetworkMonitor";
import { Queue } from "./Queue";

const DEFAULT_SLOW_THRESHOLD = 3000;
const DEFAULT_FLUSH_INTERVAL = 30000;
const DEFAULT_REDACTED_KEYS = [
  "password",
  "token",
  "secret",
  "card",
  "cvv",
  "pin",
];

let config: Required<BugKitConfig> | null = null;
let appStateSubscription: any = null;

async function sendBugReport(payload: BugReportPayload): Promise<void> {
  if (!config) return;

  let finalPayload: BugReportPayload | null = payload;
  if (config.onBeforeSend) {
    try {
      finalPayload = await config.onBeforeSend(payload);
    } catch {
      finalPayload = payload;
    }
  }
  if (!finalPayload) return;

  try {
    const response = await fetch(
      `https://rnbugkit-api.onrender.com/api/v1/bug_reports`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": config.apiKey,
        },
        body: JSON.stringify(finalPayload),
      }
    );

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    await Queue.add("bug_report", finalPayload);
  }
}

async function sendNetworkBatch(payload: NetworkBatchPayload): Promise<void> {
  if (!config) return;
  if (payload.failures.length === 0 && payload.stats.length === 0) return;

  try {
    const response = await fetch(
      `https://rnbugkit-api.onrender.com/api/v1/network_requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": config.apiKey,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    await Queue.add("network_batch", payload);
  }
}

async function flushQueue(): Promise<void> {
  const pending = Queue.getPending();
  if (pending.length === 0) return;

  for (const item of pending) {
    try {
      if (item.type === "bug_report") {
        await sendBugReport(item.payload as BugReportPayload);
      } else {
        await sendNetworkBatch(item.payload as NetworkBatchPayload);
      }
      await Queue.markSuccess(item.id);
    } catch {
      await Queue.markFailed(item.id);
    }
  }
}

export const BugKit = {
  async init(userConfig: BugKitConfig): Promise<void> {
    if (config) {
      console.warn(
        "[RNBugKit] Already initialized. Call BugKit.destroy() first."
      );
      return;
    }

    const isDev = typeof __DEV__ !== "undefined" && __DEV__;

    const merged: Required<BugKitConfig> = {
      enabled: true,
      enabledInDev: !isDev,
      redactedKeys: DEFAULT_REDACTED_KEYS,
      slowRequestThreshold: DEFAULT_SLOW_THRESHOLD,
      flushInterval: DEFAULT_FLUSH_INTERVAL,
      persistQueue: false,
      sampleRate: 1,
      dedupWindowMs: 30000,
      onBeforeSend: (p) => p,
      ...userConfig,
    };

    if (!merged.enabled || (!merged.enabledInDev && isDev)) return;

    config = merged;

    await Queue.init(config.persistQueue);
    CrashHandler.install(
      config.appVersion,
      config.redactedKeys,
      sendBugReport,
      {
        sampleRate: config.sampleRate,
        dedupWindowMs: config.dedupWindowMs,
      }
    );
    NetworkMonitor.install(
      config.appVersion,
      config.slowRequestThreshold,
      config.flushInterval,
      sendNetworkBatch
    );

    appStateSubscription = AppState.addEventListener(
      "change",
      async (state: AppStateStatus) => {
        if (state === "active") {
          await flushQueue();
        }
        if (state === "background") {
          await NetworkMonitor.flush();
        }
      }
    );

    await flushQueue();
  },

  destroy(): void {
    if (!config) return;

    CrashHandler.uninstall();
    NetworkMonitor.uninstall();
    Queue.clear();

    appStateSubscription?.remove();
    appStateSubscription = null;
    config = null;
  },

  onNavigationStateChange(currentRoute: { name: string } | undefined): void {
    if (!currentRoute?.name) return;
    CrashHandler.recordNavigation(currentRoute.name);
  },

  setScreenState(state: Record<string, unknown>): void {
    CrashHandler.setScreenState(state);
  },

  setContext(ctx: Record<string, unknown>): void {
    CrashHandler.setContext(ctx);
  },

  clearContext(): void {
    CrashHandler.clearContext();
  },

  recordAction(action: UserAction["action"], target?: string): void {
    CrashHandler.recordAction(action, target);
  },

  async reportManually(description?: string): Promise<void> {
    if (!config?.enabled) return;

    const payload = CrashHandler.buildManualPayload(description);
    await sendBugReport(payload);
  },

  async captureMessage(
    message: string,
    level: BugLevel = "info"
  ): Promise<void> {
    if (!config?.enabled) return;

    const payload = CrashHandler.buildMessagePayload(message, level);
    await sendBugReport(payload);
  },

  async captureException(
    error: Error,
    level: BugLevel = "error"
  ): Promise<void> {
    if (!config?.enabled) return;

    const payload = CrashHandler.buildExceptionPayload(error, level);
    await sendBugReport(payload);
  },
};
