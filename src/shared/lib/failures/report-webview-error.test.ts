import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

/**
 * A fresh module per test: the per-page-load counter is module state, and a test
 * that inherited it from its neighbour would prove nothing about the cap.
 */
async function freshModule() {
  vi.resetModules();
  return import('./report-webview-error');
}

describe('report-webview-error', () => {
  beforeEach(() => {
    tauriApiMock.invoke.mockReset();
    tauriApiMock.invoke.mockResolvedValue(undefined);
    tauriApiMock.runtimeAvailable = true;
  });

  afterEach(() => {
    tauriApiMock.runtimeAvailable = false;
  });

  it('sends the exact argument names the Rust command declares', async () => {
    const { reportWebviewError } = await freshModule();
    const error = new Error('canvas exploded');

    reportWebviewError('render', error);

    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1);
    const [command, args] = tauriApiMock.invoke.mock.calls[0];
    expect(command).toBe('log_webview_error');
    // Renaming any of these six silently drops the field on the Rust side.
    expect(Object.keys(args as Record<string, unknown>).sort()).toEqual([
      'column',
      'kind',
      'line',
      'message',
      'source',
      'stack',
    ]);
    expect(args).toMatchObject({
      message: 'canvas exploded',
      source: null,
      line: null,
      column: null,
      kind: 'render',
    });
    expect(typeof (args as { stack: unknown }).stack).toBe('string');
  });

  it('stays silent outside the desktop runtime', async () => {
    tauriApiMock.runtimeAvailable = false;
    const { reportWebviewError } = await freshModule();

    reportWebviewError('error', new Error('web only'));

    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('reports at most twenty times per page load — a crash loop is not an IPC flood', async () => {
    const { reportWebviewError } = await freshModule();

    for (let index = 0; index < 25; index += 1) {
      reportWebviewError('error', new Error(`loop ${index}`));
    }

    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(20);
  });

  it('never throws when the runtime rejects the call', async () => {
    tauriApiMock.invoke.mockRejectedValue(new Error('no such command'));
    const { reportWebviewError } = await freshModule();

    expect(() => reportWebviewError('unhandledrejection', 'plain string reason')).not.toThrow();
    expect(tauriApiMock.invoke).toHaveBeenCalledTimes(1);
  });
});
