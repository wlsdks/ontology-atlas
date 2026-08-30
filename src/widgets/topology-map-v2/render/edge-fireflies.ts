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

/*
 * perf 2026-08-19 — pair key and seed cache.
 *
 * `edgePairKey` (string concatenation) and `fireflySeed` (character-by-character
 * hash of that string) **cannot change over an edge's lifetime**, yet they were
 * recomputed every frame — O(n log n) times inside the sort comparator, a
 * sizeable share of `drawTopologyFrame` self time in the 3D rotation profile.
 * Edge objects are replaced wholesale on a world rebuild and never mutated in
 * place (same reasoning as the `phaseCache` doc-block), so a WeakMap computes
 * this once per object. Same values, same pixels.
 */
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
 * Design Guardian-approved cap on comets over `contains` edges incident to the
 * selection (ego). When the focused node has a large fan-out — a domain with 90
 * children, say — lighting all of them produces an unreadable mass of particles.
 * Edges are ranked by ascending `fireflySeed` (deterministic, no RNG state) and
 * only the first `limit` become comets; the rest keep the ego brightening with
 * no particles. The caller applies this same Set both to the advance condition
 * in `updateParticles` and to the draw condition in `render/traces.ts`.
 */
export const EGO_CONTAINS_COMET_LIMIT = 24;

export function selectEgoContainsComets(
  incidentContainsEdges: readonly { sourceId: string; targetId: string }[],
  limit: number = EGO_CONTAINS_COMET_LIMIT,
): ReadonlySet<string> {
  return rankCometEdges(incidentContainsEdges, limit);
}

/**
 * The same cap, applied to the **always-on ambient `depends` comets** (2026-07-31).
 *
 * The `contains` branch got its 24-edge ceiling above; the `depends` branch had
 * neither a ceiling nor a ranking. Viewport culling and the tier conditions act
 * as a de facto limit today, but once the element tier fills the screen with
 * `depends` edges there is no ceiling on how many dots flow at once.
 *
 * ⚠️ **This does not re-reverse #512 (the owner's restoration of the ambient
 * comets).** They still flow always, regardless of focus, at the same speed.
 * All this does is apply an already-approved pattern to the branch that was
 * missing it. The old Guardian call to limit comets to ego was explicitly
 * reversed by the owner, and that decision stands.
 */
export function selectAmbientDependsComets(
  visibleDependsEdges: readonly { sourceId: string; targetId: string }[],
  limit: number = EGO_CONTAINS_COMET_LIMIT,
): ReadonlySet<string> {
  return rankCometEdges(visibleDependsEdges, limit);
}

/**
 * Deterministic ranking — ascending `fireflySeed`, ties broken by pair key in
 * lexicographic order. No RNG state.
 *
 * perf 2026-08-19 — this runs every frame. The old comparator recomputed
 * `fireflySeed` (concatenate + hash) twice per call, i.e. O(n log n) string
 * hashes. The `edgePairMeta` cache (once per edge object) is now resolved before
 * the sort and the comparator reads only a number and a cached string. The
 * ordering criteria are unchanged, so the resulting set is element-for-element
 * identical — sort stability is irrelevant here, the comparator is a total order.
 */
function rankCometEdges(
  edges: readonly { sourceId: string; targetId: string }[],
  limit: number,
): ReadonlySet<string> {
  const metas = edges.map((e) => edgePairMeta(e));
  metas.sort((a, b) => {
    const seedDiff = a.seed - b.seed;
    if (seedDiff !== 0) return seedDiff;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return new Set(metas.slice(0, Math.max(0, limit)).map((m) => m.key));
}

/**
 * The prototype's `updateParticles` — always advances depends-edge phase in
 * place. Under reduced-motion it does nothing. Per-edge speed arrives via
 * `speedOf`, so ego acceleration and the like are the caller's decision and this
 * module imports nothing from `model/`.
 *
 * `contains` edges are stationary by default; only those for which
 * `isEgoContainsEligible` returns true (incident to the selection and inside the
 * cap) advance exactly as depends edges do. Omitting the argument makes every
 * contains edge stationary, the original contract.
 */
export function updateParticles(
  edges: readonly ParticleEdge[],
  dt: number,
  reducedMotion: boolean,
  speedOf: (edge: ParticleEdge) => number,
  isEgoContainsEligible: (edge: ParticleEdge) => boolean = () => false,
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
