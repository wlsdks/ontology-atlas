import { DOME_PLANE, TAU } from './cone-layout';
import { easeOutCubic, TIER_ASSEMBLE_TOTAL_MS, tierProgress } from '../../morph/tier-assembly';
import { DOME_NODE_PX, DOME_RING_SAMPLES } from './ink';
import { clampDomePitch } from './orbit';
import { projectWithTrig } from './projection';
import { DOME_TIER_RAMP_START, type DomeRuntime, type DomeTierRampAnchor } from './runtime';
import type { DomeCircle, DomeCoord, DomeViewKind } from './types';

export const DOME_TIER_LAG: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: -0.1,
  capability: -0.2,
  element: -0.3,
};
/** The hero's 0.90 per frame at 60 fps, made dt-invariant. */
export const DOME_TIER_LAG_DECAY_PER_MS = 0.9937;

export const DOME_POSE_LAG_SCALE = 0.55;

export function chargeTierLag(lag: Record<DomeViewKind, number>, deltaYaw: number, scale = 1): void {
  const d = deltaYaw * scale;
  lag.project += d * DOME_TIER_LAG.project;
  lag.domain += d * DOME_TIER_LAG.domain;
  lag.capability += d * DOME_TIER_LAG.capability;
  lag.element += d * DOME_TIER_LAG.element;
}


/**
 * The entry sweep: pitch starts from nearly above, so structure reads first, and yaw
 * enters slightly turned, since rotation's motion parallax says "3D" (Ware & Franck 1996).
 * Both scale by the ramp remainder and reach exactly 0 on arrival. 0.45 on the 0.5 default
 * starts on the pitch wall, the steepest angle a drag can return to.
 */
const DOME_ENTRY_PITCH_LIFT = 0.45;
const DOME_ENTRY_YAW_SWEEP = 0.45;

/**
 * Its own clock, not assembly's: offsets scale by the tier ramp, so turning the pose while
 * the ramp is low barely moves any node. It outlives assembly and holds at 1 while only the
 * spine is up.
 */
export const DOME_ENTRY_SWEEP_MS = 1500;
const DOME_ENTRY_SWEEP_HOLD_MS = 220;

/**
 * Call when a hand touches the map: the sweep offset moves into the real yaw and pitch, so
 * the drawn pose stays identical instead of jumping as the gesture starts. Pitch is clamped
 * back into range.
 */
export function commitDomeEntrySweep(runtime: DomeRuntime): void {
  if (!runtime.entryArmed) return;
  const sweep = domeEntrySweep(runtime.entryClock);
  runtime.entryArmed = false;
  if (sweep <= 0) return;
  runtime.pitch = clampDomePitch(runtime.pitch + DOME_ENTRY_PITCH_LIFT * sweep);
  runtime.yaw = runtime.yaw - DOME_ENTRY_YAW_SWEEP * sweep;
  runtime.pitchTarget = runtime.pitch;
  runtime.yawTarget = runtime.yaw;
}

function domeEntrySweep(entryClockMs: number): number {
  const t = (entryClockMs - DOME_ENTRY_SWEEP_HOLD_MS) / (DOME_ENTRY_SWEEP_MS - DOME_ENTRY_SWEEP_HOLD_MS);
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - domeEaseOutCubic(c);
}
export const DOME_ASSEMBLE_TOTAL_MS = TIER_ASSEMBLE_TOTAL_MS;

const domeEaseOutCubic = easeOutCubic;

export const domeTierProgress: (clockMs: number, kind: DomeViewKind) => number = tierProgress;

export function setDomeFolding(runtime: DomeRuntime, folding: boolean): void {
  if (runtime.folding === folding) return;
  for (const kind of DOME_KINDS) {
    runtime.rampAnchor[kind] = { from: runtime.kindRamp[kind], fromT: domeTierProgress(runtime.rampClock, kind) };
  }
  runtime.folding = folding;
}

export function domeTierRamp(
  clockMs: number,
  kind: DomeViewKind,
  folding = false,
  anchor: DomeTierRampAnchor = DOME_TIER_RAMP_START,
): number {
  const t = domeTierProgress(clockMs, kind);
  if (folding) {
    if (anchor.fromT <= 0) return 0;
    const left = Math.min(1, t / anchor.fromT);
    return anchor.from * left * left * left;
  }
  if (anchor.fromT >= 1) return 1;
  const rise = Math.max(0, (t - anchor.fromT) / (1 - anchor.fromT));
  return anchor.from + (1 - anchor.from) * domeEaseOutCubic(rise);
}

/** Depth fog and perspective carry front and back; the kind radii stay readable. */
const CLOUD_DEPTH_GAMMA = 0.62;

/** In place, with trig computed once per kind and node entries reused. */
export function updateDomeFrame<Node extends { id: string; kind: DomeViewKind; x: number; y: number }>(
  runtime: DomeRuntime,
  nodes: ReadonlyArray<Node>,
  /** Denominator of the `s` inversion. */
  baseRadiusFor: (node: Node) => number,
  /** Read only while a morph is in flight. */
  nowMs = 0,
  /** Inverted through, so the drawn radius lands on `DOME_NODE_PX` screen pixels. */
  cameraScale = 1,
): void {
  const { model, frame } = runtime;
  // Ends itself the frame it reaches 1.
  let morphE = 1;
  const morph = runtime.morph;
  if (morph !== null) {
    const t = morph.durationMs <= 0 ? 1 : (nowMs - morph.startMs) / morph.durationMs;
    if (t >= 1) {
      runtime.morph = null;
    } else {
      morphE = domeEaseInOutCubic(t <= 0 ? 0 : t);
    }
  }
  const morphing = runtime.morph !== null;
  const morphCoord: DomeCoord = { px: 0, py: 0, pz: 0 };
  /** The target, or the eased blend from the previous model. */
  const coordFor = (id: string, target: DomeCoord): DomeCoord => {
    if (!morphing) return target;
    const from = morph!.fromCoords.get(id);
    if (!from) return target;
    morphCoord.px = from.px + (target.px - from.px) * morphE;
    morphCoord.py = from.py + (target.py - from.py) * morphE;
    morphCoord.pz = from.pz + (target.pz - from.pz) * morphE;
    return morphCoord;
  };
  /*
   * The entry sweep is an offset on the drawn pose only; writing `runtime.yaw/pitch` would
   * compete with idle spin, the orbit target and the pose tween with no rule for who wins.
   */
  const sweep = runtime.entryArmed ? domeEntrySweep(runtime.entryClock) : 0;
  const drawPitch = runtime.pitch + DOME_ENTRY_PITCH_LIFT * sweep;
  const drawYawOffset = -DOME_ENTRY_YAW_SWEEP * sweep;
  const cp = Math.cos(drawPitch);
  const sp = Math.sin(drawPitch);
  runtime.drawYaw = runtime.yaw + drawYawOffset;
  runtime.drawPitch = drawPitch;
  runtime.drawCosYaw = Math.cos(runtime.drawYaw);
  runtime.drawSinYaw = Math.sin(runtime.drawYaw);
  runtime.drawCosPitch = cp;
  runtime.drawSinPitch = sp;
  const trig: Record<DomeViewKind, [number, number]> = {
    project: [0, 0],
    domain: [0, 0],
    capability: [0, 0],
    element: [0, 0],
  };
  const ramp: Record<DomeViewKind, number> = { project: 0, domain: 0, capability: 0, element: 0 };
  for (const kind of DOME_KINDS) {
    const yawK = runtime.yaw + runtime.lag[kind] + drawYawOffset;
    trig[kind] = [Math.cos(yawK), Math.sin(yawK)];
    ramp[kind] = domeTierRamp(runtime.rampClock, kind, runtime.folding, runtime.rampAnchor[kind]);
    // Kept for `projectDomePlanePoint`, so the lit stage draws at its tier's exact pose.
    runtime.kindTrig[kind][0] = trig[kind][0];
    runtime.kindTrig[kind][1] = trig[kind][1];
    runtime.kindRamp[kind] = ramp[kind];
  }
  // Pass 1 projects and collects this frame's depth range and the drawn bbox, which anchors
  // the pan leash where the dome sits, or the elastic clamp drags it toward the 2D centre.
  let zMin = Infinity;
  let zMax = -Infinity;
  let bMinX = Infinity;
  let bMinY = Infinity;
  let bMaxX = -Infinity;
  let bMaxY = -Infinity;
  for (const node of nodes) {
    const coord = model.coords.get(node.id);
    if (!coord) {
      frame.delete(node.id);
      continue;
    }
    const [cy, sy] = trig[node.kind];
    const r = ramp[node.kind];
    // A tier at r=0 skips projection: offset 0 (not −0), factor 1, identical to 2D.
    const p = r > 0 ? projectWithTrig(model, coordFor(node.id, coord), cy, sy, cp, sp) : null;
    const dx = p === null ? 0 : (p.wx - node.x) * r;
    const dy = p === null ? 0 : (p.wy - node.y) * r;
    let s = 1;
    if (p !== null) {
      const baseR = baseRadiusFor(node);
      /* Screen px → world → multiplier on the 2D base radius; `DOME_NODE_PX.project` is the cap. */
      const domeR = (DOME_NODE_PX[node.kind] * p.s) / (cameraScale > 0 ? cameraScale : 1);
      const target = baseR > 0 ? domeR / baseR : 1;
      s = 1 + (target - 1) * r;
    }
    if (p !== null) {
      if (p.z < zMin) zMin = p.z;
      if (p.z > zMax) zMax = p.z;
    }
    const drawnX = node.x + dx;
    const drawnY = node.y + dy;
    if (drawnX < bMinX) bMinX = drawnX;
    if (drawnX > bMaxX) bMaxX = drawnX;
    if (drawnY < bMinY) bMinY = drawnY;
    if (drawnY > bMaxY) bMaxY = drawnY;
    const entry = frame.get(node.id);
    if (entry) {
      entry.dx = dx;
      entry.dy = dy;
      entry.s = s;
      entry.a = r;
      entry.u = p === null ? 0 : p.z;
    } else {
      frame.set(node.id, { dx, dy, s, a: r, u: p === null ? 0 : p.z });
    }
  }
  /*
   * Rings project at the same pose as the nodes, torsion included, or they slide against
   * their tier during a drag. Ring z stays out of the normalisation range: a ring spans
   * angles with no nodes and would flatten the nodes' fog contrast.
   */
  // Cone bases from the model (the cloud has none); during a morph the old bases fade out
  // behind the new ones.
  let ringCount = 0;
  const sampleCircle = (circle: DomeCircle, alpha: number): void => {
    const { kind } = circle;
    const [cyK, syK] = trig[kind];
    let ring = runtime.rings[ringCount];
    if (!ring) {
      ring = { kind, a: 0, points: [], label: null };
      runtime.rings[ringCount] = ring;
    }
    ring.kind = kind;
    ring.a = ramp[kind] * alpha;
    const samples = domeRingSampleCount(circle.r);
    let rightmost = -1;
    for (let k = 0; k < samples; k++) {
      const theta = (k / samples) * TAU;
      ringCoord.px = circle.cx + Math.cos(theta) * circle.r;
      ringCoord.py = circle.y;
      ringCoord.pz = circle.cz + Math.sin(theta) * circle.r;
      const p = projectWithTrig(model, ringCoord, cyK, syK, cp, sp);
      const point = ring.points[k];
      if (point) {
        point.wx = p.wx;
        point.wy = p.wy;
        point.u = p.z;
      } else {
        ring.points[k] = { wx: p.wx, wy: p.wy, u: p.z };
      }
      if (rightmost < 0 || p.wx > ring.points[rightmost].wx) rightmost = k;
    }
    ring.points.length = samples;
    ring.label = circle.named === true && rightmost >= 0 ? ring.points[rightmost] : null;
    ringCount++;
  };
  for (const circle of model.circles) sampleCircle(circle, morphing ? morphE : 1);
  if (morphing) for (const circle of morph!.fromCircles) sampleCircle(circle, 1 - morphE);
  runtime.rings.length = ringCount;

  // Pass 2 normalises z to u; with no span, u is 0.
  const span = zMax - zMin;
  runtime.zMin = Number.isFinite(zMin) ? zMin : 0;
  runtime.zSpan = Number.isFinite(span) && span > 1e-9 ? span : 0;
  // The cloud reads depth more steeply so the front cluster reads.
  const cloud = model.arrangement === "coupling";
  if (Number.isFinite(span) && span > 1e-9) {
    for (const entry of frame.values()) {
      if (entry.a > 0) {
        const t = (entry.u - zMin) / span;
        entry.u = cloud ? Math.pow(t, CLOUD_DEPTH_GAMMA) : t;
      } else entry.u = 0;
    }
  } else {
    for (const entry of frame.values()) entry.u = 0;
  }
  // Rings read the same scale, clamped.
  if (Number.isFinite(span) && span > 1e-9) {
    for (const ring of runtime.rings) {
      for (const point of ring.points) {
        const t = (point.u - zMin) / span;
        point.u = t <= 0 ? 0 : t >= 1 ? 1 : t;
      }
    }
  } else {
    for (const ring of runtime.rings) for (const point of ring.points) point.u = 0;
  }
  runtime.drawnBounds = Number.isFinite(bMinX)
    ? { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY }
    : null;
  runtime.frameEpoch++;
}

const DOME_KINDS: readonly DomeViewKind[] = ["project", "domain", "capability", "element"];

/** One per module, never per sample. */
const ringCoord: DomeCoord = { px: 0, py: 0, pz: 0 };

export interface DomePlaneSample {
  wx: number;
  wy: number;
  /** The nodes' scale this frame, clamped. */
  u: number;
}

/**
 * Projects a plane point at the pose `updateDomeFrame` drew that tier with (torsion, sweep
 * and normalisation included), so the lit stage never drifts from its nodes.
 */
export function projectDomePlanePoint(
  runtime: DomeRuntime,
  kind: DomeViewKind,
  px: number,
  pz: number,
  out: DomePlaneSample,
): void {
  const [cy, sy] = runtime.kindTrig[kind];
  ringCoord.px = px;
  ringCoord.py = DOME_PLANE[kind].y;
  ringCoord.pz = pz;
  const p = projectWithTrig(runtime.model, ringCoord, cy, sy, runtime.drawCosPitch, runtime.drawSinPitch);
  out.wx = p.wx;
  out.wy = p.wy;
  if (runtime.zSpan <= 0) {
    out.u = 0;
  } else {
    const t = (p.z - runtime.zMin) / runtime.zSpan;
    out.u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  }
}

/** Fewer samples on small bases; the floor keeps the smallest round. */
export function domeRingSampleCount(r: number): number {
  return Math.max(12, Math.min(DOME_RING_SAMPLES, Math.round(r * 0.65)));
}

/** The camera tween's curve, shared by the morph. */
function domeEaseInOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}
