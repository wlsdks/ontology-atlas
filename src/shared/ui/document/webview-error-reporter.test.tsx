import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: true,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

/** Fresh modules per test so the per-page-load report counter starts at zero. */
async function mountReporter() {
  vi.resetModules();
  const { WebviewErrorReporter } = await import('./webview-error-reporter');
  render(<WebviewErrorReporter />);
}

describe('WebviewErrorReporter', () => {
  beforeEach(() => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockReset();
    tauriApiMock.invoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('forwards a window error with the source, line and column the event carried', async () => {
    await mountReporter();

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'ReferenceError: x is not defined',
        filename: 'https://app/topology.js',
        lineno: 42,
        colno: 7,
        error: new Error('ReferenceError: x is not defined'),
      }),
    );

    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1);
    const [command, args] = tauriApiMock.invoke.mock.calls[0];
    expect(command).toBe('log_webview_error');
    expect(args).toMatchObject({
      message: 'ReferenceError: x is not defined',
      source: 'https://app/topology.js',
      line: 42,
      column: 7,
      kind: 'error',
    });
  });

  it('forwards an unhandled rejection', async () => {
    await mountReporter();

    // jsdom does not construct PromiseRejectionEvent, so the shape is supplied directly.
    const event = new Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('vault read rejected');
    window.dispatchEvent(event);

    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1);
    const [, args] = tauriApiMock.invoke.mock.calls[0];
    expect(args).toMatchObject({
      message: 'vault read rejected',
      source: null,
      line: null,
      column: null,
      kind: 'unhandledrejection',
    });
  });

  it('stops after twenty reports in one page load', async () => {
    await mountReporter();

    for (let index = 0; index < 25; index += 1) {
      window.dispatchEvent(new ErrorEvent('error', { message: `loop ${index}` }));
    }

    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(20);
  });
});
