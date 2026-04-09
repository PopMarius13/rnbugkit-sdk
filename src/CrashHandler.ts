import { Platform, Dimensions } from "react-native";
import {
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
let appVersion: string = "";
let redactedKeys: string[] = [];
let isInstalled = false;

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
  kind: "crash" | "manual" = "crash",
  screenshot?: string,
): BugReportPayload {
  return {
    kind,
    title: error.message || "Unknown error",
    stack_trace: error.stack,
    app_version: appVersion,
    occurred_at: new Date().toISOString(),
    device_info: getDeviceInfo(),
    navigation_history: [...navigationHistory],
    user_actions: [...userActions],
    component_state: redact(currentScreenState),
    screenshot,
  };
}

export const CrashHandler = {
  install(
    version: string,
    keys: string[],
    onCrash: (payload: BugReportPayload) => Promise<void>,
  ): void {
    if (isInstalled) return;

    appVersion = version;
    redactedKeys = keys;
    onCrashCallback = onCrash;
    isInstalled = true;

    originalErrorHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler(async (error: Error, isFatal?: boolean) => {
      try {
        const payload = buildPayload(error, "crash");
        await onCrashCallback?.(payload);
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

        const payload = buildPayload(error, "crash");
        await onCrashCallback?.(payload);
      } catch {}

      originalPromiseHandler?.(event);
    };
  },

  uninstall(): void {
    if (!isInstalled) return;
    if (originalErrorHandler) {
      ErrorUtils.setGlobalHandler(originalErrorHandler);
    }
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

  buildManualPayload(screenshot?: string): BugReportPayload {
    return buildPayload(new Error("Manual report"), "manual", screenshot);
  },

  reset(): void {
    navigationHistory = [];
    userActions = [];
    currentScreenState = {};
  },
};
