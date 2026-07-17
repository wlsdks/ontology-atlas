/**
 * Far-field star-dust texture + diffraction spikes — ported from the B2+
 * prototype's `buildStarDust()`/`drawSpike()`
 * (`docs/prototypes/topology-b2plus.html` §8, §12).
 *
 * Both are far-field-only "magnitude = brightness" overlays (B1 constellation
 * DNA, design doc §1.1): dust is a static, near-invisible texture that never
 * re-seeds per frame (so it never reads as noise); diffraction spikes are a
 * crisp 4-point overlay drawn only on the top-`starCount` nodes by
 * `magnitude` (`count + degree*18`, prototype `computeMagnitude()` —
 * magnitude ranking itself is NOT this module's job, it's a graph-data
 * derivation the adapter/HomePage layer computes once and passes in as
 * `isBrightStar` per node).
 *
 * Zero React imports — pure Canvas 2D drawing plus one extractable pure
 * helper (`computeStarDustCount`, unit-tested in `starfield.test.ts`).
 *
 * STUB: the lead implements both draw bodies.
 */

export interface DustPoint {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/**
 * `Math.round(viewportWidth * viewportHeight / areaPerPoint)` — the dust
 * point count target. `areaPerPoint` = `--topology-v2-dust-area-per-point`
 * (5200 px²). Actual point placement is seeded (`mulberry32(7)` in the
 * prototype) and therefore NOT pure with respect to this function alone —
 * placement lives in `draw()`'s TODO body, this helper only pins the count.
 */
export function computeStarDustCount(
  _viewportWidth: number,
  _viewportHeight: number,
  _areaPerPoint: number,
): number {
  throw new Error(
    "TODO(lead): implement computeStarDustCount per the prototype's buildStarDust() — starfield.test.ts pins the contract.",
  );
}

export interface StarDustDrawState {
  points: readonly DustPoint[];
  farT: number;
  devicePixelRatio: number;
}

/** Draws the static dust texture, fading in with `farT` (never fully at circuit altitude). */
export function drawStarDust(
  _ctx: CanvasRenderingContext2D,
  _state: StarDustDrawState,
): void {
  throw new Error(
    "TODO(lead): implement drawStarDust per the prototype's dust-drawing loop in render() — see docs/TOPOLOGY-V2-DESIGN.md §3.1.",
  );
}

export interface DiffractionSpikeDrawState {
  screenX: number;
  screenY: number;
  /** Node's own screen-space draw radius — spike arm lengths scale off this (`r*2.6`/`r*1.5`). */
  screenRadius: number;
  color: string;
  /** farT-gated — spike is invisible at farT<=0.02, fully present by farT=1 (prototype: `alpha = farT`). */
  alpha: number;
}

/** Draws one crisp 4-point diffraction spike — solid tapering slivers, no gradient/blur/glow. */
export function drawDiffractionSpike(
  _ctx: CanvasRenderingContext2D,
  _state: DiffractionSpikeDrawState,
): void {
  throw new Error(
    "TODO(lead): implement drawDiffractionSpike per the prototype's drawSpike() — forbidden.md bans glow/halo, this must stay solid-fill.",
  );
}
