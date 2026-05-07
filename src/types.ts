export interface BugKitConfig {
  apiKey: string;
  appVersion: string;
  redactedKeys?: string[];
  slowRequestThreshold?: number;
  flushInterval?: number;
  enabled?: boolean;
  enabledInDev?: boolean;
  persistQueue?: boolean;
  sampleRate?: number;
  dedupWindowMs?: number;
  onBeforeSend?: (
    payload: BugReportPayload,
  ) => BugReportPayload | null | Promise<BugReportPayload | null>;
}

export interface DeviceInfo {
  platform: "ios" | "android";
  os_version: string | number;
  screen_width: number;
  screen_height: number;
  is_dev: boolean;
  rn_version: string;
}

export type BugReportKind = "crash" | "manual" | "message";
export type BugLevel = "info" | "warning" | "error";

export interface NavigationEntry {
  screen: string;
  timestamp: string;
}

export interface UserAction {
  action: "tap" | "scroll" | "navigate" | "shake";
  target?: string;
  timestamp: string;
}

export interface BugReportPayload {
  kind: BugReportKind;
  level?: BugLevel;
  title: string;
  description?: string;
  stack_trace?: string;
  app_version: string;
  occurred_at: string;
  device_info: DeviceInfo;
  navigation_history: NavigationEntry[];
  user_actions: UserAction[];
  component_state?: Record<string, unknown>;
  context?: Record<string, unknown>;
  repeated_count?: number;
}

export type FailureType = "error_status" | "timeout" | "no_connection" | "slow";

export interface NetworkFailure {
  url: string;
  method: string;
  status_code?: number;
  duration_ms: number;
  failure_type: FailureType;
  error_message?: string;
  app_version: string;
  occurred_at: string;
}

export interface NetworkStat {
  url: string;
  method: string;
  hour: string;
  total_count: number;
  error_count: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  app_version: string;
  slowest_occurred_at: string;
  slowest_url: string;
}

export interface NetworkBatchPayload {
  failures: NetworkFailure[];
  stats: NetworkStat[];
}
export type QueueItemType = "bug_report" | "network_batch";

export interface QueueItem {
  id: string;
  type: QueueItemType;
  payload: BugReportPayload | NetworkBatchPayload;
  created_at: string;
  attempts: number;
}
