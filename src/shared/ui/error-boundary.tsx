'use client';

import { Component, type ReactNode } from 'react';

/**
 * Generic React ErrorBoundary — render 단계 throw 만 catch (이벤트 핸들러
 * 안 throw 는 React 가 catch 안 함, caller 가 try/catch 책임).
 *
 * R11 #9 — Sigma WebGL context loss / GPU crash / 비동기 init 실패 같이
 * render 시점에 surface 통째로 죽는 시나리오에 fallback UI 제공.
 *
 * 사용:
 *   <ErrorBoundary fallback={({ error, reset }) => (...)} >
 *     <RiskyChild />
 *   </ErrorBoundary>
 *
 * fallback 은 함수 — caller 가 도메인-tuned UI (eg. 캔버스 렌더러 전용 reload
 * CTA, 그래프 뷰 전용 retry 버튼) 작성. error 객체 포함 — 디버그용.
 */

interface ErrorBoundaryProps {
  fallback: (info: { error: Error; reset: () => void }) => ReactNode;
  /** mount/unmount 또는 다른 신호로 boundary 를 강제 reset. 키 변경 시 reset. */
  resetKey?: string | number;
  /** componentDidCatch 의 콜백. 외부 logger 등으로 forward. */
  onError?: (error: Error) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** resetKey prop 값 — 변경 시 boundary reset. */
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
