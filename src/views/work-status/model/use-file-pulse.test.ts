import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PULSE_ASK_MS, useFilePulse } from './use-file-pulse';

const native = vi.hoisted(() => ({ readFilePulse: vi.fn(), pauseFilePulse: vi.fn(), setFilePulseRead: vi.fn() }));
vi.mock('@/shared/lib/work-status/tauri-work-status', () => native);

const settle = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const IDS = ['feat-a', 'feat-b'];
const quiet = { worktrees: { 'feat-a': { watched: true, lastChangeAtMs: null, steps: [] }, 'feat-b': { watched: true, lastChangeAtMs: null, steps: [] } } };
const changedA = (atMs: number) => ({
  worktrees: { ...quiet.worktrees, 'feat-a': { watched: true, lastChangeAtMs: atMs, steps: [{ atMs: atMs - (atMs % 10_000), count: 1 }] } },
});

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useFilePulse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    native.readFilePulse.mockReset().mockResolvedValue(quiet);
    native.pauseFilePulse.mockReset().mockResolvedValue(undefined);
    native.setFilePulseRead.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks every two seconds for the rooms drawn, and flashes a room once per answer with a new change', async () => {
    const { result } = renderHook(() => useFilePulse('/repo', IDS, true));
    await settle(0);
    expect(result.current.status).toBe('read');
    expect(result.current.flashes.get('feat-a')?.count).toBe(0);
    expect(native.readFilePulse.mock.calls[0]).toEqual(['/repo', IDS]);

    native.readFilePulse.mockResolvedValue(changedA(Date.now()));
    await settle(PULSE_ASK_MS);
    expect(result.current.flashes.get('feat-a')?.count).toBe(1);
    expect(result.current.flashes.get('feat-b')?.count).toBe(0);
    await settle(PULSE_ASK_MS * 3);
    expect(result.current.flashes.get('feat-a')?.count).toBe(1);
    expect(native.readFilePulse).toHaveBeenCalledTimes(5);
  });

  it('keeps its object when an answer changes nothing, so nothing downstream redraws', async () => {
    const { result } = renderHook(() => useFilePulse('/repo', IDS, true));
    await settle(0);
    const first = result.current;
    await settle(PULSE_ASK_MS * 2);
    expect(result.current).toBe(first);
  });

  it('ends the watcher while hidden, asks nothing, and keeps the counts it had for when it shows', async () => {
    native.readFilePulse.mockResolvedValue(changedA(Date.now()));
    const { result } = renderHook(() => useFilePulse('/repo', IDS, true));
    await settle(0);
    setVisibility('hidden');
    const asked = native.readFilePulse.mock.calls.length;
    await settle(PULSE_ASK_MS * 30);
    expect(native.readFilePulse).toHaveBeenCalledTimes(asked);
    expect(native.pauseFilePulse).toHaveBeenCalledTimes(1);
    expect(native.setFilePulseRead.mock.calls).toEqual([[true]]);
    expect(result.current.worktrees.get('feat-a')?.lastChangeAtMs).not.toBeNull();

    setVisibility('visible');
    await settle(0);
    expect(native.readFilePulse).toHaveBeenCalledTimes(asked + 1);
  });

  it('starts no watcher on a screen hidden from the start', async () => {
    visibility = 'hidden';
    renderHook(() => useFilePulse('/repo', IDS, true));
    await settle(PULSE_ASK_MS * 30);
    expect(native.readFilePulse).not.toHaveBeenCalled();
  });

  it('switched off, tells Rust to drop every count, asks nothing and holds no count', async () => {
    const { result, rerender } = renderHook(({ on }) => useFilePulse('/repo', IDS, on), { initialProps: { on: true } });
    await settle(0);
    rerender({ on: false });
    const asked = native.readFilePulse.mock.calls.length;
    await settle(PULSE_ASK_MS * 30);
    expect(native.readFilePulse).toHaveBeenCalledTimes(asked);
    expect(native.setFilePulseRead.mock.calls).toEqual([[true], [false]]);
    expect(result.current).toMatchObject({ status: 'off', worktrees: new Map(), flashes: new Map() });
  });

  it('drops an answer that lands after the pulse was switched off', async () => {
    let answer: (value: unknown) => void = () => undefined;
    native.readFilePulse.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const { result, rerender } = renderHook(({ on }) => useFilePulse('/repo', IDS, on), { initialProps: { on: true } });
    await settle(0);
    rerender({ on: false });
    answer(changedA(Date.now()));
    await settle(0);
    rerender({ on: true });
    expect(result.current.worktrees.size).toBe(0);
  });

  it('says nothing and stops asking where this system has no pulse', async () => {
    native.readFilePulse.mockResolvedValue(null);
    const { result } = renderHook(() => useFilePulse('/repo', IDS, true));
    await settle(PULSE_ASK_MS * 10);
    expect(result.current.status).toBe('unsupported');
    expect(native.readFilePulse).toHaveBeenCalledTimes(1);
  });

  it('sends Rust only the repository and worktree ids, never a file name', async () => {
    renderHook(() => useFilePulse('/repo', IDS, true));
    await settle(PULSE_ASK_MS * 2);
    for (const call of native.readFilePulse.mock.calls) expect(call).toEqual(['/repo', IDS]);
  });
});
