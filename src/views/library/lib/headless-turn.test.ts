import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AcpTurnCompletion } from '@/features/acp-session';

import { PASS_TIMEOUT_MS, runHeadlessTurn, type HeadlessSession } from './headless-turn';

const never = <T,>() => new Promise<T>(() => {});

function fakeSession(overrides: Partial<HeadlessSession> = {}) {
  return {
    start: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    cancel: vi.fn(),
    stop: vi.fn(async () => {}),
    ...overrides,
  };
}

function signal() {
  let fire!: () => void;
  const promise = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { promise, fire };
}

const completed: AcpTurnCompletion = {
  runtimeId: 'claude-acp',
  sessionId: 's1',
  vaultRoot: '/vault',
  userEventId: 'u1',
  text: 'brief',
  startedAt: '2026-09-26T00:00:00.000Z',
  endedAt: '2026-09-26T00:01:00.000Z',
  outcome: 'completed',
  stopReason: 'end_turn',
  events: [{ kind: 'agent', id: 'a1', text: 'One binding gap' }],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('one headless agent turn', () => {
  it('ends at once when the person stops it while the handshake never answers, and closes the session', async () => {
    // The desktop bridge's `acp_start` held open: `start()` never settles (probe, 2026-09-25).
    const session = fakeSession({ start: vi.fn(() => never<void>()) });
    const stop = signal();
    const turn = runHeadlessTurn({ session: () => session, status: () => 'starting', brief: 'brief', aborted: stop.promise, completion: never() });
    stop.fire();
    await expect(turn).resolves.toEqual({ failed: true, stopped: true, completion: null });
    expect(session.send).not.toHaveBeenCalled();
    expect(session.stop).toHaveBeenCalledTimes(1);
  });

  it('gives up a handshake that never answers at the pass ceiling, even when nobody stops it', async () => {
    vi.useFakeTimers();
    const session = fakeSession({ start: vi.fn(() => never<void>()) });
    let settled = false;
    const turn = runHeadlessTurn({ session: () => session, status: () => 'starting', brief: 'brief', aborted: never(), completion: never() })
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(PASS_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(turn).resolves.toEqual({ failed: true, stopped: false, completion: null });
    expect(session.stop).toHaveBeenCalledTimes(1);
  });

  it('cancels a turn already on the wire when the person stops it', async () => {
    const session = fakeSession({ send: vi.fn(() => never<void>()) });
    const stop = signal();
    const turn = runHeadlessTurn({ session: () => session, status: () => 'ready', brief: 'brief', aborted: stop.promise, completion: never() });
    await vi.waitFor(() => expect(session.send).toHaveBeenCalledWith('brief'));
    stop.fire();
    await expect(turn).resolves.toMatchObject({ failed: true, stopped: true });
    expect(session.cancel).toHaveBeenCalled();
    expect(session.stop).toHaveBeenCalledTimes(1);
  });

  it('returns the completion of a turn that finished', async () => {
    const session = fakeSession();
    const result = await runHeadlessTurn({
      session: () => session,
      status: () => 'ready',
      brief: 'brief',
      aborted: never(),
      completion: Promise.resolve(completed),
    });
    expect(result).toEqual({ failed: false, stopped: false, completion: completed });
    expect(session.cancel).not.toHaveBeenCalled();
    expect(session.stop).toHaveBeenCalledTimes(1);
  });

  it('does not hold the lock for a session that will not close', async () => {
    vi.useFakeTimers();
    const session = fakeSession({ start: vi.fn(() => never<void>()), stop: vi.fn(() => never<void>()) });
    const stop = signal();
    let settled = false;
    const turn = runHeadlessTurn({
      session: () => session,
      status: () => 'starting',
      brief: 'brief',
      aborted: stop.promise,
      completion: never(),
      stopGraceMs: 1_000,
    }).finally(() => {
      settled = true;
    });
    stop.fire();
    await vi.advanceTimersByTimeAsync(999);
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(turn).resolves.toMatchObject({ failed: true, stopped: true });
  });
});
