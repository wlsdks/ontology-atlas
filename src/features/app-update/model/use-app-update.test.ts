import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The updater session lives at module scope, so every test imports a fresh copy. */
type HookModule = typeof import('./use-app-update');
type StateModule = typeof import('./update-state');

const check = vi.fn();
let desktop = true;
let platform = 'MacIntel';

vi.mock('@/shared/lib/desktop-shell/desktop-shell', () => ({
  isDesktopShell: () => desktop,
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => check(...args),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

const HOUR_MS = 60 * 60 * 1000;
const TICK_MS = 30 * 60 * 1000;
const FIRST_CHECK_MS = 4_000;
const CHECK_TIMEOUT_MS = 30_000;

let hook: HookModule;
let state: StateModule;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
  check.mockReset();
  desktop = true;
  platform = 'MacIntel';
  vi.spyOn(window.navigator, 'platform', 'get').mockImplementation(() => platform);
  window.localStorage.clear();
  hook = await import('./use-app-update');
  state = await import('./update-state');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function found(version: string, downloadAndInstall = vi.fn().mockResolvedValue(undefined)) {
  return { version, body: null, downloadAndInstall };
}

const hang = () => new Promise<never>(() => {});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function fire(target: EventTarget, type: string) {
  await act(async () => {
    target.dispatchEvent(new Event(type));
  });
  await advance(0);
}

function mount() {
  return renderHook(() => hook.useAppUpdate());
}

describe('result of a manual update check', () => {
  it('is not cleared by the background automatic check', async () => {
    check.mockRejectedValue(new Error('404'));
    const { result } = mount();
    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase).toMatchObject({ kind: 'failed', operation: 'check' });
    await advance(FIRST_CHECK_MS);
    expect(result.current.phase.kind, 'automatic check erased the answer the user asked for').toBe('failed');
  });

  it('distinguishes an install failure from a check failure', async () => {
    check.mockRejectedValue(new Error('download failed'));
    const { result } = mount();
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.phase).toMatchObject({ kind: 'failed', operation: 'install' });
  });

  it('keeps an up-to-date answer through the automatic check', async () => {
    check.mockResolvedValue(null);
    const { result } = mount();
    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase.kind).toBe('current');
    await advance(FIRST_CHECK_MS);
    expect(result.current.phase.kind, 'the up-to-date answer disappeared').toBe('current');
  });

  it('runs no automatic check on the web', async () => {
    desktop = false;
    mount();
    await advance(10 * HOUR_MS);
    expect(check).not.toHaveBeenCalled();
  });

  it('runs no automatic check when the person turned it off, yet a press still checks', async () => {
    state.writeUpdateAutoCheck('off');
    check.mockResolvedValue(null);
    const { result } = mount();
    await advance(10 * HOUR_MS);
    expect(check).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.check(true);
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(result.current.phase.kind).toBe('current');
  });

  it('runs no automatic check where the feed serves no build, yet a press still checks', async () => {
    platform = 'Win32';
    check.mockResolvedValue(null);
    const { result } = mount();
    await advance(10 * HOUR_MS);
    expect(check, 'a platform the feed does not serve was asked automatically').not.toHaveBeenCalled();
    await act(async () => {
      await result.current.check(true);
    });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('asks the plugin to give up after the check timeout', async () => {
    check.mockResolvedValue(null);
    const { result } = mount();
    await act(async () => {
      await result.current.check(true);
    });
    expect(check).toHaveBeenCalledWith({ timeout: CHECK_TIMEOUT_MS });
  });
});

describe('automatic checks while the app stays open', () => {
  it('checks again after an hour of ticks without a press, and not before', async () => {
    check.mockResolvedValue(null);
    mount();
    await advance(FIRST_CHECK_MS);
    expect(check).toHaveBeenCalledTimes(1);
    await advance(HOUR_MS - FIRST_CHECK_MS - 1);
    expect(check, 'checked before an hour had passed').toHaveBeenCalledTimes(1);
    await advance(HOUR_MS);
    expect(check, 'an app left open never checked again').toHaveBeenCalledTimes(2);
  });

  it('never checks on its own with automatic checks off, and resumes when turned on', async () => {
    state.writeUpdateAutoCheck('off');
    check.mockResolvedValue(null);
    mount();
    await advance(10 * HOUR_MS);
    expect(check).not.toHaveBeenCalled();
    state.writeUpdateAutoCheck('on');
    await advance(HOUR_MS);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('checks once when the window becomes visible after an hour, not while it stays hidden', async () => {
    check.mockResolvedValue(null);
    mount();
    await advance(FIRST_CHECK_MS);
    // The clock moves without timers firing, as when the machine sleeps.
    vi.setSystemTime(Date.now() + HOUR_MS);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await fire(document, 'visibilitychange');
    expect(check, 'a window going hidden asked the feed').toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    await fire(document, 'visibilitychange');
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('checks once when the window gains focus after an hour', async () => {
    check.mockResolvedValue(null);
    mount();
    await advance(FIRST_CHECK_MS);
    vi.setSystemTime(Date.now() + HOUR_MS);
    await fire(window, 'focus');
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('sends one request for two overlapping triggers', async () => {
    let answer: (value: null) => void = () => {};
    check.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    mount();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await advance(0);
    expect(check).toHaveBeenCalledTimes(1);
    await act(async () => answer(null));
    await advance(FIRST_CHECK_MS);
    expect(check, 'the entry check ran although a check had just succeeded').toHaveBeenCalledTimes(1);
  });

  it('sends at most one request per tick to a failing feed, then backs off to the interval', async () => {
    check.mockRejectedValue(new Error('offline'));
    const { result } = mount();
    await advance(FIRST_CHECK_MS);
    for (let i = 0; i < 10; i += 1) {
      await fire(window, 'focus');
      await advance(1_000);
    }
    expect(check, 'each window return retried a failing feed').toHaveBeenCalledTimes(1);
    expect(result.current.phase.kind, 'an automatic failure was shown').toBe('idle');
    expect(window.localStorage.getItem('app-update:last-check')).toBeNull();

    await advance(TICK_MS);
    expect(check, 'the failing feed was not retried one tick later').toHaveBeenCalledTimes(2);
    await advance(TICK_MS);
    expect(check, 'two failures in a row still retried every tick').toHaveBeenCalledTimes(2);
    await advance(HOUR_MS - TICK_MS);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('keeps the success in memory when storage refuses writes', async () => {
    check.mockResolvedValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    mount();
    await advance(FIRST_CHECK_MS);
    for (let i = 0; i < 10; i += 1) {
      await fire(window, 'focus');
      await advance(1_000);
    }
    await advance(TICK_MS);
    expect(check, 'an unwritable store made every return a request').toHaveBeenCalledTimes(1);
  });

  it('frees the check slot after an unanswered request, and three presses send one request', async () => {
    check.mockImplementationOnce(hang).mockResolvedValue(null);
    const { result } = mount();
    await advance(FIRST_CHECK_MS);
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        void result.current.check(true);
      });
    }
    expect(result.current.phase.kind, 'the press showed nothing while it waited').toBe('checking');
    expect(check).toHaveBeenCalledTimes(1);
    await advance(CHECK_TIMEOUT_MS);
    expect(check, 'three presses queued three requests').toHaveBeenCalledTimes(2);
    expect(result.current.phase.kind).toBe('current');
  });

  it('leaves a running download alone when an automatic check finds the version', async () => {
    check.mockResolvedValue(found('2.1.0', vi.fn(hang)));
    const { result } = mount();
    await act(async () => {
      void result.current.install();
    });
    await advance(0);
    expect(result.current.phase.kind).toBe('downloading');
    await advance(FIRST_CHECK_MS);
    expect(check).toHaveBeenCalledTimes(2);
    expect(result.current.phase.kind, 'an automatic check replaced the download').toBe('downloading');
  });

  it('lets no press restart a download it is already doing', async () => {
    let answerInstall: (value: unknown) => void = () => {};
    const download = vi.fn(hang);
    check.mockImplementationOnce(() => new Promise((resolve) => (answerInstall = resolve))).mockResolvedValue(found('2.1.0', download));
    const { result } = mount();
    await act(async () => {
      void result.current.install();
    });
    await act(async () => {
      void result.current.check(true);
    });
    await act(async () => answerInstall(found('2.1.0', download)));
    await advance(0);
    expect(result.current.phase.kind, 'a press replaced the download with an offer').toBe('downloading');
    expect(check).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('keeps the restart offer when a press fails while a version is ready', async () => {
    check.mockResolvedValueOnce(found('2.1.0')).mockRejectedValueOnce(new Error('offline'));
    const { result } = mount();
    await act(async () => {
      await result.current.install();
    });
    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase, 'a failed check hid the restart').toEqual({ kind: 'ready', version: '2.1.0' });
  });

  it('does not offer a version waiting for restart again, and a press shows the restart', async () => {
    const update = found('2.1.0');
    check.mockResolvedValue(update);
    const { result } = mount();
    await act(async () => {
      await result.current.install();
    });
    act(() => result.current.dismiss());
    expect(result.current.phase.kind).toBe('idle');
    expect(result.current.pendingVersion).toBe('2.1.0');
    await advance(FIRST_CHECK_MS);
    expect(result.current.phase.kind, 'an automatic check offered the installed version').toBe('idle');
    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase).toEqual({ kind: 'ready', version: '2.1.0' });
    await act(async () => {
      await result.current.install();
    });
    expect(update.downloadAndInstall, 'the ready version was downloaded twice').toHaveBeenCalledTimes(1);
  });

  it('remembers an installed version across a remount, as when the language changes', async () => {
    const update = found('2.1.0');
    check.mockResolvedValue(update);
    const first = mount();
    await act(async () => {
      await first.result.current.install();
    });
    first.unmount();
    const second = mount();
    expect(second.result.current.phase).toEqual({ kind: 'ready', version: '2.1.0' });
    expect(second.result.current.pendingVersion).toBe('2.1.0');
    expect(second.result.current.readyVersion).toBe('2.1.0');
    await advance(5 * HOUR_MS);
    await act(async () => {
      await second.result.current.install();
    });
    expect(update.downloadAndInstall, 'the remount downloaded the installed version again').toHaveBeenCalledTimes(1);
  });

  it('does not start a second download after a remount mid-download', async () => {
    const download = vi.fn(hang);
    check.mockResolvedValue(found('2.1.0', download));
    const first = mount();
    await act(async () => {
      void first.result.current.install();
    });
    await advance(0);
    first.unmount();
    const second = mount();
    expect(second.result.current.phase.kind).toBe('downloading');
    await act(async () => {
      void second.result.current.install();
    });
    await advance(0);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('shows a newer version on the card already offering an older one', async () => {
    check.mockResolvedValueOnce(found('2.1.0')).mockResolvedValue(found('2.2.0'));
    const { result } = mount();
    await advance(FIRST_CHECK_MS);
    expect(result.current.phase).toMatchObject({ kind: 'available', version: '2.1.0' });
    await advance(5 * HOUR_MS);
    expect(result.current.phase).toMatchObject({ kind: 'available', version: '2.2.0' });
    expect(result.current.pendingVersion).toBe('2.2.0');
  });

  it('silences a version put off with Later and speaks again for a newer one', async () => {
    check.mockResolvedValueOnce(found('2.1.0')).mockResolvedValueOnce(found('2.1.0')).mockResolvedValue(found('2.2.0'));
    const { result } = mount();
    await advance(FIRST_CHECK_MS);
    act(() => result.current.dismiss());
    expect(window.localStorage.getItem('app-update:dismissed-version')).toBe('2.1.0');
    expect(result.current.dismissedVersion).toBe('2.1.0');
    await advance(HOUR_MS + TICK_MS);
    expect(check).toHaveBeenCalledTimes(2);
    expect(result.current.phase.kind, 'the version put off spoke again').toBe('idle');
    await advance(HOUR_MS + TICK_MS);
    expect(result.current.phase).toMatchObject({ kind: 'available', version: '2.2.0' });
  });

  it('fails an automatic check silently and retries on the next tick', async () => {
    check.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(found('2.1.0'));
    const start = Date.now();
    const { result } = mount();
    await advance(FIRST_CHECK_MS);
    expect(result.current.phase.kind).toBe('idle');
    await advance(TICK_MS);
    expect(check).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toMatchObject({ kind: 'available', version: '2.1.0' });
    expect(result.current.lastCheckedAt, 'the settings line cannot see the silent success').toBe(start + TICK_MS);
  });

  it('clears the pending version when a check says current or Install finds nothing', async () => {
    check.mockResolvedValueOnce(found('2.1.0')).mockResolvedValueOnce(null).mockResolvedValueOnce(found('2.1.0')).mockResolvedValueOnce(null);
    const { result } = mount();
    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.pendingVersion).toBe('2.1.0');
    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.pendingVersion).toBeNull();
    await act(async () => {
      await result.current.check(true);
    });
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.pendingVersion).toBeNull();
  });

  it('hides the download card without dismissing the version, and a press brings it back', async () => {
    check.mockResolvedValue(found('2.1.0', vi.fn(hang)));
    const { result } = mount();
    await act(async () => {
      void result.current.install();
    });
    await advance(0);
    act(() => result.current.hide());
    expect(result.current.noticeHidden).toBe(true);
    expect(result.current.phase.kind).toBe('downloading');
    expect(window.localStorage.getItem('app-update:dismissed-version')).toBeNull();
    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.noticeHidden).toBe(false);
  });
});

describe('usePendingUpdate', () => {
  it('does not re-render its reader for download progress', async () => {
    let onEvent: (event: unknown) => void = () => {};
    const download = vi.fn((callback: (event: unknown) => void) => {
      onEvent = callback;
      return hang();
    });
    check.mockResolvedValue(found('2.1.0', download));
    const { result } = mount();
    let renders = 0;
    const reader = renderHook(() => {
      renders += 1;
      return hook.usePendingUpdate();
    });
    await act(async () => {
      void result.current.install();
    });
    await advance(0);
    const afterPending = renders;
    expect(reader.result.current.pendingVersion).toBe('2.1.0');
    act(() => onEvent({ event: 'Started', data: { contentLength: 100 } }));
    for (let i = 0; i < 10; i += 1) act(() => onEvent({ event: 'Progress', data: { chunkLength: 10 } }));
    expect(result.current.phase).toMatchObject({ kind: 'downloading', received: 100 });
    expect(renders, 'progress chunks re-rendered the settings trigger').toBe(afterPending);
  });
});
