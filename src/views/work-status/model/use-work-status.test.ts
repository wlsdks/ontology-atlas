import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WATCH_INTERVAL_MS, useWorkStatus } from './use-work-status';

const bridge = vi.hoisted(() => ({
  readWorkStatus: vi.fn(),
  readWorkStatusFingerprint: vi.fn(),
}));
vi.mock('@/shared/lib/work-status/tauri-work-status', () => bridge);

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Lets the hook's awaited bridge calls settle without advancing the watch interval. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useWorkStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    bridge.readWorkStatus.mockResolvedValue({ status: 'ready', root: '/repo', repository: 'repo', host: null, baseBranch: 'main', worktrees: [] });
    bridge.readWorkStatusFingerprint.mockResolvedValue('same');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    bridge.readWorkStatus.mockReset();
    bridge.readWorkStatusFingerprint.mockReset();
  });

  it('stops asking Git while the screen is hidden and reads once when it returns', async () => {
    renderHook(() => useWorkStatus('/repo'));
    await flush();
    expect(bridge.readWorkStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCH_INTERVAL_MS * 2);
    });
    const visibleDigests = bridge.readWorkStatusFingerprint.mock.calls.length;
    expect(visibleDigests).toBeGreaterThan(1);

    act(() => setVisibility('hidden'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCH_INTERVAL_MS * 10);
    });
    expect(bridge.readWorkStatusFingerprint).toHaveBeenCalledTimes(visibleDigests);
    expect(bridge.readWorkStatus).toHaveBeenCalledTimes(1);

    act(() => setVisibility('visible'));
    await flush();
    expect(bridge.readWorkStatus).toHaveBeenCalledTimes(2);
  });

  it('asks nothing after unmount', async () => {
    const { unmount } = renderHook(() => useWorkStatus('/repo'));
    await flush();
    unmount();
    const digests = bridge.readWorkStatusFingerprint.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCH_INTERVAL_MS * 10);
    });
    act(() => setVisibility('visible'));
    expect(bridge.readWorkStatusFingerprint).toHaveBeenCalledTimes(digests);
    expect(bridge.readWorkStatus).toHaveBeenCalledTimes(1);
  });

  it('rereads when the digest changes', async () => {
    renderHook(() => useWorkStatus('/repo'));
    await flush();
    bridge.readWorkStatusFingerprint.mockResolvedValue('moved');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WATCH_INTERVAL_MS);
    });
    expect(bridge.readWorkStatus).toHaveBeenCalledTimes(2);
  });
});
