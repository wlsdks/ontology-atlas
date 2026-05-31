import { describe, it, expect } from 'vitest';
import { nextPollDelay, DEFAULT_POLL_CADENCE, createAdaptivePoller } from './poll-cadence';

// microtask flush for the async poll continuation
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function pollerHarness() {
  const timers: Array<{ cb: () => void; ms: number; cleared: boolean }> = [];
  const resolvers: Array<(v: boolean) => void> = [];
  const poll = () => new Promise<boolean>((res) => resolvers.push(res));
  const poller = createAdaptivePoller({
    poll,
    now: () => 0,
    setTimer: (cb, ms) => {
      timers.push({ cb, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimer: (h) => {
      const t = timers[h as number];
      if (t) t.cleared = true;
    },
  });
  return { timers, resolvers, poller };
}

describe('createAdaptivePoller', () => {
  it('reschedules after each completed poll (one continuous loop)', async () => {
    const { timers, resolvers, poller } = pollerHarness();
    poller.start();
    expect(timers.length).toBe(1);
    timers[0].cb(); // fire → poll() in-flight
    resolvers[0](false); // no change
    await flush();
    expect(timers.length).toBe(2); // rescheduled exactly once
  });

  it('stop during an in-flight poll then restart leaves NO orphan loop (the gate bug)', async () => {
    const { timers, resolvers, poller } = pollerHarness();
    poller.start(); // timer 0, generation 1
    timers[0].cb(); // fire 0 → poll() in-flight (suspended)
    poller.stop(); // generation 2
    poller.start(); // generation 3 → timer 1
    expect(timers.length).toBe(2);
    resolvers[0](true); // the in-flight poll from gen 1 resolves AFTER stop+restart
    await flush();
    // gen-1 callback must bail (stale generation) and NOT schedule a 3rd timer
    expect(timers.length).toBe(2);
  });

  it('stop prevents any further reschedule', async () => {
    const { timers, resolvers, poller } = pollerHarness();
    poller.start();
    timers[0].cb();
    poller.stop();
    resolvers[0](false);
    await flush();
    expect(timers.length).toBe(1); // no reschedule after stop
  });

  it('start is idempotent — never spawns a second concurrent loop', () => {
    const { timers, poller } = pollerHarness();
    poller.start();
    poller.start();
    expect(timers.length).toBe(1);
  });
});

describe('nextPollDelay', () => {
  const cfg = { burstMs: 1500, idleMs: 5000, burstWindowMs: 15000 };

  it('idles when no change has been detected yet', () => {
    expect(nextPollDelay(null, 100_000, cfg)).toBe(5000);
  });

  it('bursts right after a change', () => {
    const now = 100_000;
    expect(nextPollDelay(now - 1000, now, cfg)).toBe(1500); // 1s since change → within window
    expect(nextPollDelay(now, now, cfg)).toBe(1500); // just changed
  });

  it('decays to idle once the burst window passes', () => {
    const now = 100_000;
    expect(nextPollDelay(now - 14_999, now, cfg)).toBe(1500); // just inside window
    expect(nextPollDelay(now - 15_000, now, cfg)).toBe(5000); // at boundary → idle
    expect(nextPollDelay(now - 30_000, now, cfg)).toBe(5000); // long quiet → idle
  });

  it('guards against clock skew (future lastChangeAt → idle, not negative)', () => {
    const now = 100_000;
    expect(nextPollDelay(now + 5000, now, cfg)).toBe(5000);
  });

  it('default config: burst 1.5s, idle 5s, window 15s', () => {
    expect(DEFAULT_POLL_CADENCE).toEqual({ burstMs: 1500, idleMs: 5000, burstWindowMs: 15000 });
    const now = 0;
    expect(nextPollDelay(now, now)).toBe(1500);
    expect(nextPollDelay(now - 20_000, now)).toBe(5000);
  });
});
