import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppUpdate } from './use-app-update';

/**
 * **The app must not erase, behind the scenes, an answer the user asked for.**
 *
 * Caught by measurement in the pre-launch review, 2026-08-20: pressing "check for updates" in the
 * installed app had the marker catching the result (`failed`) while **that sentence was not on
 * screen.** The cause is the **automatic check** that runs four seconds after mount — the automatic
 * path returns to `idle` to pass a failure over quietly, and that erases the answer the user just
 * received along with it.
 *
 * From the user's side it becomes "I pressed it, something appeared, and it vanished without a word".
 * The opposite of the honesty rule this repository set for degraded cards.
 */

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

    // The automatic check scheduled four seconds after mount now fires.
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
