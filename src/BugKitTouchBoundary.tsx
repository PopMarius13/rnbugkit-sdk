import React, { useRef } from "react";
import {
  View,
  StyleSheet,
  GestureResponderEvent,
  ViewStyle,
  StyleProp,
} from "react-native";
import { BugKit } from "./BugKit";

export interface BugKitTouchBoundaryProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  ignoreNames?: string[];
  dedupeWindowMs?: number;
  maxDepth?: number;
}

const TRACKED_DISPLAY_NAMES = new Set([
  "TextInput",
  "Pressable",
  "Button",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
  "Switch",
  "Slider",
]);

interface FiberLike {
  return: FiberLike | null;
  memoizedProps?: Record<string, unknown> | null;
  elementType?: { displayName?: string; name?: string } | null;
  type?: { displayName?: string; name?: string } | string | null;
}

function getDisplayName(node: FiberLike): string | null {
  const t = node.elementType ?? node.type;
  if (!t || typeof t === "string") return null;
  return t.displayName ?? t.name ?? null;
}

function extractLabel(
  fiber: FiberLike | null | undefined,
  maxDepth: number,
  ignored: Set<string>
): string | null {
  let node: FiberLike | null = fiber ?? null;
  let fallback: string | null = null;
  let depth = 0;

  while (node && depth < maxDepth) {
    const props = node.memoizedProps;
    if (props) {
      const testID = props.testID;
      if (typeof testID === "string" && testID.length > 0) return testID;

      const a11y = props.accessibilityLabel;
      if (typeof a11y === "string" && a11y.length > 0) return a11y;
    }

    if (!fallback) {
      const name = getDisplayName(node);
      if (name && !ignored.has(name) && TRACKED_DISPLAY_NAMES.has(name)) {
        fallback = name;
      }
    }

    node = node.return;
    depth++;
  }

  return fallback;
}

export function BugKitTouchBoundary({
  children,
  style,
  disabled,
  ignoreNames,
  dedupeWindowMs = 300,
  maxDepth = 20,
}: BugKitTouchBoundaryProps): React.ReactElement {
  const lastLabel = useRef<string | null>(null);
  const lastAt = useRef<number>(0);

  const ignored = useRef<Set<string>>(
    new Set(ignoreNames ?? [])
  );

  const onTouchStart = (e: GestureResponderEvent) => {
    if (disabled) return;
    try {
      const targetInst = (e as unknown as { _targetInst?: FiberLike })
        ._targetInst;
      const label = extractLabel(targetInst, maxDepth, ignored.current);
      if (!label) return;

      const now = Date.now();
      if (
        label === lastLabel.current &&
        now - lastAt.current < dedupeWindowMs
      ) {
        return;
      }
      lastLabel.current = label;
      lastAt.current = now;

      BugKit.recordAction("tap", label);
    } catch {
      // never let instrumentation crash the host app
    }
  };

  return (
    <View
      style={[styles.root, style]}
      collapsable={false}
      onTouchStart={onTouchStart}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
