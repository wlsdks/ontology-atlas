import { cubicBezierAt } from "@/shared/motion/ease";
import { EXIT_TRANSITION, MOTION, MOTION_EASE } from "@/shared/motion/tokens";
import type { Point } from "../dial/types";
import type { GraphAttention, GraphLine } from "./attention";

/** A pointer resting on a concept for less than this lights nothing, so a sweep across the map never strobes. */
export const FLAT_HOVER_INTENT_MS = 80;

/**
 * The Flat graph's attention timing. A lit set arrives as a wave: the focus first, the farthest lit
 * concept `waveMs` later, each concept rising over `riseMs` and each line drawing from its source end
 * over `drawMs`. Leaving runs on the exit clock and curve, faster than arriving.
 */
export const FLAT_MOTION = {
  hoverIntentMs: FLAT_HOVER_INTENT_MS,
  waveMs: MOTION.fast.duration * 1000,
  riseMs: MOTION.fast.duration * 1000,
  drawMs: MOTION.base.duration * 1000,
  exitMs: EXIT_TRANSITION.duration * 1000,
} as const;

const EASE_SAMPLES = 128;

function sampledCurve(curve: readonly [number, number, number, number]): Float64Array {
  const table = new Float64Array(EASE_SAMPLES + 1);
  for (let i = 0; i <= EASE_SAMPLES; i += 1) table[i] = cubicBezierAt(curve, i / EASE_SAMPLES);
  return table;
}

/** The ramp's curves as tables, so a frame eases hundreds of concepts without solving a bezier each. */
const ENTRY_CURVE = sampledCurve(MOTION_EASE);
const EXIT_CURVE = sampledCurve(EXIT_TRANSITION.ease);

function eased(table: Float64Array, t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  const at = t * EASE_SAMPLES;
  const i = at | 0;
  return table[i]! + (table[i + 1]! - table[i]!) * (at - i);
}

/**
 * Wave delays of one lit set: 0 at the focus, `waveMs` at the lit concept farthest from it, the rest
 * by distance. O(lit).
 */
export function waveDelays(attention: GraphAttention, positionOf: (id: string) => Point | undefined, waveMs: number): Map<string, number> {
  const delays = new Map<string, number>();
  const lit = attention.lit;
  const focus = attention.focusId === null ? undefined : positionOf(attention.focusId);
  if (lit === null || focus === undefined) return delays;
  let far = 0;
  for (const id of lit) {
    const at = positionOf(id);
    if (at) far = Math.max(far, Math.hypot(at.x - focus.x, at.y - focus.y));
  }
  for (const id of lit) {
    const at = positionOf(id);
    delays.set(id, at && far > 0 ? (Math.hypot(at.x - focus.x, at.y - focus.y) / far) * waveMs : 0);
  }
  return delays;
}

/** One relation line as a frame draws it: `reach` of the way from its source end. */
export interface DrawnLine {
  line: GraphLine;
  reach: number;
  /** True for the current focus's lines, false for an earlier focus's lines retracting. */
  current: boolean;
}

interface HeldLine { line: GraphLine; reach: number }

/** Scalars that read the whole picture rather than one concept. */
export const MOTION_SHARE = { focus: 0, project: 1 } as const;
type ShareSlot = (typeof MOTION_SHARE)[keyof typeof MOTION_SHARE];

const NO_DELAYS: ReadonlyMap<string, number> = new Map();

/**
 * A line leaves at this share of its far concept's wave delay, so it lands as that concept lights
 * and overlaps a retracting predecessor instead of waiting for it.
 */
const LINE_LEAD = 0.5;

/**
 * The attention clock of one map. Each change snapshots the picture on screen, concept by concept
 * and line by line, and moves from there to the new attention: a retarget never passes through the
 * rest picture, and a pointer that leaves before `hoverIntentMs` has started nothing. Every motion
 * ends at `endAt`; from then `settled` holds and the frame loop may idle.
 *
 * A concept's state is two weights, lit and sunk; what remains of 1 is the rest picture.
 */
export class GraphMotion {
  current: GraphAttention;
  changedAt = Number.NEGATIVE_INFINITY;
  startAt = Number.NEGATIVE_INFINITY;
  endAt = Number.NEGATIVE_INFINITY;
  /** Every motion of the current attention has ended: the picture is `current` exactly. */
  settled = true;
  /** Share of the current change's time that has passed, 0 to 1. */
  progress = 1;
  /** The whole-picture clock: shares, the selected disc's growth and its ring follow it. */
  baseMix = 1;
  /** The lines to draw this frame, `drawnCount` of them; entries are reused across frames. */
  readonly drawn: DrawnLine[] = [];
  drawnCount = 0;

  private now = 0;
  private exiting = false;
  private delays: ReadonlyMap<string, number> = NO_DELAYS;
  private readonly index = new Map<string, number>();
  private fromLit = new Float64Array(256);
  private fromSink = new Float64Array(256);
  private fromLines = new Map<string, HeldLine>();
  private readonly currentKeys = new Set<string>();
  private readonly fromShares = new Float64Array(2);
  private readonly lastShares = new Float64Array(2);
  private readonly out = new Float64Array(2);

  constructor(initial: GraphAttention) {
    this.current = initial;
    for (const line of initial.lines) this.currentKeys.add(line.key);
  }

  /**
   * Moves the clock to `now` under `attention`. `delaysOf` gives a lit attention's wave delays; the
   * caller caches it. A change costs O(concepts seen); a frame costs O(lines) here.
   */
  advance(attention: GraphAttention, now: number, reducedMotion: boolean, delaysOf: (a: GraphAttention) => ReadonlyMap<string, number>): void {
    if (attention.key !== this.current.key) this.change(attention, now, reducedMotion, delaysOf);
    else if (reducedMotion) this.endAt = Math.min(this.endAt, now);
    this.at(now);
    this.planLines();
  }

  /** True while the frame loop must keep drawing: a wait, a wave, a draw or a retract is running. */
  get active(): boolean {
    return !this.settled;
  }

  /** Registers a concept the frame draws, so the next change can start from its ink. O(1). */
  see(id: string): void {
    if (this.index.has(id)) return;
    const i = this.slotOf(id);
    this.fromLit[i] = 0;
    this.fromSink[i] = 0;
  }

  /** A concept's ink now: `rest` at rest, 1 when lit, `sink` when sunk. */
  ink(id: string, sink: number, rest: number): number {
    const w = this.weights(id);
    return rest * (1 - w[0]! - w[1]!) + w[0]! + sink * w[1]!;
  }

  /** How lit a concept is now, 0 to 1. */
  litShare(id: string): number {
    return this.weights(id)[0]!;
  }

  /** A whole-picture scalar moving from what it showed at the change to `target` on the base clock. */
  share(slot: ShareSlot, target: number): number {
    const value = this.settled ? target : this.fromShares[slot]! + (target - this.fromShares[slot]!) * this.baseMix;
    this.lastShares[slot] = value;
    return value;
  }

  private at(now: number): void {
    this.now = now;
    this.settled = now >= this.endAt;
    const span = Math.max(1, this.endAt - this.changedAt);
    this.progress = this.settled ? 1 : Math.min(1, Math.max(0, (now - this.changedAt) / span));
    const elapsed = now - this.startAt;
    this.baseMix = this.settled ? 1 : eased(this.exiting ? EXIT_CURVE : ENTRY_CURVE, elapsed / (this.exiting ? FLAT_MOTION.exitMs : FLAT_MOTION.riseMs));
  }

  private weights(id: string): Float64Array {
    const out = this.out;
    const target = this.current.lit;
    const lit = target !== null && target.has(id);
    const targetLit = lit ? 1 : 0;
    const targetSink = target !== null && !lit ? 1 : 0;
    if (this.settled) {
      out[0] = targetLit;
      out[1] = targetSink;
      return out;
    }
    const i = this.index.get(id);
    const fromLit = i === undefined ? 0 : this.fromLit[i]!;
    const fromSink = i === undefined ? 0 : this.fromSink[i]!;
    const p = this.conceptProgress(id, lit);
    out[0] = fromLit + (targetLit - fromLit) * p;
    out[1] = fromSink + (targetSink - fromSink) * p;
    return out;
  }

  private conceptProgress(id: string, lit: boolean): number {
    const elapsed = this.now - this.startAt;
    if (elapsed < 0) return 0;
    if (this.exiting) return eased(EXIT_CURVE, elapsed / FLAT_MOTION.exitMs);
    const delay = lit ? this.delays.get(id) ?? 0 : 0;
    return eased(ENTRY_CURVE, (elapsed - delay) / FLAT_MOTION.riseMs);
  }

  private lineReach(line: GraphLine, from: number, current: boolean): number {
    if (this.settled) return current ? 1 : 0;
    const elapsed = this.now - this.startAt;
    if (elapsed < 0) return from;
    if (!current) return from * (1 - eased(EXIT_CURVE, elapsed / FLAT_MOTION.exitMs));
    if (from >= 1) return 1;
    const far = line.from === this.current.focusId ? line.to : line.from;
    const delay = (this.delays.get(far) ?? 0) * LINE_LEAD;
    return from + (1 - from) * eased(ENTRY_CURVE, (elapsed - delay) / FLAT_MOTION.drawMs);
  }

  private planLines(): void {
    let n = 0;
    const lines = this.current.lines;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      const from = this.settled ? 1 : this.fromLines.get(line.key)?.reach ?? 0;
      n = this.putLine(n, line, this.lineReach(line, from, true), true);
    }
    if (!this.settled) {
      for (const held of this.fromLines.values()) {
        if (this.currentKeys.has(held.line.key)) continue;
        n = this.putLine(n, held.line, this.lineReach(held.line, held.reach, false), false);
      }
    }
    this.drawnCount = n;
  }

  private putLine(n: number, line: GraphLine, reach: number, current: boolean): number {
    if (!(reach > 0)) return n;
    const slot = (this.drawn[n] ??= { line, reach: 0, current: true });
    slot.line = line;
    if (slot.reach !== reach) slot.reach = reach;
    slot.current = current;
    return n + 1;
  }

  private slotOf(id: string): number {
    let i = this.index.get(id);
    if (i !== undefined) return i;
    i = this.index.size;
    this.index.set(id, i);
    if (i >= this.fromLit.length) {
      const lit = new Float64Array(this.fromLit.length * 2);
      const sink = new Float64Array(this.fromSink.length * 2);
      lit.set(this.fromLit);
      sink.set(this.fromSink);
      this.fromLit = lit;
      this.fromSink = sink;
    }
    return i;
  }

  private change(attention: GraphAttention, now: number, reducedMotion: boolean, delaysOf: (a: GraphAttention) => ReadonlyMap<string, number>): void {
    this.at(now);
    const seen = this.current.lit;
    if (seen !== null) for (const id of seen) this.slotOf(id);
    for (const [id, i] of this.index) {
      const w = this.weights(id);
      this.fromLit[i] = w[0]!;
      this.fromSink[i] = w[1]!;
    }
    this.fromShares.set(this.lastShares);
    this.planLines();
    const held = new Map<string, HeldLine>();
    for (let i = 0; i < this.drawnCount; i += 1) {
      const d = this.drawn[i]!;
      held.set(d.line.key, { line: d.line, reach: d.reach });
    }
    this.fromLines = held;
    this.currentKeys.clear();
    for (const line of attention.lines) this.currentKeys.add(line.key);
    const sameLitFocus = this.current.lit !== null && this.current.focusId === attention.focusId;
    const pointed = attention.lit !== null && !attention.selected && !sameLitFocus;
    this.current = attention;
    this.changedAt = now;
    this.exiting = attention.lit === null;
    this.delays = this.exiting ? NO_DELAYS : delaysOf(attention);
    this.startAt = now + (pointed ? FLAT_MOTION.hoverIntentMs : 0);
    let wave = 0;
    for (const delay of this.delays.values()) wave = Math.max(wave, delay);
    const entry = Math.max(FLAT_MOTION.exitMs, wave + Math.max(FLAT_MOTION.riseMs, FLAT_MOTION.drawMs));
    this.endAt = reducedMotion ? now : this.startAt + (this.exiting ? FLAT_MOTION.exitMs : entry);
  }
}

const motions = new WeakMap<object, GraphMotion>();

/** The attention clock of one world, created settled on its first attention. */
export function graphMotionOf(worldKey: object, attention: GraphAttention): GraphMotion {
  let motion = motions.get(worldKey);
  if (!motion) motions.set(worldKey, (motion = new GraphMotion(attention)));
  return motion;
}
