import { afterEach, describe, expect, it, vi } from 'vitest';

import { RUN_SLICED_MAX_ITEMS, runSliced } from './run-sliced';
import { yieldToFrame } from './yield-to-frame';

/** A clock each item advances by `costMs`, and a yield that counts its calls. */
function harness(costMs: number) {
  let clock = 0;
  const yields: number[] = [];
  return {
    yields,
    options: {
      now: () => clock,
      yieldNow: async () => {
        yields.push(clock);
      },
    },
    work: (item: number) => {
      clock += costMs;
      return item * 2;
    },
  };
}

describe('runSliced', () => {
  it('runs every item once, in order, and returns the results in order', async () => {
    const { options } = harness(0);
    const seen: number[] = [];
    const out = await runSliced([3, 1, 2], (item, index) => {
      seen.push(index);
      return item * 10;
    }, 8, options);
    expect(out).toEqual([30, 10, 20]);
    expect(seen).toEqual([0, 1, 2]);
  });

  it('yields once a slice has spent its budget, and not after the last item', async () => {
    const { options, work, yields } = harness(3);
    await runSliced(Array.from({ length: 9 }, (_, i) => i), work, 8, options);
    // 3 + 3 + 3 crosses 8 ms after every third item; the ninth item ends the pass.
    expect(yields).toEqual([9, 18]);
  });

  it('yields every 64 items when items cost nothing', async () => {
    const { options, work, yields } = harness(0);
    await runSliced(Array.from({ length: 200 }, (_, i) => i), work, 8, options);
    expect(yields).toHaveLength(Math.floor(200 / RUN_SLICED_MAX_ITEMS));
  });

  it('stops before the next item once its signal aborts', async () => {
    const controller = new AbortController();
    const { options } = harness(0);
    const ran: number[] = [];
    const pass = runSliced(Array.from({ length: 200 }, (_, i) => i), (item) => {
      ran.push(item);
      if (item === 70) controller.abort(new Error('left'));
    }, 8, { ...options, signal: controller.signal });
    await expect(pass).rejects.toThrow('left');
    expect(ran.at(-1)).toBe(70);
  });
});

describe('yieldToFrame', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses scheduler.yield where the platform has it', async () => {
    const yieldSpy = vi.fn(() => Promise.resolve());
    vi.stubGlobal('scheduler', { yield: yieldSpy });
    await yieldToFrame();
    expect(yieldSpy).toHaveBeenCalledTimes(1);
  });

  it('resumes after queued tasks without scheduler.yield', async () => {
    vi.stubGlobal('scheduler', undefined);
    const order: string[] = [];
    const resumed = yieldToFrame().then(() => order.push('resumed'));
    order.push('sync');
    await resumed;
    expect(order).toEqual(['sync', 'resumed']);
  });
});
