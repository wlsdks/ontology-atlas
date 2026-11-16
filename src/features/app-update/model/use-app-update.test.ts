import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeUpdateAutoCheck } from './update-state';
import { useAppUpdate } from './use-app-update';

/** The automatic check must not erase the answer to a manual one. */

const check = vi.fn();
let desktop = true;

vi.mock('@/shared/lib/desktop-shell/desktop-shell', () => ({
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

  it('runs no automatic check when the person turned it off, yet a press still checks', async () => {
    writeUpdateAutoCheck('off');
    check.mockResolvedValue(null);
    const { result } = renderHook(() => useAppUpdate());
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(check).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.check(true);
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(result.current.phase.kind).toBe('current');
  });
});

const HOUR_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 4_000;

function found(version: string, downloadAndInstall = vi.fn().mockResolvedValue(undefined)) {
  return { version, body: null, downloadAndInstall };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function settle() {
  await advance(0);
}

describe('automatic checks while the app stays open', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
  });

  it('checks again after four hours of ticks without a press, and not before', async () => {
    check.mockResolvedValue(null);
    renderHook(() => useAppUpdate());
    await advance(FIRST_CHECK_MS);
    expect(check).toHaveBeenCalledTimes(1);

    await advance(4 * HOUR_MS - FIRST_CHECK_MS - 1);
    expect(check, 'checked before four hours had passed').toHaveBeenCalledTimes(1);

    await advance(HOUR_MS);
    expect(check, 'an app left open never checked again').toHaveBeenCalledTimes(2);
  });

  it('never checks on its own with automatic checks off, and resumes when turned on', async () => {
    writeUpdateAutoCheck('off');
    check.mockResolvedValue(null);
    renderHook(() => useAppUpdate());
    await advance(10 * HOUR_MS);
    expect(check).not.toHaveBeenCalled();

    writeUpdateAutoCheck('on');
    await advance(HOUR_MS);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('checks once when the window comes back after four hours', async () => {
    check.mockResolvedValue(null);
    renderHook(() => useAppUpdate());
    await advance(FIRST_CHECK_MS);
    expect(check).toHaveBeenCalledTimes(1);

    // The clock moves without timers firing, as when the machine sleeps.
    vi.setSystemTime(Date.now() + 4 * HOUR_MS);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('sends one request for two overlapping triggers', async () => {
    let answer: (value: null) => void = () => {};
    check.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    renderHook(() => useAppUpdate());
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await settle();
    expect(check).toHaveBeenCalledTimes(1);
    await act(async () => answer(null));
    await advance(FIRST_CHECK_MS);
    expect(check, 'the entry check ran although a check had just succeeded').toHaveBeenCalledTimes(1);
  });

  it('leaves a running download alone when an automatic check finds the version', async () => {
    const download = vi.fn(() => new Promise<void>(() => {}));
    check.mockResolvedValue(found('2.1.0', download));
    const { result } = renderHook(() => useAppUpdate());
    await act(async () => {
      void result.current.install();
    });
    await settle();
    expect(result.current.phase.kind).toBe('downloading');

    await advance(FIRST_CHECK_MS);
    expect(check).toHaveBeenCalledTimes(2);
    expect(result.current.phase.kind, 'an automatic check replaced the download').toBe('downloading');
  });

  it('does not offer a version waiting for restart again, and a press shows the restart', async () => {
    const update = found('2.1.0');
    check.mockResolvedValue(update);
    const { result } = renderHook(() => useAppUpdate());
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.phase).toEqual({ kind: 'ready', version: '2.1.0' });
    act(() => result.current.dismiss());
    expect(result.current.phase.kind).toBe('idle');
    expect(result.current.pendingVersion).toBe('2.1.0');

    await advance(FIRST_CHECK_MS);
    expect(check).toHaveBeenCalledTimes(2);
    expect(result.current.phase.kind, 'an automatic check offered the installed version').toBe('idle');

    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase).toEqual({ kind: 'ready', version: '2.1.0' });

    await act(async () => {
      await result.current.install();
    });
    expect(update.downloadAndInstall, 'the ready version was downloaded twice').toHaveBeenCalledTimes(1);
    expect(result.current.phase).toEqual({ kind: 'ready', version: '2.1.0' });
  });

  it('fails an automatic check silently and retries on the next tick', async () => {
    check.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(found('2.1.0'));
    const { result } = renderHook(() => useAppUpdate());
    await advance(FIRST_CHECK_MS);
    expect(check).toHaveBeenCalledTimes(1);
    expect(result.current.phase.kind).toBe('idle');
    expect(window.localStorage.getItem('app-update:last-check')).toBeNull();

    await advance(30 * 60 * 1000);
    expect(check).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toMatchObject({ kind: 'available', version: '2.1.0' });
    expect(result.current.pendingVersion).toBe('2.1.0');
  });

  it('hides the download card without dismissing the version, and a press brings it back', async () => {
    check.mockResolvedValue(found('2.1.0', vi.fn(() => new Promise<void>(() => {}))));
    const { result } = renderHook(() => useAppUpdate());
    await act(async () => {
      void result.current.install();
    });
    await settle();
    act(() => result.current.hide());
    expect(result.current.noticeHidden).toBe(true);
    expect(result.current.phase.kind).toBe('downloading');
    expect(window.localStorage.getItem('app-update:dismissed-version')).toBeNull();

    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.noticeHidden).toBe(false);
    expect(result.current.phase.kind).toBe('downloading');
  });
});
