'use client';

import { Component, type ReactNode } from 'react';

/**
 * Generic React ErrorBoundary — catches throws during render only. React does not
 * catch throws inside event handlers; the caller owns try/catch there.
 *
 * It exists for the cases where a whole surface dies at render time: WebGL context
 * loss, a GPU crash, a failed async init.
 *
 * Usage:
 *   <ErrorBoundary fallback={({ error, reset }) => (...)} >
 *     <RiskyChild />
 *   </ErrorBoundary>
 *
 * `fallback` is a function so the caller can write a domain-tuned UI (a reload CTA
 * for the canvas renderer, a retry button for the graph view). The error object is
 * passed through for debugging.
 */

interface ErrorBoundaryProps {
  fallback: (info: { error: Error; reset: () => void }) => ReactNode;
  /** Force a reset on mount/unmount or any other signal — the boundary resets when this key changes. */
  resetKey?: string | number;
  /** componentDidCatch callback — forward to an external logger. */
  onError?: (error: Error) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Last seen `resetKey` — a change resets the boundary. */
  prevResetKey: string | number | undefined;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, prevResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.prevResetKey) {
      return { error: null, prevResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error);
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }
    return this.props.children;
  }
}
