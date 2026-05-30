# rnbugkit-sdk

Lightweight crash reporting and network monitoring SDK for React Native.

`rnbugkit-sdk` captures uncaught errors, render-time exceptions, unhandled promise rejections, and network failures in your app — along with rich context (recent screens, user actions, device info) — and ships them to the RNBugKit backend. It does **not** collect request or response bodies.

- **Zero native setup** — pure JS, works with any RN 0.70+ project
- **Auto crash capture** — sync errors, async errors, render errors, unhandled rejections
- **Network monitoring** — `fetch` + `XMLHttpRequest`, failures and slow requests
- **Breadcrumbs** — navigation history and user action trail attached to every report
- **Offline queue** — reports queued and retried when connectivity returns
- **Privacy-first** — no request/response bodies, configurable key redaction, opt-out in dev

## Install

```bash
npm install rnbugkit-sdk
# or
yarn add rnbugkit-sdk
```

Optional, for persistent offline queue across app restarts:

```bash
npm install @react-native-async-storage/async-storage
```

## Quick start

Initialize the SDK as early as possible — ideally in `index.js`, before `AppRegistry.registerComponent`:

```js
// index.js
import { AppRegistry } from 'react-native';
import { BugKit } from 'rnbugkit-sdk';
import App from './App';
import { name as appName } from './app.json';

BugKit.init({
  apiKey: 'your_api_key',
  appVersion: '1.0.0',
});

AppRegistry.registerComponent(appName, () => App);
```

That's it. From this point on, every uncaught exception, unhandled promise rejection, and failed/slow network request is captured automatically.

## Configuration

```ts
BugKit.init({
  apiKey: 'your_api_key',      // required
  appVersion: '1.0.0',         // required

  // Optional — defaults shown
  enabled: true,               // master switch
  enabledInDev: false,         // capture in __DEV__ builds
  slowRequestThreshold: 3000,  // ms — requests slower than this are reported
  flushInterval: 30000,        // ms — network batch flush cadence
  redactedKeys: ['password', 'token', 'secret', 'card', 'cvv', 'pin'],
  persistQueue: false,         // persist offline queue via AsyncStorage
  sampleRate: 1,               // 0..1 — fraction of crashes to report
  dedupWindowMs: 30000,        // suppress identical crashes within this window
  onBeforeSend: (payload) => payload, // mutate or drop a report before send
});
```

### Config reference

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | — | Your RNBugKit project key. Required. |
| `appVersion` | `string` | — | Attached to every report. Required. |
| `enabled` | `boolean` | `true` | Master switch. When `false`, `init` is a no-op. |
| `enabledInDev` | `boolean` | `false` | Capture in `__DEV__` builds. Off by default so the RedBox isn't shadowed. |
| `slowRequestThreshold` | `number` | `3000` | Any request taking longer than this (ms) is reported as `slow`. |
| `flushInterval` | `number` | `30000` | How often (ms) batched network stats/failures are flushed. |
| `redactedKeys` | `string[]` | see below | Keys (case-insensitive substring match) redacted from `context` and `screenState`. |
| `persistQueue` | `boolean` | `false` | Persist the offline queue across app launches. Requires `@react-native-async-storage/async-storage`. |
| `sampleRate` | `number` | `1` | Probability (0..1) that a crash is emitted. |
| `dedupWindowMs` | `number` | `30000` | Same crash (by stack hash) within this window is folded into `repeated_count`. |
| `onBeforeSend` | `(p) => p \| null` | identity | Inspect/mutate/drop a payload right before send. Return `null` to drop. |

Default `redactedKeys`: `password`, `token`, `secret`, `card`, `cvv`, `pin`.

## API

### Crashes & manual reports

```ts
// One-off manual report (no Error needed)
BugKit.reportManually('User said the camera froze');

// Log a message at a level
BugKit.captureMessage('Cache miss for user profile', 'warning');

// Log a caught exception
try {
  await fetchProfile();
} catch (e) {
  BugKit.captureException(e as Error);
}
```

### Breadcrumbs

```ts
// Track screen transitions (keeps the last 5)
BugKit.onNavigationStateChange({ name: 'CheckoutScreen' });

// Track user actions (keeps the last 10)
BugKit.recordAction('tap', 'submitButton');
BugKit.recordAction('scroll', 'productList');
BugKit.recordAction('navigate', 'Profile');
BugKit.recordAction('shake');
BugKit.recordAction('submit', 'loginForm');
BugKit.recordAction('focus', 'emailInput');
```

### Context & screen state

```ts
// Persistent context — included on every report until cleared
BugKit.setContext({ userId: 'u_123', plan: 'pro' });
BugKit.clearContext();

// Snapshot of the current screen — overwritten on each call
BugKit.setScreenState({ tab: 'orders', filter: 'pending' });
```

Both `context` and `screenState` are redacted using `redactedKeys` before sending.

### Cleanup

```ts
// Restore original handlers, clear in-memory queue, drop config
BugKit.destroy();
```

You usually don't need this — call only when wholly disabling the SDK at runtime.

## Components & hooks

### `<BugKitBoundary>`

A React error boundary that captures render-time exceptions and forwards them to the backend.

```tsx
import { BugKitBoundary } from 'rnbugkit-sdk';

<BugKitBoundary
  fallback={(error) => <ErrorScreen message={error.message} />}
  onError={(error, info) => console.log(error)}
>
  <App />
</BugKitBoundary>
```

| Prop | Type | Notes |
|---|---|---|
| `fallback` | `ReactNode \| (error: Error) => ReactNode` | Rendered when a child throws. |
| `onError` | `(error, info) => void` | Called in addition to the automatic report. |

Wrap your screens or feature roots — granular boundaries give better UX than a single top-level one.

### `<BugKitTouchBoundary>`

Wraps a subtree and automatically records `recordAction("tap", label)` for every interactive press. The label is taken from `testID` → `accessibilityLabel` → component display name (`TouchableOpacity`, `Pressable`, etc.).

```tsx
import { BugKitTouchBoundary } from 'rnbugkit-sdk';

<BugKitTouchBoundary>
  <App />
</BugKitTouchBoundary>
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `disabled` | `boolean` | `false` | Turn off without unmounting. |
| `ignoreNames` | `string[]` | `[]` | Display names to skip (e.g. `['DebugButton']`). |
| `dedupeWindowMs` | `number` | `300` | Same label within this window is recorded once. |
| `maxDepth` | `number` | `20` | How far up the fiber tree to walk looking for a label. |

Touch instrumentation never throws — failures are swallowed silently so it can't break your app.

### `<ReportBugButton>`

Floating button with a modal that lets users describe a bug and submit it.

```tsx
import { ReportBugButton } from 'rnbugkit-sdk';

<ReportBugButton
  label="Report bug"
  placeholder="What went wrong?"
  onReported={(success, description) => console.log({ success })}
/>
```

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | `"Report bug"` |
| `placeholder` | `string` | `"What went wrong?"` |
| `submitLabel` | `string` | `"Send"` |
| `cancelLabel` | `string` | `"Cancel"` |
| `onPress` | `() => void` | opens modal |
| `onReported` | `(ok, description) => void` | — |
| `style`, `textStyle` | — | override styling |

### `useReportBug()`

Hook for custom reporting UIs.

```tsx
import { useReportBug } from 'rnbugkit-sdk';

function Feedback() {
  const { report, isReporting, lastError } = useReportBug();
  return (
    <Button
      title={isReporting ? 'Sending…' : 'Send feedback'}
      onPress={() => report('Feedback text here')}
      disabled={isReporting}
    />
  );
}
```

## What gets captured

Every bug report includes:

- `title`, `stack_trace`, `kind` (`crash` | `manual` | `message`), `level`
- `app_version`, `occurred_at`
- `device_info` — platform, OS version, screen size, RN version, `is_dev`
- `navigation_history` — last 5 screens
- `user_actions` — last 10 actions (tap/scroll/navigate/shake/submit/focus)
- `component_state` — last `setScreenState` value (redacted)
- `context` — `setContext` values (redacted)
- `repeated_count` — when deduplication folds in repeats

Network monitoring captures **only metadata**:

- `url`, `method`, `status_code`, `duration_ms`, `failure_type`, `error_message`

Failure types: `error_status` (4xx/5xx), `timeout`, `no_connection`, `slow`.

Aggregated stats (count, error count, avg/max duration) are computed per endpoint per hour and shipped in batches.

## Privacy

`rnbugkit-sdk` is built to minimize what leaves the device:

- **No request bodies, no response bodies, no headers.** Network monitoring records the URL, method, status, and timing — nothing more.
- **No PII collected by default.** No user IDs, no emails, no device IDs. Anything in `context` / `screenState` is yours to populate.
- **Redaction.** `context` and `screenState` keys matching `redactedKeys` (case-insensitive substring) are replaced with `[REDACTED]`.
- **`onBeforeSend` escape hatch.** Inspect, mutate, or drop any payload before it's sent.

> **Note on URLs.** Query strings are captured as-is. If your endpoints encode sensitive values in the query string (e.g. `?token=…`), strip them in `onBeforeSend` or move them to headers.

## Offline queue

When the network is unavailable or the backend is unreachable, reports are queued in memory (up to 50 items, 3 retry attempts each) and retried automatically when the app returns to the foreground.

To survive app restarts, enable persistence:

```ts
BugKit.init({
  apiKey: '…',
  appVersion: '…',
  persistQueue: true,
});
```

This requires `@react-native-async-storage/async-storage` as a peer install.

## Notes on dev builds

By default, the SDK is **disabled in `__DEV__`** so the RedBox stays the source of truth while you're developing. To enable it during development (useful for testing reporting flows):

```ts
BugKit.init({
  apiKey: '…',
  appVersion: '…',
  enabledInDev: true,
});
```

Sync errors thrown from event handlers in dev are sometimes intercepted by Metro's RedBox before the SDK sees them — test crash flows in a release build for accurate behavior.

## Sampling and deduplication

- **Sampling** — `sampleRate: 0.1` reports ~10% of crashes. Useful at scale.
- **Deduplication** — same stack within `dedupWindowMs` is folded into a single report with `repeated_count` incremented.

```ts
BugKit.init({
  apiKey: '…',
  appVersion: '…',
  sampleRate: 0.25,
  dedupWindowMs: 60000,
});
```

## License

MIT © PMI Software Systems
