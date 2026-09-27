import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppUpdate } from './use-app-update';

/** The automatic check must not erase the answer to a manual one. */

const check = vi.fn();
let desktop = true;

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => desktop,
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => check(...args),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  check.mockReset();
  desktop = true;
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('result of a manual update check', () => {
  it('is not cleared by the background automatic check', async () => {
    // The endpoint returning 404 — this repository's real state today (zero final releases).
    check.mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useAppUpdate());

    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase.kind, 'manual check should report the failure').toBe('failed');
    expect(result.current.phase).toMatchObject({ operation: 'check' });

    // The automatic check scheduled after mount fires.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        result.current.phase.kind,
        'automatic check erased the answer the user asked for',
      ).toBe('failed');
    });
  });

  it('distinguishes an install failure from a check failure', async () => {
    check.mockRejectedValue(new Error('download failed'));
    const { result } = renderHook(() => useAppUpdate());

    await act(async () => {
      await result.current.install();
    });

    expect(result.current.phase).toMatchObject({
      kind: 'failed',
      operation: 'install',
    });
  });

  it('keeps an up-to-date answer the same way', async () => {
    check.mockResolvedValue(null);
    const { result } = renderHook(() => useAppUpdate());

    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase.kind).toBe('current');

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.phase.kind, 'the up-to-date answer disappeared').toBe('current');
    });
  });

  it('runs no automatic check on the web', async () => {
    desktop = false;
    renderHook(() => useAppUpdate());
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(check).not.toHaveBeenCalled();
  });
});
