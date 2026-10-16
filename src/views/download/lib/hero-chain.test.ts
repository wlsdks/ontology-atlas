import { describe, expect, it } from 'vitest';

import { CHAIN_HOLD, chainFrame, chainWalker, HERO_CHAIN, heroChains, pickChain } from './hero-chain';

const nodes = [
  { s: 'p', k: 'project' as const },
  { s: 'd', k: 'domain' as const },
  { s: 'c', k: 'capability' as const },
  { s: 'e', k: 'element' as const },
  { s: 'loose', k: 'element' as const },
];
const edges = [
  { a: 'p', b: 'd', y: 'contains' as const },
  { a: 'd', b: 'c', y: 'contains' as const },
  { a: 'c', b: 'e', y: 'contains' as const },
  { a: 'd', b: 'loose', y: 'contains' as const },
  { a: 'e', b: 'c', y: 'depends' as const },
];

describe('hero chain', () => {
  it('walks element, capability, domain by contains parents, and starts a tier up when elements are dropped', () => {
    expect(heroChains(nodes, edges)).toEqual([['e', 'c', 'd']]);
    expect(heroChains(nodes.filter((n) => n.k !== 'element'), edges.filter((e) => e.b !== 'e' && e.b !== 'loose'))).toEqual([
      ['c', 'd', 'p'],
    ]);
  });

  it('picks from the nearest third so the walked chain faces the visitor', () => {
    const chains = [['a', 'x', 'y'], ['b', 'x', 'y'], ['c', 'x', 'y']] as const;
    const depth = (slug: string) => ({ a: 3, b: 1, c: 2 })[slug] ?? 0;
    expect(pickChain(chains, depth, 0)).toEqual(['b', 'x', 'y']);
    expect(pickChain(chains, depth, 5)).toEqual(['b', 'x', 'y']);
    expect(pickChain([], depth, 0)).toBeNull();
  });

  it('lights the element, climbs one hop at a time, holds, then fades before the next walk', () => {
    const c = HERO_CHAIN;
    const t0 = c.leadMs + c.brightenMs;
    expect(chainFrame(c.leadMs - 1).alpha).toBe(0);
    expect(chainFrame(c.leadMs + c.brightenMs).lit[0]).toBe(1);
    expect(chainFrame(t0 + c.hopMs / 2)).toMatchObject({ caption: 0, pulseHop: 0, pulseU: 0.5, inked: 0.5 });
    expect(chainFrame(t0 + c.hopMs * 1.5)).toMatchObject({ caption: 1, pulseHop: 1, pulseU: 0.5, inked: 1.5 });
    const hold = chainFrame(t0 + c.hopMs * 2 + c.brightenMs);
    expect({ ...hold, lit: [...hold.lit] }).toEqual({ ...CHAIN_HOLD, lit: [...CHAIN_HOLD.lit] });
    expect(chainFrame(c.periodMs - c.fadeMs / 2)).toMatchObject({ caption: -1, alpha: 0.5 });
    expect(chainFrame(c.periodMs).alpha).toBe(0);
  });

  it('reuses one frame between walks and holds one chain under reduced motion', () => {
    const chains = heroChains(nodes, edges);
    const walker = chainWalker(chains, HERO_CHAIN.hopMs, false);
    const depth = () => 0;
    expect(walker.frame(null, depth)).toBeNull();
    const first = walker.frame(100, depth);
    expect(walker.frame(HERO_CHAIN.periodMs * 3 + 900, depth)).toBe(first);
    expect(walker.chain()).toEqual(['e', 'c', 'd']);
    const still = chainWalker(chains, HERO_CHAIN.hopMs, true);
    expect(still.frame(0, depth)).toBe(CHAIN_HOLD);
    expect(still.chain()).toEqual(['e', 'c', 'd']);
  });
});
