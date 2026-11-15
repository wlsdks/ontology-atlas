import { clampDomePitch, DOME_PITCH_DEFAULT, type DomeDragSpring } from './orbit';
import type { DomeCircle, DomeCoord, DomeModel, DomeViewKind } from './types';

export interface DomeTierRampAnchor {
  from: number;
  fromT: number;
}

export const DOME_TIER_RAMP_START: DomeTierRampAnchor = { from: 0, fromT: 0 };

/**
 * Draw, hit test, popover anchor and `__atlasMap` instrumentation read this one map, so
 * clicks follow where a node was drawn. Updated in place; no per-frame allocation once the
 * node set is stable.
 */
export interface DomeNodeFrame {
  dx: number;
  dy: number;
  /**
   * Inverted so base radius (radiusForKind × magnitudeScale) × s gives `DOME_NODE_PX` ×
   * perspective ÷ zoom; draw, hit and instrumentation all use base × s, so they agree.
   */
  s: number;
  /** This kind's assembly ramp, 0..1, the interpolator for crossfades (label, fog, width). */
  a: number;
  /** Normalised depth this frame, 0 near to 1 far; input to fog and line width. */
  u: number;
}

/**
 * Call when a rebuild completes while the dome is on screen; `durationMs` 0 is a cut
 * (reduced motion).
 */
export function beginDomeMorph(runtime: DomeRuntime, next: DomeModel, nowMs: number, durationMs: number): void {
  const prev = runtime.model;
  runtime.model = next;
  runtime.morph =
    durationMs > 0
      ? { fromCoords: prev.coords, fromCircles: prev.circles, startMs: nowMs, durationMs }
      : null;
}

/**
 * The dome step runs only while 3D is on or tearing down, so anything in flight when 2D took
 * over stays frozen and the idle gate counts it as motion forever. Nothing is visible, so
 * this is a pure bookkeeping reset.
 */
export function settleDomeRuntimeOffscreen(runtime: DomeRuntime): void {
  runtime.yawVel = 0;
  runtime.pitchVel = 0;
  runtime.yawSnap = null;
  runtime.poseTween = null;
  runtime.morph = null;
  runtime.orbiting = false;
  runtime.drag = null;
  runtime.entryArmed = false;
  // A fly-to belongs to the 3D view it moved.
  runtime.flyRequest = null;
  runtime.nudgeReturn = null;
  runtime.flight = null;
  runtime.lag.project = 0;
  runtime.lag.domain = 0;
  runtime.lag.capability = 0;
  runtime.lag.element = 0;
  runtime.pitch = clampDomePitch(runtime.pitch);
  runtime.pitchTarget = runtime.pitch;
  runtime.yawTarget = runtime.yaw;
}

/**
 * Shares the camera tween's ease-in-out clock and is dropped the instant a gesture begins,
 * so the gesture takes over from the current pose.
 */
interface DomePoseTween {
  startYaw: number;
  startPitch: number;
  targetYaw: number;
  targetPitch: number;
  /** The camera tween's clock. */
  startMs: number;
  durationMs: number;
  /** So pose and camera decelerate on one curve. */
  ease?: "out";
}

/**
 * A double-click or Enter flies a node to the front and frames its family; Esc or Home
 * flies back. A single click only selects, so the viewpoint stays the reader's. Longer
 * than `DOME_POSE_MS` because it pairs a turn with a zoom; reduced motion arrives at once.
 */
export const DOME_FLY_MS = 800;

interface DomeFlight {
  slug: string;
  returnYaw: number;
  returnPitch: number;
  returnCamera: { tx: number; ty: number; tscale: number };
}

/** Normalised like `DomeNodeFrame`, or equal depths would draw at different brightness. */
interface DomeRingSample {
  wx: number;
  wy: number;
  u: number;
}

interface DomeRing {
  kind: DomeViewKind;
  /** Rings rise and fall with their tier across the 2D↔3D transition. */
  a: number;
  points: DomeRingSample[];
  /**
   * The screen-rightmost sample, stable under rotation and on the side the index panel never
   * covers; null for cone bases, which carry no name.
   */
  label: DomeRingSample | null;
}

/**
 * Frames between one model and the next when the arrangement or world changes on screen:
 * each node draws at `lerp(from, to, ease(t))`, one without a previous coordinate takes its
 * target, and old bases fade out as new ones fade in. `DOME_POSE_MS` long, so a refit runs
 * on the same clock; reduced motion passes 0 and gets the cut.
 */
interface DomeMorph {
  fromCoords: ReadonlyMap<string, DomeCoord>;
  fromCircles: readonly DomeCircle[];
  startMs: number;
  durationMs: number;
}

/**
 * The one state box the loop (`use-topology-loop.ts`) updates each frame; pointer handlers
 * and instrumentation read this frame's coordinates and pose from it, and gestures decide
 * through the same `hitTestWorld` as 2D.
 */
export interface DomeRuntime {
  model: DomeModel;
  /** The idle gate counts a morph as motion. */
  morph: DomeMorph | null;
  /** Updated in place by `updateDomeFrame`; entries and arrays are reused. */
  rings: DomeRing[];
  /**
   * A pending fly-to: a slug flies to that node, null flies back; consumed by the next dome
   * frame. `nudge` is the one camera move a click may make: slide sideways just enough that
   * the inspector it opened does not cover the selected node.
   */
  flyRequest: { slug: string | null; nudge?: true; unnudge?: true } | null;
  /**
   * A deselect slides back to `before` only while the target still equals `landed`, so a
   * view the reader moved since is never taken; without the return a nudge could leave the
   * next concept under the INDEX panel.
   */
  nudgeReturn: { before: { tx: number; ty: number; tscale: number }; landed: { tx: number; ty: number; tscale: number } } | null;
  /** null when no fly-to has moved the view. */
  flight: DomeFlight | null;
  /** Read by `projectDomePlanePoint`. */
  kindTrig: Record<DomeViewKind, [number, number]>;
  /** The lit stage rises with its tier. */
  kindRamp: Record<DomeViewKind, number>;
  /** `u = (z − zMin) / zSpan`; zSpan 0 means no depth. */
  zMin: number;
  zSpan: number;
  /** Hit testing and instrumentation judge against it. */
  frame: Map<string, DomeNodeFrame>;
  /**
   * Anchors the pan leash where the dome is drawn; the 2D bounds sat off the fit's centre and
   * dragged the camera on the first wheel tick. null when the frame is empty.
   */
  drawnBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /**
   * The factor that frames the whole dome with 15% margin. While the dome is on, the camera
   * floor drops to it, so a fit target below the 2D floor stays reachable and zoom-out can
   * return to the whole dome. null = dome off.
   */
  fitScale: number | null;
  /** Invalidates the edge candidate cache, since entries update in place. */
  frameEpoch: number;
  yaw: number;
  pitch: number;
  yawTarget: number;
  pitchTarget: number;
  /** Release momentum in rad/ms, reduced every frame by `decayOrbitVelocity`. */
  yawVel: number;
  /** Pitch release momentum in rad/ms, the same decay. */
  pitchVel: number;
  /**
   * The meaningful landing the release momentum is aimed at (see `ORBIT_SNAP_WINDOW_RAD`), or
   * null; any new input clears it.
   */
  yawSnap: number | null;
  /**
   * Idle spin belongs to a screen nobody has touched: any intervention disarms it for good,
   * so rotation never fights the pose being worked on. Only the auto-align chip and
   * re-entering 3D re-arm it.
   */
  spinArmed: boolean;
  /** Any gesture clears it and inherits the current pose. */
  poseTween: DomePoseTween | null;
  /** Per-kind yaw torsion in rad, charged by orbit drag and decayed every frame. */
  lag: Record<DomeViewKind, number>;
  /** Assembly clock in ms, 0 to `DOME_ASSEMBLE_TOTAL_MS`: forward on, backward off. */
  rampClock: number;
  folding: boolean;
  rampAnchor: Record<DomeViewKind, DomeTierRampAnchor>;
  /**
   * Off the moment a hand touches the map: the sweep offsets only the drawn pose, so a grab
   * would back-project against a different pose and the node would jump.
   */
  entryArmed: boolean;
  /** Entry sweep clock in ms, from 0 on every re-entry. */
  entryClock: number;
  /**
   * Holds `yaw/pitch` plus the sweep offset, written every frame; relation control points read it,
   * or during entry a curve would pass through a different world than its endpoints.
   */
  drawYaw: number;
  drawPitch: number;
  /** Computed once per frame, since control points are computed per edge. */
  drawCosYaw: number;
  drawSinYaw: number;
  drawCosPitch: number;
  drawSinPitch: number;
  /** 3D is on and no realm is active: the branch between orbit and in-plane drag. */
  active: boolean;
  /** Stops idle spin and momentum. */
  orbiting: boolean;
  /** Survives `released` until the spring settles, keeping velocity continuous. */
  drag: { nodeId: string; spring: DomeDragSpring; targetPx: number; targetPz: number; released?: boolean } | null;
  /**
   * The layout on screen is still relaxing and rewrites every coordinate as iterations finish,
   * so no node drag starts and `flyRequest` waits until it is final.
   */
  settling: boolean;
}

export function createDomeRuntime(model: DomeModel): DomeRuntime {
  return {
    model,
    morph: null,
    frame: new Map(),
    rings: [],
    flyRequest: null,
    nudgeReturn: null,
    flight: null,
    kindTrig: { project: [1, 0], domain: [1, 0], capability: [1, 0], element: [1, 0] },
    kindRamp: { project: 0, domain: 0, capability: 0, element: 0 },
    zMin: 0,
    zSpan: 0,
    drawnBounds: null,
    fitScale: null,
    frameEpoch: 0,
    yaw: 0.55,
    pitch: DOME_PITCH_DEFAULT,
    yawTarget: 0.55,
    pitchTarget: DOME_PITCH_DEFAULT,
    yawVel: 0,
    pitchVel: 0,
    spinArmed: true,
    poseTween: null,
    yawSnap: null,
    entryArmed: true,
    entryClock: 0,
    drawYaw: 0,
    drawPitch: DOME_PITCH_DEFAULT,
    drawCosYaw: 1,
    drawSinYaw: 0,
    drawCosPitch: Math.cos(DOME_PITCH_DEFAULT),
    drawSinPitch: Math.sin(DOME_PITCH_DEFAULT),
    lag: { project: 0, domain: 0, capability: 0, element: 0 },
    rampClock: 0,
    folding: false,
    rampAnchor: {
      project: DOME_TIER_RAMP_START,
      domain: DOME_TIER_RAMP_START,
      capability: DOME_TIER_RAMP_START,
      element: DOME_TIER_RAMP_START,
    },
    active: false,
    orbiting: false,
    drag: null,
    settling: false,
  };
}
