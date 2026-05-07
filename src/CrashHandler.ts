import { Platform, Dimensions } from "react-native";
import {
  BugLevel,
  BugReportKind,
  BugReportPayload,
  DeviceInfo,
  NavigationEntry,
  UserAction,
} from "./types";

const MAX_NAVIGATION_ENTRIES = 5;
const MAX_USER_ACTIONS = 10;

let navigationHistory: NavigationEntry[] = [];
let userActions: UserAction[] = [];
let currentScreenState: Record<string, unknown> = {};
let currentContext: Record<string, unknown> = {};
let appVersion: string = "";
let redactedKeys: string[] = [];
let isInstalled = false;
let sampleRate = 1;
let dedupWindowMs = 0;
const dedupMap = new Map<number, { count: number; lastSent: number }>();

function hashStack(input: string): number {
  let h = 5381;
  const len = Math.min(input.length, 400);
  for (let i = 0; i < len; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return h;
}

function shouldEmitCrash(error: Error): {
  emit: boolean;
  repeated: number;
} {
  if (sampleRate < 1 && Math.random() >= sampleRate) {
    return { emit: false, repeated: 0 };
  }

  if (dedupWindowMs <= 0) return { emit: true, repeated: 0 };

  const key = hashStack(error.stack || error.message || "");
  const now = Date.now();
  const entry = dedupMap.get(key);

  if (entry && now - entry.lastSent < dedupWindowMs) {
    entry.count += 1;
    return { emit: false, repeated: 0 };
  }

  const repeated = entry?.count ?? 0;
  dedupMap.set(key, { count: 0, lastSent: now });
  return { emit: true, repeated };
}

let originalErrorHandler: ((error: Error, isFatal?: boolean) => void) | null =
  null;
let onCrashCallback: ((payload: BugReportPayload) => Promise<void>) | null =
  null;

function getDeviceInfo(): DeviceInfo {
  const { width, height } = Dimensions.get("window");
  return {
    platform: Platform.OS as "ios" | "android",
    os_version: Platform.Version,
    screen_width: Math.round(width),
    screen_height: Math.round(height),
    is_dev: __DEV__,
    rn_version: require("react-native/package.json").version,
  };
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return obj;

  return Object.entries(obj).reduce(
    (acc, [key, value]) => {
      const shouldRedact = redactedKeys.some((k) =>
        key.toLowerCase().includes(k.toLowerCase()),
      );

      if (shouldRedact) {
        acc[key] = "[REDACTED]";
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        acc[key] = redact(value as Record<string, unknown>);
      } else {
        acc[key] = value;
      }

      return acc;
    },
    {} as Record<string, unknown>,
  );
}

function buildPayload(
  error: Error,
  kind: BugReportKind = "crash",
  description?: string,
  level?: BugLevel,
): BugReportPayload {
  return {
    kind,
    level,
    title: error.message || "Unknown error",
    description,
    stack_trace: error.stack,
    app_version: appVersion,
    occurred_at: new Date().toISOString(),
    device_info: getDeviceInfo(),
    navigation_history: [...navigationHistory],
    user_actions: [...userActions],
    component_state: redact(currentScreenState),
    context:
      Object.keys(currentContext).length > 0
        ? redact(currentContext)
        : undefined,
  };
}

export const CrashHandler = {
  install(
    version: string,
    keys: string[],
    onCrash: (payload: BugReportPayload) => Promise<void>,
    options?: { sampleRate?: number; dedupWindowMs?: number },
  ): void {
    if (isInstalled) return;

    appVersion = version;
    redactedKeys = keys;
    onCrashCallback = onCrash;
    sampleRate = options?.sampleRate ?? 1;
    dedupWindowMs = options?.dedupWindowMs ?? 0;
    isInstalled = true;

    originalErrorHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler(async (error: Error, isFatal?: boolean) => {
      try {
        const decision = shouldEmitCrash(error);
        if (decision.emit) {
          const payload = buildPayload(error, "crash");
          if (decision.repeated > 0) payload.repeated_count = decision.repeated;
          await onCrashCallback?.(payload);
        }
      } catch {}

      originalErrorHandler?.(error, isFatal);
    });

    const g = globalThis as any;
    const originalPromiseHandler = g.onunhandledrejection;
    g.onunhandledrejection = async (event: { reason: unknown }) => {
      try {
        const error =
          event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason));

        const decision = shouldEmitCrash(error);
        if (decision.emit) {
          const payload = buildPayload(error, "crash");
          if (decision.repeated > 0) payload.repeated_count = decision.repeated;
          await onCrashCallback?.(payload);
        }
      } catch {}

      originalPromiseHandler?.(event);
    };
  },

  uninstall(): void {
    if (!isInstalled) return;
    if (originalErrorHandler) {
      ErrorUtils.setGlobalHandler(originalErrorHandler);
    }
    dedupMap.clear();
    isInstalled = false;
  },

  recordNavigation(screenName: string): void {
    const entry: NavigationEntry = {
      screen: screenName,
      timestamp: new Date().toISOString(),
    };

    if (navigationHistory.length >= MAX_NAVIGATION_ENTRIES) {
      navigationHistory.shift();
    }
    navigationHistory.push(entry);
  },

  recordAction(action: UserAction["action"], target?: string): void {
    const entry: UserAction = {
      action,
      target,
      timestamp: new Date().toISOString(),
    };

    if (userActions.length >= MAX_USER_ACTIONS) {
      userActions.shift();
    }
    userActions.push(entry);
  },

  setScreenState(state: Record<string, unknown>): void {
    currentScreenState = state;
  },

  setContext(ctx: Record<string, unknown>): void {
    currentContext = { ...currentContext, ...ctx };
  },

  clearContext(): void {
    currentContext = {};
  },

  buildManualPayload(description?: string): BugReportPayload {
    return buildPayload(new Error("Manual report"), "manual", description);
  },

  buildMessagePayload(message: string, level: BugLevel): BugReportPayload {
    return buildPayload(new Error(message), "message", undefined, level);
  },

  buildExceptionPayload(error: Error, level: BugLevel): BugReportPayload {
    return buildPayload(error, "message", undefined, level);
  },

  reset(): void {
    navigationHistory = [];
    userActions = [];
    currentScreenState = {};
    currentContext = {};
  },
};
