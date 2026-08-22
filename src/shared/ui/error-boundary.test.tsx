import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './error-boundary';
import { useState } from 'react';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom');
  return <div>safe</div>;
}

function Fallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <span data-testid="msg">caught: {error.message}</span>
      <button type="button" onClick={reset}>
        retry
      </button>
    </div>
  );
}

describe('ErrorBoundary', () => {
  it('children 이 throw 안 하면 children 그대로 렌더', () => {
    render(
      <ErrorBoundary fallback={Fallback}>
        <Bomb explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('safe')).toBeInTheDocument();
  });

  it('children render 가 throw 하면 fallback 렌더', () => {
    // Suppress JSDOM's React error logging — the throw is deliberate, so keep the output clean.
    const original = console.error;
    console.error = () => {};
    try {
      render(
        <ErrorBoundary fallback={Fallback}>
          <Bomb explode={true} />
        </ErrorBoundary>,
      );
      expect(screen.getByTestId('msg').textContent).toBe('caught: boom');
    } finally {
      console.error = original;
    }
  });

  it('reset 버튼 → boundary 다시 children 시도', () => {
    function Wrapper() {
      const [explode, setExplode] = useState(true);
      return (
        <ErrorBoundary
          fallback={({ error, reset }) => (
            <div>
              <span data-testid="msg">caught: {error.message}</span>
              <button
                type="button"
                onClick={() => {
                  setExplode(false);
                  reset();
                }}
              >
                retry
              </button>
            </div>
          )}
        >
          <Bomb explode={explode} />
        </ErrorBoundary>
      );
    }
    const original = console.error;
    console.error = () => {};
    try {
      render(<Wrapper />);
      expect(screen.getByTestId('msg')).toBeInTheDocument();
      fireEvent.click(screen.getByText('retry'));
      expect(screen.getByText('safe')).toBeInTheDocument();
    } finally {
      console.error = original;
    }
  });

  it('resetKey 변경 시 자동 reset', () => {
    function Wrapper({ flag }: { flag: number }) {
      return (
        <ErrorBoundary
          resetKey={flag}
          fallback={({ error }) => <div>err: {error.message}</div>}
        >
          <Bomb explode={flag === 0} />
        </ErrorBoundary>
      );
    }
    const original = console.error;
    console.error = () => {};
    try {
      const { rerender } = render(<Wrapper flag={0} />);
      expect(screen.getByText(/err: boom/)).toBeInTheDocument();
      rerender(<Wrapper flag={1} />);
      expect(screen.getByText('safe')).toBeInTheDocument();
    } finally {
      console.error = original;
    }
  });

  it('onError 콜백이 호출됨', () => {
    let captured: Error | null = null;
    const original = console.error;
    console.error = () => {};
    try {
      render(
        <ErrorBoundary
          fallback={Fallback}
          onError={(e) => {
            captured = e;
          }}
        >
          <Bomb explode={true} />
        </ErrorBoundary>,
      );
      expect(captured).toBeInstanceOf(Error);
      expect((captured as Error | null)?.message).toBe('boom');
    } finally {
      console.error = original;
    }
  });
});
