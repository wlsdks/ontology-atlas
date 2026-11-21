import { describe, expect, it } from 'vitest';

import { fixtureVault } from './film-map-fixture';
import { slotOrder } from './film-slot-order';

const a = 'domain:a';
const b = 'domain:b';
const c = 'domain:c';
const d = 'domain:d';

describe('slot order of the domains around the ellipse', () => {
  it('keeps one domain and none as they are', () => {
    expect(slotOrder(fixtureVault({}), null)).toEqual([]);
    expect(slotOrder(fixtureVault({ a: [1] }), null)).toEqual([a]);
  });

  it('starts at the picked domain', () => {
    const vault = fixtureVault({ a: [1], b: [1], c: [1] });
    expect(slotOrder(vault, c)[0]).toBe(c);
    expect(slotOrder(vault, 'domain:missing')[0]).toBe(a);
  });

  it('seats the domains that depend on each other next to each other', () => {
    // a-c and b-d are heavy pairs; any ring with a first must put each pair side by side.
    const vault = fixtureVault({ a: [1, 1], b: [1, 1], c: [1, 1], d: [1, 1] }, [
      ['capability:a0', 'capability:c0'],
      ['capability:a1', 'capability:c1'],
      ['capability:b0', 'capability:d0'],
      ['capability:b1', 'capability:d1'],
      ['capability:a0', 'capability:b0'],
    ]);
    const ring = slotOrder(vault, a);
    const gap = (x: string, y: string) => {
      const apart = Math.abs(ring.indexOf(x) - ring.indexOf(y));
      return Math.min(apart, ring.length - apart);
    };
    expect(gap(a, c)).toBe(1);
    expect(gap(b, d)).toBe(1);
  });

  it('counts the way around the ring, so the last slot is next to the first', () => {
    const vault = fixtureVault({ a: [1, 1], b: [1], c: [1], d: [1] }, [
      ['capability:a0', 'capability:b0'],
      ['capability:a0', 'capability:c0'],
      ['capability:a1', 'capability:b0'],
      ['capability:a1', 'capability:c0'],
    ]);
    const ring = slotOrder(vault, a);
    expect([ring[1], ring[3]].sort()).toEqual([b, c]);
  });

  it('places seven or more domains by greedy nearest neighbour, still starting at the first', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const vault = fixtureVault(Object.fromEntries(names.map((name) => [name, [1]])), [
      ['capability:a0', 'capability:d0'],
      ['capability:d0', 'capability:g0'],
    ]);
    const ring = slotOrder(vault, null);
    expect(ring).toHaveLength(7);
    expect(ring.slice(0, 3)).toEqual([a, d, 'domain:g']);
    expect(new Set(ring).size).toBe(7);
  });
});
