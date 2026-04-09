import { Platform, Dimensions, AppState, AppStateStatus } from "react-native";
import {
  BugKitConfig,
  BugReportPayload,
  NetworkBatchPayload,
  UserAction,
} from "./types";
import { CrashHandler } from "./CrashHandler";
import { NetworkMonitor } from "./NetworkMonitor";
import { Queue } from "./Queue";
import { NativeBugKit } from "./NativeBugKit";

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
let removeShakeListener: (() => void) | null = null;

async function sendBugReport(payload: BugReportPayload): Promise<void> {
  if (!config) return;

  try {
    const response = await fetch(`${config.baseUrl}/api/v1/bug_reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
  } catch (error) {
    await Queue.add("bug_report", payload);
  }
}

async function sendNetworkBatch(payload: NetworkBatchPayload): Promise<void> {
  if (!config) return;
  if (payload.failures.length === 0 && payload.stats.length === 0) return;

  try {
    const response = await fetch(`${config.baseUrl}/api/v1/network_requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify(payload),
    });

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

async function captureScreenshot(): Promise<string | undefined> {
  return await NativeBugKit.captureScreen();
}

export const BugKit = {
  async init(userConfig: BugKitConfig): Promise<void> {
    if (config) {
      console.warn(
        "[RNBugKit] Already initialized. Call BugKit.destroy() first.",
      );
      return;
    }

    config = {
      enabled: true,
      redactedKeys: DEFAULT_REDACTED_KEYS,
      slowRequestThreshold: DEFAULT_SLOW_THRESHOLD,
      flushInterval: DEFAULT_FLUSH_INTERVAL,
      persistQueue: false,
      ...userConfig,
    };

    if (!config.enabled) return;

    await Queue.init(config.persistQueue);
    CrashHandler.install(config.appVersion, config.redactedKeys, sendBugReport);
    NetworkMonitor.install(
      config.appVersion,
      config.slowRequestThreshold,
      config.flushInterval,
      sendNetworkBatch,
    );

    NativeBugKit.setShakeEnabled(true);
    removeShakeListener = NativeBugKit.addShakeListener(async () => {
      await BugKit.reportManually();
    });

    appStateSubscription = AppState.addEventListener(
      "change",
      async (state: AppStateStatus) => {
        if (state === "active") {
          await flushQueue();
        }
        if (state === "background") {
          await NetworkMonitor.flush();
        }
      },
    );

    await flushQueue();
  },

  destroy(): void {
    if (!config) return;

    CrashHandler.uninstall();
    NetworkMonitor.uninstall();
    Queue.clear();

    NativeBugKit.setShakeEnabled(false);
    removeShakeListener?.();
    removeShakeListener = null;

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

  recordAction(action: UserAction["action"], target?: string): void {
    CrashHandler.recordAction(action, target);
  },

  async reportManually(): Promise<void> {
    if (!config?.enabled) return;

    const screenshot = await captureScreenshot();
    const payload = CrashHandler.buildManualPayload(screenshot);
    await sendBugReport(payload);
  },
};
