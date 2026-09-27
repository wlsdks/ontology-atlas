'use client';

import { Component, type ReactNode } from 'react';

/**
 * Catches throws during render only; event handlers own their try/catch. `fallback` is a
 * function so each caller writes its own recovery UI.
 */

interface ErrorBoundaryProps {
  fallback: (info: { error: Error; reset: () => void }) => ReactNode;
  /** The boundary resets when this key changes. */
  resetKey?: string | number;
  /** Forwards the caught error, for example to a logger. */
  onError?: (error: Error) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
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
