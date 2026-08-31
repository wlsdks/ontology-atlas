import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const reportWebviewError = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/report-webview-error', () => ({
  reportWebviewError,
  sendWebviewErrorReport: vi.fn(),
}));

import { ErrorBoundary } from './error-boundary';
import { WidgetErrorFallback } from './widget-error-fallback';

function Exploding(): React.ReactElement {
  throw new Error('renderer lost its context');
}

function Boundary() {
  return (
    <ErrorBoundary
      fallback={({ error, reset }) => (
        <WidgetErrorFallback
          error={error}
          onReset={reset}
          title="The map could not be drawn."
          body="The rest of the screen still works."
          retryLabel="Try again"
        />
      )}
    >
      <Exploding />
    </ErrorBoundary>
  );
}

describe('WidgetErrorFallback', () => {
  afterEach(() => {
    cleanup();
    reportWebviewError.mockClear();
    vi.restoreAllMocks();
  });

  it('replaces only the failed widget and offers the boundary its retry', () => {
    // The boundary itself already logs; silence the expected React error noise.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <div>
        <p>the rest of the page</p>
        <Boundary />
      </div>,
    );

    // The neighbour survived — that is the whole point of a per-widget boundary.
    expect(screen.getByText('the rest of the page')).toBeTruthy();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The map could not be drawn.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    // The stack is for the log, never for the screen.
    expect(alert.textContent).not.toContain('renderer lost its context');
  });

  it('forwards the caught error to the app log as a render failure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Boundary />);

    expect(reportWebviewError).toHaveBeenCalledTimes(1);
    const [kind, error] = reportWebviewError.mock.calls[0];
    expect(kind).toBe('render');
    expect((error as Error).message).toBe('renderer lost its context');
  });
});
