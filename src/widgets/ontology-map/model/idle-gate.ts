/**
 * Idle-frame predicates. Past the grace window the frame loop stops, so whatever turns one true
 * outside a frame must wake it: input and a write to the activity clock do, and so does a render.
 */

export interface CanvasActivityFlags {
  /** Dragging, pressing or hover-moving. */
  pointerActive: boolean;
  /** A drag, or settling after release. */
  simWarm: boolean;
  /** Auto-arrange, or the first-map reveal. */
  homing: boolean;
  selectionPulseActive: boolean;
  /** The only always-on motion. */
  egoTailAnimating: boolean;
  /** `model/growth-replay.ts` */
  growthReplaying?: boolean;
  emphasisTarget: boolean;
  /**
   * No live focus remains but the retained colorFocus fades as the ramp decays. The decay and
   * the clear run only inside a frame, so skipping one freezes the ring at full opacity.
   */
  focusFadeSettling: boolean;
  /** Pass false under reduced motion. */
  breathing: boolean;
  cameraMoving: boolean;
  /** The spotlight ramp steps only inside a frame, so a skip mid-transition freezes it. */
  spotlightSettling: boolean;
  /**
   * The lens arrives through a ref, not React state, so no effect can wake the loop; "ref ≠
   * last drawn state" buys one frame.
   */
  trailLensSettling: boolean;
  /**
   * An open lens with walked relations keeps the loop awake, or the trail's twinkle and the
   * light carrying direction never run. Ambient sleep may stop it; the idle gate must not.
   */
  trailMotionActive: boolean;
  /** A crossfade the person asked for; without it the ramp stutters or stops halfway. */
  galaxySettling: boolean;
  galaxyAtmosphereActive: boolean;
  lightActive: boolean;
}

/**
 * One predicate for all three branches, so ambient sleep reaches each: a node left selected
 * must still let the app sleep. The hover pulse stays outside the condition, since hover is
 * input and the app is already awake when it fires.
 */
export interface EgoTailActivityInput {
  reducedMotion: boolean;
  ambientAsleep: boolean;
  hasDependsEdges: boolean;
  edgePulseSpeed: number;
  /** The incident-contains comet case. */
  focused: boolean;
  hasContainsEdges: boolean;
  livePulseCount: number;
}

export function isEgoTailAnimating(input: EgoTailActivityInput): boolean {
  if (input.livePulseCount > 0) return true;
  if (input.reducedMotion || input.ambientAsleep) return false;
  if (input.hasDependsEdges && input.edgePulseSpeed > 0) return true;
  return input.focused && input.hasContainsEdges;
}

/**
 * The autonomous spin sleeps under the same `ambient-sleep.ts` contract as the comets; one
 * predicate so the condition cannot reach only one of the two sites. Hand-driven terms
 * (`orbiting`, `yawVel`) stay out.
 */
export interface DomeSpinInput {
  /** No realm transition is in flight. */
  domeOn: boolean;
  reducedMotion: boolean;
  ambientAsleep: boolean;
  /** Lowered by any intervention: orbit, zoom, node drag, select. */
  spinArmed: boolean;
  /** Held still so the aimed node cannot slide away under the cursor. */
  pointerOverCanvas: boolean;
  assembled: boolean;
}

export function isDomeSpinAnimating(input: DomeSpinInput): boolean {
  return (
    input.domeOn &&
    !input.reducedMotion &&
    !input.ambientAsleep &&
    input.spinArmed &&
    !input.pointerOverCanvas &&
    input.assembled
  );
}

export function isCanvasActive(flags: CanvasActivityFlags): boolean {
  return (
    flags.pointerActive ||
    flags.simWarm ||
    flags.homing ||
    flags.selectionPulseActive ||
    flags.egoTailAnimating ||
    flags.growthReplaying === true ||
    flags.emphasisTarget ||
    flags.breathing ||
    flags.cameraMoving ||
    flags.focusFadeSettling ||
    flags.spotlightSettling ||
    flags.trailLensSettling ||
    flags.trailMotionActive ||
    flags.galaxySettling ||
    flags.galaxyAtmosphereActive ||
    flags.lightActive
  );
}

/** Protects the tail of a decaying ramp. */
export function shouldSkipFrame(nowMs: number, lastActiveMs: number, graceMs: number): boolean {
  return nowMs - lastActiveMs > graceMs;
}

/**
 * Target against value: skipped frames run no physics, so a wheel changing only the target
 * would never wake the loop.
 */
export function isCameraUnsettled(
  camera: { x: number; y: number; scale: number },
  target: { tx: number; ty: number; tscale: number },
  positionEps = 0.01,
  scaleEps = 0.0001,
): boolean {
  return (
    Math.abs(camera.x - target.tx) > positionEps ||
    Math.abs(camera.y - target.ty) > positionEps ||
    Math.abs(camera.scale - target.tscale) > scaleEps
  );
}
