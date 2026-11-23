import { describe, expect, it } from 'vitest';

import { estimateRequests, MINUTES_PER_REQUEST, remainingMinutes } from './mapping-estimate';

describe('estimateRequests', () => {
  it.each([
    [0, 1],
    [1, 1],
    [24, 1],
    [25, 2],
    [600, 25],
  ])('estimates %i abilities off the map at %i requests', (uncovered, requests) => {
    expect(estimateRequests(uncovered)).toBe(requests);
  });
});

describe('remainingMinutes', () => {
  it('uses the measured rate before the first request has finished', () => {
    expect(remainingMinutes(100, [])).toBe(5 * MINUTES_PER_REQUEST);
  });

  it('uses the run\'s own abilities and time per request once one has finished', () => {
    expect(remainingMinutes(100, [{ gained: 50, durationMs: 3 * 60_000 }])).toBe(6);
  });

  it('averages every finished request, a request that gained nothing included', () => {
    expect(remainingMinutes(40, [
      { gained: 40, durationMs: 60_000 },
      { gained: 0, durationMs: 3 * 60_000 },
    ])).toBe(4);
  });

  it('cannot say when the finished requests gained nothing', () => {
    expect(remainingMinutes(40, [{ gained: 0, durationMs: 60_000 }])).toBeNull();
  });

  it('is zero with nothing left and never negative or invented for a broken count', () => {
    expect(remainingMinutes(0, [{ gained: 0, durationMs: 60_000 }])).toBe(0);
    expect(remainingMinutes(-3, [])).toBeNull();
    expect(remainingMinutes(Number.NaN, [])).toBeNull();
  });
});
