import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSIONS_ASK_MS, useAgentSessions } from './use-agent-sessions';

const native = vi.hoisted(() => ({ readAgentSessions: vi.fn(), setAgentSessionsRead: vi.fn() }));
vi.mock('@/shared/lib/work-status/tauri-work-status', () => native);

const WAITING = { status: 'read', rows: [{ worktreeId: 'feat-a', pid: 41, state: 'waitingApproval' }] };
const settle = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('useAgentSessions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    native.readAgentSessions.mockReset().mockResolvedValue(WAITING);
    native.setAgentSessionsRead.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => vi.useRealTimers());

  it('asks while the read is on and hands over the rows with how the read went', async () => {
    const { result } = renderHook(() => useAgentSessions('/repo', true));
    expect(result.current.status).toBe('pending');
    await settle(0);
    expect(result.current).toMatchObject(WAITING);
    await settle(SESSIONS_ASK_MS * 3);
    expect(native.readAgentSessions).toHaveBeenCalledTimes(4);
    expect(native.setAgentSessionsRead.mock.calls).toEqual([[true]]);
  });

  it('asks nothing while the read is off, however long the screen stays open', async () => {
    const { result } = renderHook(() => useAgentSessions('/repo', false));
    await settle(SESSIONS_ASK_MS * 30);
    expect(native.readAgentSessions).not.toHaveBeenCalled();
    expect(native.setAgentSessionsRead.mock.calls).toEqual([[false]]);
    expect(result.current).toEqual({ rows: [], status: 'off' });
  });

  it('asks nothing while the screen is hidden, and asks again once it shows', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    renderHook(() => useAgentSessions('/repo', true));
    await settle(SESSIONS_ASK_MS * 30);
    expect(native.readAgentSessions).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await settle(SESSIONS_ASK_MS);
    expect(native.readAgentSessions).toHaveBeenCalledTimes(1);
  });

  it('stops asking, drops its rows and tells Rust when the read is switched off', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useAgentSessions('/repo', enabled), { initialProps: { enabled: true } });
    await settle(0);
    expect(result.current.rows).toHaveLength(1);

    rerender({ enabled: false });
    const asked = native.readAgentSessions.mock.calls.length;
    await settle(SESSIONS_ASK_MS * 30);
    expect(native.readAgentSessions).toHaveBeenCalledTimes(asked);
    expect(native.setAgentSessionsRead.mock.calls).toEqual([[true], [false]]);
    expect(result.current).toEqual({ rows: [], status: 'off' });
  });

  it('starts from nothing when the read is switched on again', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useAgentSessions('/repo', enabled), { initialProps: { enabled: true } });
    await settle(0);
    rerender({ enabled: false });
    native.readAgentSessions.mockReturnValue(new Promise(() => undefined));
    rerender({ enabled: true });
    expect(result.current).toEqual({ rows: [], status: 'pending' });
  });

  it('keeps what it had while Rust answers that a read is running', async () => {
    const { result } = renderHook(() => useAgentSessions('/repo', true));
    await settle(0);
    native.readAgentSessions.mockResolvedValue(null);
    await settle(SESSIONS_ASK_MS);
    expect(result.current).toMatchObject(WAITING);
  });
});
