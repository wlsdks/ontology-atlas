import { MOTION } from '@/shared/motion';

import { preferredParents } from './hero-echo';

type ChainKind = 'project' | 'domain' | 'capability' | 'element';

const TIER: Record<ChainKind, number> = { project: 0, domain: 1, capability: 2, element: 3 };

export const HERO_CHAIN = Object.freeze({
  periodMs: 4800,
  leadMs: 720,
  brightenMs: Math.round(MOTION.fast.duration * 1000),
  fadeMs: Math.round(MOTION.settle.duration * 1000),
  hopMs: 420,
  swell: 1.35,
});

export const HERO_TURN_MS = Object.freeze({ plane: 48_000, atlas: 128_000 });

export type HeroChain = readonly [string, string, string];

export function heroChains(
  nodes: readonly { s: string; k: ChainKind }[],
  edges: readonly { a: string; b: string; y: 'contains' | 'depends' }[],
): HeroChain[] {
  const parentOf = preferredParents(nodes, edges);
  const tierOf = new Map(nodes.map((n) => [n.s, TIER[n.k]]));
  const start = nodes.some((n) => n.k === 'element') ? TIER.element : TIER.capability;
  const chains: HeroChain[] = [];
  for (const n of nodes) {
    if (TIER[n.k] !== start) continue;
    const up = parentOf.get(n.s);
    const top = up === undefined ? undefined : parentOf.get(up);
    if (up === undefined || top === undefined) continue;
    if (tierOf.get(up) !== start - 1 || tierOf.get(top) !== start - 2) continue;
    chains.push([n.s, up, top]);
  }
  return chains.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

export function pickChain(chains: readonly HeroChain[], depthOf: (slug: string) => number, turn: number): HeroChain | null {
  if (chains.length === 0) return null;
  const near = [...chains].sort((a, b) => depthOf(a[0]) + depthOf(a[1]) - depthOf(b[0]) - depthOf(b[1]));
  const pool = near.slice(0, Math.max(1, Math.ceil(near.length / 3)));
  return pool[turn % pool.length]!;
}

export interface ChainFrame {
  lit: [number, number, number];
  inked: number;
  pulseHop: -1 | 0 | 1;
  pulseU: number;
  alpha: number;
  caption: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

const frameSlot = (): ChainFrame => ({ lit: [0, 0, 0], inked: 0, pulseHop: -1, pulseU: 0, alpha: 0, caption: -1 });

export const CHAIN_HOLD: Readonly<ChainFrame> = Object.freeze<ChainFrame>({ lit: [1, 1, 1], inked: 2, pulseHop: -1, pulseU: 0, alpha: 1, caption: 2 });

export function chainFrame(ms: number, hopMs: number = HERO_CHAIN.hopMs, out: ChainFrame = frameSlot()): ChainFrame {
  const c = HERO_CHAIN;
  const t0 = c.leadMs + c.brightenMs;
  const t1 = t0 + hopMs;
  const t2 = t1 + hopMs;
  const fadeAt = c.periodMs - c.fadeMs;
  const on = ms >= c.leadMs && ms < c.periodMs;
  out.lit[0] = on ? ease((ms - c.leadMs) / c.brightenMs) : 0;
  out.lit[1] = on ? ease((ms - t1) / c.brightenMs) : 0;
  out.lit[2] = on ? ease((ms - t2) / c.brightenMs) : 0;
  out.inked = on ? clamp01((ms - t0) / hopMs) + clamp01((ms - t1) / hopMs) : 0;
  out.pulseHop = on && ms >= t0 && ms < t2 ? (ms < t1 ? 0 : 1) : -1;
  out.pulseU = out.pulseHop === 0 ? (ms - t0) / hopMs : out.pulseHop === 1 ? (ms - t1) / hopMs : 0;
  out.alpha = on ? 1 - ease((ms - fadeAt) / c.fadeMs) : 0;
  out.caption = !on || ms >= fadeAt ? -1 : ms >= t2 ? 2 : ms >= t1 ? 1 : 0;
  return out;
}

export function chainWalker(chains: readonly HeroChain[], hopMs: number, reduced: boolean) {
  const slot = frameSlot();
  let turn = -1;
  let chain: HeroChain | null = null;
  return {
    chain: (): HeroChain | null => chain,
    frame(since: number | null, depthOf: (slug: string) => number): Readonly<ChainFrame> | null {
      if (since === null) return null;
      if (reduced) {
        chain ??= pickChain(chains, depthOf, 0);
        return CHAIN_HOLD;
      }
      if (since < 0) return null;
      const next = Math.floor(since / HERO_CHAIN.periodMs);
      if (next !== turn) {
        turn = next;
        chain = pickChain(chains, depthOf, next);
      }
      return chainFrame(since - next * HERO_CHAIN.periodMs, hopMs, slot);
    },
  };
}
