/**
 * Always-on comets plus hover pulses — the pure model and pulse renderer that
 * restore the prototype's two edge motions (`docs/prototypes/topology-b2plus.html`
 * §14 `updateParticles`/`updatePulses`, §13 `drawPulses`). Owner: "this isn't what I want; bring the old one back" (this isn't what I want; bring the old one back), which replaced the focus-conditioned firefly dots with this original spec.
 *
 * Two effects:
 * 1. **Always-on comet** — every depends edge carries a per-edge phase `e.t`
 *    that flows regardless of focus (`updateParticles`,
 *    `e.t = (e.t + dt*speed) % 1`). The tail itself is drawn by
 *    `render/traces.ts`, which reads `e.t` and follows the same edge curve.
 *    This module owns only the phase-advance model.
 * 2. **Hover pulse** — hovering a node fires one 420ms signal outward along
 *    each edge it touches (`spawnHoverPulses` → `updatePulses` for lifetime →
 *    `drawPulses` to render): a bright head plus a pale trail 0.05 behind it,
 *    shrinking in radius rather than fading in alpha, because glow is banned.
 *
 * Pure layer: it knows nothing of the canvas or of a clock — progress arrives
 * only as an argument. Under reduced-motion both the phase advance and the pulse
 * spawn are skipped entirely. The unit tests pin phase determinism, pulse
 * lifetime, and direction; the pixels are verified on a real screen.
 */

import { bezierPoint, type Point } from "./traces";

/** Pulse lifetime, ms — the prototype's `PULSE_DUR`. */
export const PULSE_DURATION_MS = 420;
/** Head/trail radii, px — from the prototype's drawPulses. */
const PULSE_HEAD_RADIUS_PX = 2.6;
const PULSE_TRAIL_RADIUS_PX = 1.4;
/** How far behind the head the trail sits, in phase — the prototype's 0.05. */
export const PULSE_TRAIL_LAG = 0.05;
/** Floor on the shrink so the pulse never vanishes outright (prototype: max(0.35, …)). */
const PULSE_MIN_SCALE = 0.35;

/**
 * Deterministic seed in [0,1) from an edge's two endpoint ids — no RNG state, so
 * the same edge always gets the same phase offset. Used to seed `edge.t` so the
 * always-on comets flow out of step instead of in lockstep, which would read as
 * one wave crossing every edge at once.
 */
export function fireflySeed(sourceId: string, targetId: string): number {
  const s = `${sourceId} ${targetId}`;
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 1000) / 1000;
}

/**
 * Advance the phase one step, wrapping into [0,1). Deterministic: the same
 * (t, dt, speed) gives the same result, negative speeds included.
 */
export function advanceParticlePhase(t: number, dt: number, speed: number): number {
  const next = (t + dt * speed) % 1;
  return next < 0 ? next + 1 : next;
}

/** The minimum shape `updateParticles` advances — a subset of the world edge. */
export interface ParticleEdge {
  kind: "contains" | "depends";
  /** Phase 0..1 — advanced in place. */
  t: number;
  sourceId: string;
  targetId: string;
}

/** Normalises an edge's endpoint ids into a set/map key, in the same order `fireflySeed` uses. */
export function edgePairKey(sourceId: string, targetId: string): string {
  return `${sourceId} ${targetId}`;
}

/** An edge's endpoints never change, and a world build replaces edges rather than mutating them. */
interface EdgePairRef {
  sourceId: string;
  targetId: string;
}
const pairMetaCache = new WeakMap<EdgePairRef, { seed: number; key: string }>();

/** This edge object's (seed, key), computed once per object; identical to `fireflySeed`/`edgePairKey`. */
export function edgePairMeta(edge: EdgePairRef): { seed: number; key: string } {
  let meta = pairMetaCache.get(edge);
  if (meta === undefined) {
    meta = { seed: fireflySeed(edge.sourceId, edge.targetId), key: edgePairKey(edge.sourceId, edge.targetId) };
    pairMetaCache.set(edge, meta);
  }
  return meta;
}

/**
 * Design Guardian-approved cap on comets over the selection's incident `contains` edges, and the
 * same cap on the always-on `depends` comets (which still flow regardless of focus, #512): a
 * 90-child domain would otherwise light an unreadable mass of particles.
 */
export const EGO_CONTAINS_COMET_LIMIT = 24;

/** `order[rank]` is an edge index; `rankOf[edgeIndex]` is its rank. */
interface CometRanking {
  order: Uint32Array;
  rankOf: Uint32Array;
}
const rankingCache = new WeakMap<readonly EdgePairRef[], CometRanking>();

/**
 * Comet rank order: ascending `fireflySeed`, ties by pair key, so it is deterministic with no RNG
 * state. Sorted once per edge list, O(E log E); the list is the key because a world build replaces
 * it and nothing reshapes it afterwards.
 */
function cometRanking(edges: readonly EdgePairRef[]): CometRanking {
  let ranking = rankingCache.get(edges);
  if (ranking === undefined) {
    const metas = edges.map(edgePairMeta);
    const order = Uint32Array.from(metas.keys()).sort((a, b) => {
      const seedDiff = metas[a].seed - metas[b].seed;
      if (seedDiff !== 0) return seedDiff;
      return metas[a].key < metas[b].key ? -1 : metas[a].key > metas[b].key ? 1 : 0;
    });
    const rankOf = new Uint32Array(order.length);
    for (let rank = 0; rank < order.length; rank += 1) rankOf[order[rank]] = rank;
    ranking = { order, rankOf };
    rankingCache.set(edges, ranking);
  }
  return ranking;
}

/**
 * The pair keys of the first `limit` edges in rank order that `isCandidate` accepts, written into
 * `into`. It walks the cached ranking and stops at the cap: no sort and no allocation per frame,
 * O(E) only when fewer than `limit` edges qualify.
 */
export function selectAmbientDependsComets(
  edges: readonly EdgePairRef[],
  isCandidate: (edgeIndex: number) => boolean,
  into: Set<string>,
  limit: number = EGO_CONTAINS_COMET_LIMIT,
): ReadonlySet<string> {
  into.clear();
  const { order } = cometRanking(edges);
  let taken = 0;
  for (let rank = 0; rank < order.length && taken < limit; rank += 1) {
    const index = order[rank];
    if (!isCandidate(index)) continue;
    into.add(edgePairMeta(edges[index]).key);
    taken += 1;
  }
  return into;
}

export interface EgoContainsComets<E extends EdgePairRef = EdgePairRef> {
  keys: ReadonlySet<string>;
  /** Every incident `contains` edge whose pair key is in `keys`, for an identity lookup per frame. */
  edges: ReadonlySet<E>;
}

const egoCometCache = new WeakMap<
  readonly EdgePairRef[],
  { incidentIndices: readonly number[] | undefined; limit: number; comets: EgoContainsComets }
>();

/**
 * The comet-carrying `contains` edges touching the focused node: its incident `contains` edges in
 * rank order, first `limit`. `incidentIndices` is the world's `edgeIndexByNode` entry, where a
 * self-loop appears twice in a row. Cached per edge list and entry, since the physics step and the
 * draw both ask every frame.
 */
export function selectEgoContainsComets<E extends EdgePairRef & { kind: string }>(
  edges: readonly E[],
  incidentIndices: readonly number[] | undefined,
  limit: number = EGO_CONTAINS_COMET_LIMIT,
): EgoContainsComets<E> {
  const cached = egoCometCache.get(edges);
  if (cached !== undefined && cached.incidentIndices === incidentIndices && cached.limit === limit) {
    return cached.comets as EgoContainsComets<E>;
  }
  const { rankOf } = cometRanking(edges);
  const incident: number[] = [];
  let previous = -1;
  for (const index of incidentIndices ?? []) {
    if (index !== previous && edges[index].kind === "contains") incident.push(index);
    previous = index;
  }
  incident.sort((a, b) => rankOf[a] - rankOf[b]);
  const keys = new Set(incident.slice(0, Math.max(0, limit)).map((index) => edgePairMeta(edges[index]).key));
  const cometEdges = new Set(incident.filter((index) => keys.has(edgePairMeta(edges[index]).key)).map((index) => edges[index]));
  const comets = { keys, edges: cometEdges };
  egoCometCache.set(edges, { incidentIndices, limit, comets });
  return comets;
}

/**
 * The prototype's `updateParticles`: advances every depends edge's phase in place, nothing under
 * reduced motion. `contains` edges stay still unless `isEgoContainsEligible` accepts them.
 */
export function updateParticles<E extends ParticleEdge>(
  edges: readonly E[],
  dt: number,
  reducedMotion: boolean,
  speedOf: (edge: E) => number,
  isEgoContainsEligible: (edge: E) => boolean = () => false,
): void {
  if (reducedMotion) return;
  for (const edge of edges) {
    if (edge.kind !== "depends" && !(edge.kind === "contains" && isEgoContainsEligible(edge))) continue;
    edge.t = advanceParticlePhase(edge.t, dt, speedOf(edge));
  }
}

/** One one-shot signal pulse fired by a hover. */
export interface Pulse {
  sourceId: string;
  targetId: string;
  /** +1 = source→target, -1 = target→source. Always outward from the hovered node. */
  dir: 1 | -1;
  /** Launch time (`performance.now()`-compatible). */
  t0: number;
}

/** The minimum shape `spawnHoverPulses` reads when picking touching edges. */
export interface PulseEdge {
  sourceId: string;
  targetId: string;
}

/**
 * The pulse half of the prototype's `startRipple` — one outward pulse per edge
 * touching the hovered node. Returns an empty array under reduced-motion. Pure:
 * the caller owns the storage.
 */
export function spawnHoverPulses(
  hoveredId: string,
  touchingEdges: readonly PulseEdge[],
  now: number,
  reducedMotion: boolean,
): Pulse[] {
  if (reducedMotion) return [];
  const out: Pulse[] = [];
  for (const edge of touchingEdges) {
    if (edge.sourceId !== hoveredId && edge.targetId !== hoveredId) continue;
    out.push({
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      dir: edge.sourceId === hoveredId ? 1 : -1,
      t0: now,
    });
  }
  return out;
}

/**
 * The prototype's `updatePulses` — drops pulses past `durationMs`. Returns the
 * input untouched when nothing expired, avoiding an allocation.
 */
export function updatePulses(pulses: readonly Pulse[], now: number, durationMs = PULSE_DURATION_MS): Pulse[] {
  if (pulses.length === 0) return pulses as Pulse[];
  const alive = pulses.filter((p) => now - p.t0 < durationMs);
  return alive.length === pulses.length ? (pulses as Pulse[]) : alive;
}

/** Raw pulse progress (0..1): elapsed since launch / lifetime. Out of range is not drawn. */
function pulseRawProgress(t0: number, now: number, durationMs = PULSE_DURATION_MS): number {
  return (now - t0) / durationMs;
}

/** Size multiplier at a raw progress — shrinks toward the end (not alpha), floored at `PULSE_MIN_SCALE`. */
export function pulseScale(raw: number): number {
  return Math.max(PULSE_MIN_SCALE, 1 - raw);
}

/**
 * Head and trail phases for one pulse. `head` travels in the pulse's direction;
 * `trail` sits `PULSE_TRAIL_LAG` (0.05) behind it, or null once it leaves [0,1].
 */
export function pulseHeadTrail(dir: 1 | -1, raw: number): { head: number; trail: number | null } {
  const head = dir === 1 ? raw : 1 - raw;
  const trailT = dir === 1 ? head - PULSE_TRAIL_LAG : head + PULSE_TRAIL_LAG;
  return { head, trail: trailT >= 0 && trailT <= 1 ? trailT : null };
}

/** Resolver `drawPulses` uses to turn a pulse into a screen-space curve; null for a vanished edge. */
export type PulseEdgeResolver = (pulse: Pulse) => { a: Point; control: Point; b: Point } | null;

export interface PulseColors {
  /** Head, bright. */
  head: string;
  /** Trail, pale. */
  trail: string;
}

/**
 * Draws the active pulses as plain dots — no glow, ring, or neon. A 2.6px head
 * plus a 1.4px trail 0.05 behind it, both shrinking in radius toward the end.
 * Coordinates arrive from `resolve` already in screen space; the caller owns the
 * camera projection.
 */
export function drawPulses(
  ctx: CanvasRenderingContext2D,
  pulses: readonly Pulse[],
  now: number,
  resolve: PulseEdgeResolver,
  colors: PulseColors,
): void {
  if (pulses.length === 0) return;
  for (const pulse of pulses) {
    const raw = pulseRawProgress(pulse.t0, now);
    if (raw < 0 || raw > 1) continue;
    const curve = resolve(pulse);
    if (!curve) continue;
    const scale = pulseScale(raw);
    const { head, trail } = pulseHeadTrail(pulse.dir, raw);

    const headPos = bezierPoint(curve.a, curve.control, curve.b, head);
    ctx.beginPath();
    ctx.fillStyle = colors.head;
    ctx.arc(headPos.x, headPos.y, PULSE_HEAD_RADIUS_PX * scale, 0, Math.PI * 2);
    ctx.fill();

    if (trail !== null) {
      const trailPos = bezierPoint(curve.a, curve.control, curve.b, trail);
      ctx.beginPath();
      ctx.fillStyle = colors.trail;
      ctx.arc(trailPos.x, trailPos.y, PULSE_TRAIL_RADIUS_PX * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
