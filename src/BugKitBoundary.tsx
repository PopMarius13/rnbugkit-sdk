import React from "react";
import { BugKit } from "./BugKit";

export interface BugKitBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error) => React.ReactNode);
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class BugKitBoundary extends React.Component<
  BugKitBoundaryProps,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    BugKit.captureException(error, "error").catch(() => {});
    this.props.onError?.(error, info);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fallback } = this.props;
    if (typeof fallback === "function") return fallback(error);
    return fallback ?? null;
  }
}
