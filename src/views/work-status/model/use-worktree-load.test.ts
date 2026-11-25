import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FULL_SAMPLES } from '@/shared/lib/work-status/signals/load';
import { LOAD_SAMPLE_MS, useWorktreeLoad } from './use-worktree-load';

const native = vi.hoisted(() => ({ readLoad: vi.fn(), setLoadRead: vi.fn() }));
vi.mock('@/shared/lib/work-status/tauri-work-status', () => native);

const settle = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const mac = { memoryUsedBytes: 1, memoryTotalBytes: 2, pressure: 'normal', cpuCores: 10, coreCount: 10, gpuPercent: null };
const SAMPLE = { status: 'read', worktrees: { a: { memoryBytes: 5, cpuCores: 1, groups: [], agentsElsewhere: [] } }, outside: [], mac };
const FAILED = { status: 'failed', worktrees: {}, outside: [], mac: null };

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useWorktreeLoad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    native.readLoad.mockReset().mockResolvedValue(SAMPLE);
    native.setLoadRead.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('samples once every five seconds while visible, after telling Rust it is on', async () => {
    const { result } = renderHook(() => useWorktreeLoad('/repo', true));
    await settle(0);
    expect(result.current).toMatchObject({ status: 'read', sample: SAMPLE });
    await settle(LOAD_SAMPLE_MS * 4);
    expect(native.readLoad).toHaveBeenCalledTimes(5);
    expect(native.setLoadRead.mock.calls).toEqual([[true]]);
  });

  it('never runs two samples together, however long one takes', async () => {
    let answer: (value: unknown) => void = () => undefined;
    native.readLoad.mockReturnValue(new Promise(resolve => (answer = resolve)));
    renderHook(() => useWorktreeLoad('/repo', true));
    await settle(LOAD_SAMPLE_MS * 10);
    setVisibility('hidden');
    setVisibility('visible');
    await settle(LOAD_SAMPLE_MS * 10);
    expect(native.readLoad).toHaveBeenCalledTimes(1);
    answer(SAMPLE);
    await settle(0);
  });

  it('samples nothing while hidden and tells Rust to drop its sample; shown, it tells Rust again first', async () => {
    renderHook(() => useWorktreeLoad('/repo', true));
    await settle(0);
    setVisibility('hidden');
    await settle(LOAD_SAMPLE_MS * 30);
    expect(native.readLoad).toHaveBeenCalledTimes(1);
    expect(native.setLoadRead.mock.calls).toEqual([[true], [false]]);

    setVisibility('visible');
    await settle(0);
    expect(native.setLoadRead.mock.calls).toEqual([[true], [false], [true]]);
    expect(native.readLoad).toHaveBeenCalledTimes(2);
  });

  it('shows a failed sample as failed, with no number and no header warning', async () => {
    native.readLoad.mockResolvedValue({ ...SAMPLE, mac: { ...mac, gpuPercent: 99 } });
    const { result } = renderHook(() => useWorktreeLoad('/repo', true));
    await settle(LOAD_SAMPLE_MS * (FULL_SAMPLES - 1));
    expect(result.current.pressure.gpu.warning).toBe(true);
    native.readLoad.mockResolvedValue(FAILED);
    await settle(LOAD_SAMPLE_MS);
    expect(result.current).toMatchObject({ status: 'failed', sample: null });
    expect(result.current.pressure.gpu.warning).toBe(false);
    native.readLoad.mockRejectedValue(new Error('read failed'));
    await settle(LOAD_SAMPLE_MS);
    expect(result.current.status).toBe('failed');
  });

  it('switched off, samples nothing, tells Rust, and holds no sample', async () => {
    const { result, rerender } = renderHook(({ on }) => useWorktreeLoad('/repo', on), { initialProps: { on: true } });
    await settle(0);
    rerender({ on: false });
    await settle(LOAD_SAMPLE_MS * 30);
    expect(native.readLoad).toHaveBeenCalledTimes(1);
    expect(native.setLoadRead).toHaveBeenLastCalledWith(false);
    expect(result.current).toMatchObject({ status: 'off', sample: null });
  });

  it('says nothing and stops sampling where this system has no load read', async () => {
    native.readLoad.mockResolvedValue(null);
    const { result } = renderHook(() => useWorktreeLoad('/repo', true));
    await settle(LOAD_SAMPLE_MS * 10);
    expect(result.current.status).toBe('unsupported');
    expect(native.readLoad).toHaveBeenCalledTimes(3);
  });

  it('asks again, telling Rust on, after one null answer from a switch held off', async () => {
    native.readLoad.mockResolvedValueOnce(null).mockResolvedValue(SAMPLE);
    const { result } = renderHook(() => useWorktreeLoad('/repo', true));
    await settle(LOAD_SAMPLE_MS * 2);
    expect(result.current.status).toBe('read');
    expect(native.setLoadRead.mock.calls.filter(([on]) => on === true).length).toBeGreaterThanOrEqual(2);
  });
});
