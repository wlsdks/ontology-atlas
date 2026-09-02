/**
 * 3D view — an opt-in mode with two truthful arrangements: the **Dome** lays
 * ownership onto concentric kind rings; the **Cloud** lets relations place nodes
 * freely across all three axes. The top toolbar's 3D picker chooses between them.
 *
 * **3D here is a different layout, not a projection tweak.** The first
 * implementation (2026-08-18, morning) kept the 2D placement and only added a
 * per-kind z-lift; the owner turned it on and judged "I can't tell what changed" (I can't tell what changed). What the owner pointed at was the hero engine's
 * object (`hero-engine.js`): **the containment spine unrolled into rings** —
 * project at the apex, then a domain ring, a capability ring, an element ring. A
 * node's angle on its ring comes from its containment parent (children fan out
 * inside the parent's sector), so both z and angle carry **typed facts**: height
 * = the kind's containment tier, angle = ownership. Cloud has a separate
 * relation-force derivation documented beside `buildCouplingCloudTargets` below.
 *
 * **Why opt-in rather than default.** Turning the same data into a dome
 * multiplies edge crossings (hero measurement 58.0 → 190.7, 3.29×; crossing
 * minimisation dominates graph readability, Purchase 1997). So the default map
 * stays 2D; 3D is for asking either the ownership or coupling question as shape.
 * The measured cost is in `docs/DECISIONS.md`, entry 2026-08-18.
 *
 * **Camera and rotation grammar.** Dome coordinates are projected **into world 2D**
 * and then ride the existing camera (pan clamp, wheel zoom, fit) — no second
 * renderer and no 3D library, only weak perspective `s = f/(f+z)`, same as the
 * hero. Render handoff follows the offset grammar S5 parallax established: world
 * coordinates stay untouched, and draw, hit-test and instrumentation share **one
 * frame map** (`DomeRuntime.frame`) so a click during rotation lands where the
 * node was drawn.
 *
 * - Idle spin: `DOME_PERIOD_MS` (48 s/turn). Stops while the pointer is over the
 *   canvas (so an aimed-at node does not slide out from under the cursor), and is
 *   0 under `prefers-reduced-motion`.
 * - Orbit: dragging empty space is yaw/pitch. Release coasts to a stop with the
 *   same decay constant as `--topology-v2-camera-momentum-decay`. It is
 *   user-initiated, so reduced-motion keeps 1:1 tracking and zeroes only the
 *   momentum (WCAG 2.3.3's direct-manipulation exception — the same contract as
 *   pan/pinch).
 * - Node drag: moves **only within its own kind plane** (`solveDomePlanePoint`).
 *   One screen point maps to infinitely many depths, so allowing free movement
 *   would fling a node to an arbitrary z and break the typed fact z carries.
 *
 * **Scale and alpha.** The perspective factor `s` is geometry, so it always
 * applies (node radius × s — draw, hit and instrumentation use the identical
 * expression). Depth fog adds no new ramp: it calls the S5 clarity ramp
 * (`realmDepthClarityAlpha`) by kind tier. Continuous rotation-driven fog is not
 * available, because the darkest ink (`--topology-v2-ink-depth-leaf`) needs a
 * minimum alpha of 0.955 to hold WCAG 1.4.11's 3:1 floor (composite measurement,
 * `topology-ink-contrast.contract.test.ts`). Depth is carried by scale, position
 * and motion parallax instead.
 *
 * **Why these constants are not tokens** — the `camera-easing.ts` /
 * `realm-transition.ts` precedent: the values govern feel (geometry, timing), not
 * a theme surface.
 */
export type DomeViewKind = "project" | "domain" | "capability" | "element";

const TAU = Math.PI * 2;

/**
 * kind → containment tier (the project root at the apex, element leaves on the
 * bottom ring). The spine order from `docs/ONTOLOGY-ATLAS-SPEC.md` §2 — this
 * table is the typed fact that height carries.
 */
export const KIND_DEPTH: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
};

/** Idle spin period — the hero engine's 48 s/turn, unchanged. */
export const DOME_PERIOD_MS = 48000;
/**
 * Default look-down angle (rad). The hero engine's 0.34 (19°) was tuned for a
 * single dome whose only rings were wide latitude circles; on the cone tree the
 * bases are small circles under each parent, and at 19° they squash into lines.
 * 0.5 (29°) opens them enough to read as circles while the tree still reads as
 * standing rather than as a plan view.
 */
export const DOME_PITCH_DEFAULT = 0.5;
/**
 * Pole margin for pitch (rad) — at exactly ±π/2 the screen's "up" flips beyond
 * the pole (yaw direction inverts). This margin exists only to prevent that flip.
 */
const DOME_PITCH_POLE_MARGIN = 0.12;
/**
 * How far orbit drag may pitch — **all the way to just short of the poles**.
 *
 * The value inherited from the hero was 0.12–0.72 (6.9°–41.3°), and the owner hit
 * exactly that wall (2026-08-18: *"You can't go from below looking up"* — you can't go from
 * below looking up). This mode's charter is turning the thing every which way, so
 * only walls that really exist are locked:
 *
 * - **±π/2 (poles)**: past this the screen's up flips and yaw drag reverses. The
 *   only real wall, locked by `DOME_PITCH_POLE_MARGIN`. Its feel comes from
 *   `resistDomePitch`'s quarter resistance plus the overshoot cap, which say
 *   "this is the end".
 * - **0° (edge-on)**: the rings degenerate into a single line, but it is an angle
 *   you **pass through** — the only route to looking up from below (pitch<0), so
 *   it is not locked. Depth fog and line width normalise z per frame and hold at
 *   any angle, and labels are on demand (hover, focus, trail) so there is no
 *   overlap explosion.
 * - **±83° (plan / underside view)**: the rings flatten into concentric circles —
 *   the angle where ownership (the bearing) reads best instead of depth. A
 *   different reading, not a degenerate one. Allowed.
 */
export const DOME_PITCH_MAX = Math.PI / 2 - DOME_PITCH_POLE_MARGIN;
export const DOME_PITCH_MIN = -DOME_PITCH_MAX;
/**
 * Rubber-band overshoot cap (rad) — the quarter resistance is linear, so a hard
 * pull could still cross the pole; this caps the squash itself. It must stay below
 * `POLE_MARGIN` (0.12) so the screen's up never flips even while pressed.
 */
const DOME_PITCH_OVERSHOOT_CAP = 0.09;
/**
 * Perspective focal distance (dome units) — smaller is a wider lens, i.e. a bigger
 * front-to-back scale difference.
 *
 * The value inherited from the hero engine was 1050. The hero is **one screen's
 * decorative object**, where strong perspective would rightly be distracting. The
 * map, though, is opened to read *this is in front, that is behind*, and at 1050
 * that difference barely exists: the bottom ring's radius is 224, so the nearest
 * point is 1050/(1050−224) = **1.27** and the farthest 1050/(1050+224) = **0.82**,
 * a ratio of 1.55. A few px of diameter difference on one disc does not read as
 * depth, and fog ended up carrying depth alone.
 *
 * Narrowing to 760 gives 1.42 / 0.77 = **1.84**. Front-to-back size difference
 * opens up 19% more in the same scene, and a node rotating to the front now
 * arrives **growing** — that size change is itself part of motion parallax, so
 * depth strengthens both in a still frame and during rotation (Ware & Franck 1996
 * — structured 3D motion contributes more than stereo).
 *
 * Why not narrower: below 500 the bottom ring's near arc is pushed off screen
 * (projection factor above 2), and a clipped ring stops working as a latitude
 * depth cue.
 */
export const DOME_FOCAL = 760;
/**
 * Longest programmatic pose move (ms) — 「Home」 (the re-fit / home action) and
 * selection reframe. Half a turn (π, the worst case of the nearest-equivalent-
 * angle rule) gets this long. The 2D camera tween cap (420 ms) belongs to pan and
 * zoom and is far too abrupt for half a turn, which then reads as a whip (measured:
 * 2.3 rad in 93 ms). This promotes the 750 ms 「Home」 was already using into the
 * name for the pose-move cap.
 */
export const DOME_POSE_MS = 750;
/**
 * Orbit drag sensitivity — screen px → yaw (rad).
 *
 * The hero used 0.006, sized for its small canvas, and the owner judged rotation
 * on the map canvas "Rotation feels stiff" (rotation feels stiff, 2026-08-18). three.js
 * OrbitControls' standard mapping is `2π × dx / clientHeight`, which for our map
 * canvas height (~900 px) works out to ≈0.007/px; raised to 0.0075 to match (one
 * full turn = 838 px of drag). A constant rather than the formula because binding
 * it to canvas height would let a window resize change the sensitivity and leave
 * tests unreproducible.
 */
export const ORBIT_YAW_PER_PX = 0.0075;
/** Orbit drag sensitivity — screen px → pitch (rad). Lower than yaw so horizontal stays the primary axis. */
export const ORBIT_PITCH_PER_PX = 0.005;
/**
 * Time constant for orbit input smoothing (ms) — during a drag, yaw/pitch chase
 * the **target** the pointer set (`yawTarget`) by `1−exp(−dt/τ)` each frame.
 *
 * Why chase a target (measured 2026-08-18): yaw used to be added directly on every
 * pointermove, so whenever the event period exceeded the frame period (120 Hz
 * ProMotion display + 60 Hz pointer, or a 25 ms event interval in the harness)
 * rotation drew as a staircase — 23 px of jump in one frame, then two frames still.
 * The total is 1:1, but the delivery judders and that reads as "stiff". Smoothing
 * spreads the gap across frames. reduced-motion snaps to the target with no
 * smoothing (1:1 direct manipulation preserved).
 *
 * Same principle as three.js OrbitControls' dampingFactor (≈τ 90 ms at 60 Hz) and
 * yomotsu camera-controls' smoothTime, only tighter — technique only, no code
 * ported.
 */
export const ORBIT_SMOOTH_TAU_MS = 14;

/*
 * ⚠️ **45 → 14 (2026-08-19, owner: *"The mouse moves in stutters"* — the mouse
 * moves in stutters).**
 *
 * 45 ms was chosen to remove the staircase, but it was **five times wider than the
 * staircase it had to remove.** In exponential chasing τ is the time to reach 63%
 * of the target, so 45 ms means ~135 ms to 95% — **16 frames** at 120 Hz. For all
 * of that the dome trails where the hand has already been. The staircase went and
 * "it doesn't follow my hand" arrived in its place, which in direct manipulation is
 * the worse illness (1:1 is the contract).
 *
 * Actual size of the hole being filled: a 60 Hz pointer with a 120 Hz display
 * leaves **one frame (8.3 ms)** empty. τ=14 ms spreads that one frame over two
 * while keeping the lag to about a frame — the staircase still goes and the lag
 * does not arrive.
 *
 * Why not lower: once τ drops below the frame interval, smoothing is effectively
 * off and the original staircase returns.
 */
/**
 * Geometric decay per ms for release momentum — the same value as
 * `--topology-v2-camera-momentum-decay` (0.998). Coasts to a stop with the same
 * feel as a camera flick (the R4 motion charter's iOS deceleration constant — we do
 * not invent a new easing).
 */
const ORBIT_VEL_DECAY_PER_MS = 0.998;
/**
 * **Release projection and "a landing that means something".**
 *
 * With momentum alone the dome stops at **any** angle. Physically honest, but as a
 * product it is an accident: where the screen ends up after release means nothing.
 *
 * Apple's *Designing Fluid Interfaces* (WWDC18 803) prescribes two steps: ①
 * compute the **natural landing point** from the release velocity first, then ② if
 * that landing point is near a meaningful position, **re-aim** the deceleration at
 * it. That is what UIScrollView paging does, and why scrolling stops at "the next
 * page" rather than at an arbitrary offset.
 *
 * On this dome the meaningful positions are **domain meridians**: stopping there
 * puts one domain squarely at the front with its containment fan spread across the
 * centre of the screen — where someone rotating in order to read was actually
 * headed.
 *
 * **Why the window is narrow (this is the feature's safety catch).** Re-aim only
 * when the natural landing point is **already close**. A wide window turns into
 * "the app moved the position I set", which breaks the direct-manipulation
 * contract. Outside the window nothing happens and momentum stops as before.
 */
export const ORBIT_SNAP_WINDOW_RAD = 0.14;

/**
 * **Total-travel coefficient** of the geometric decay (ms) — `Σ v·d^t dt = v /
 * (−ln d)`. Multiply the release velocity by this for the angle it will still turn
 * if left alone.
 */
export const ORBIT_DECAY_TRAVEL_MS = 1 / -Math.log(ORBIT_VEL_DECAY_PER_MS);

/** Release velocity (rad/ms) → the yaw it stops at if left alone. */
export function projectOrbitLanding(yaw: number, yawVel: number): number {
  return yaw + yawVel * ORBIT_DECAY_TRAVEL_MS;
}

/**
 * **Longest coast a flick may buy (rad) — half a turn.**
 *
 * Measured 2026-09-02: a moderate flick (200 px in ~150 ms) released at
 * 0.01 rad/ms and, with the shared 0.998/ms decay, coasted 1.8 turns. Past half
 * a turn the person has lost which face was in front, so the extra travel
 * carries no information, and the landing re-aim (`ORBIT_SNAP_WINDOW_RAD`)
 * rarely engages because the natural landing point lands anywhere. The
 * decay constant stays shared with the camera flick; only the release velocity
 * is capped so the total travel never exceeds π. A drag itself is never capped
 * (1:1 direct manipulation).
 */
export const ORBIT_COAST_MAX_RAD = Math.PI;

/** Clamp a release velocity (rad/ms) so the coast it buys stays within `ORBIT_COAST_MAX_RAD`. */
export function clampOrbitReleaseVelocity(velRadPerMs: number): number {
  const max = ORBIT_COAST_MAX_RAD / ORBIT_DECAY_TRAVEL_MS;
  return Math.max(-max, Math.min(max, velRadPerMs));
}

/**
 * The yaws that put a domain **at the front** — this dome's meaningful positions.
 *
 * Derivation: in `projectWithTrig` the post-rotation depth term is
 * `zr = r·sin(θ + yaw)` (θ being that node's bearing on its ring), and the point
 * nearest the camera is where `zr` is minimal. So `θ + yaw = −π/2`, i.e.
 * **yaw = −π/2 − θ**.
 */
export function domeFacingYaws(model: DomeModel, kind: DomeViewKind = "domain"): number[] {
  const out: number[] = [];
  const planeR = DOME_PLANE[kind].r;
  for (const coord of model.coords.values()) {
    if (Math.abs(coord.py - DOME_PLANE[kind].y) > 1e-6) continue;
    if (planeR <= 0) continue;
    const theta = Math.atan2(coord.pz, coord.px);
    out.push(-Math.PI / 2 - theta);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The meaningful position near the natural landing point, or null (momentum as
 * before). Candidates are 2π-periodic, so each is folded to the **equivalent angle
 * nearest the landing point** before comparing.
 */
export function snapOrbitLanding(
  landing: number,
  candidates: readonly number[],
  windowRad = ORBIT_SNAP_WINDOW_RAD,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    // The c + 2πk nearest to landing.
    const turns = Math.round((landing - c) / TAU);
    const near = c + turns * TAU;
    const dist = Math.abs(near - landing);
    if (dist < bestDist) {
      bestDist = dist;
      best = near;
    }
  }
  return best !== null && bestDist <= windowRad ? best : null;
}

/**
 * Time constant of the exponential approach that carries the dome to its landing
 * (ms) — **derived so it continues the release velocity**: `d/dt = (target −
 * yaw)/τ` must equal `yawVel` at the moment of release, hence
 * `τ = (target − yaw)/yawVel`.
 *
 * That one line is what makes velocity continuous; a fixed τ makes speed jump on
 * the frame the hand lifts. The range is clamped: too short teleports, too long
 * never stops.
 */
export const ORBIT_SNAP_TAU_MIN_MS = 90;
/**
 * The 320 ms cap is about **tail length** (measured 2026-08-18). At 600 ms a big
 * flick was still 0.033 rad from target 2.6 s later — invisible (under 1 px on the
 * outer ring), but the rAF loop stays awake the whole time. At 320 ms even the
 * worst case is inside the arrival threshold (`ORBIT_SNAP_ARRIVE_RAD`) within 2 s.
 */
export const ORBIT_SNAP_TAU_MAX_MS = 320;

/**
 * Residual counted as arrived (rad) — must be **smaller than 1 px**.
 *
 * Measured on the outer ring: `224 (dome units) × unit (≈1.8) × factor (≈0.315) ≈
 * 127 px/rad`, so 1 px ≈ 0.008 rad; we use half of that. An exponential approach
 * never reaches its target in principle, so without this threshold the loop would
 * stay awake forever.
 */
export const ORBIT_SNAP_ARRIVE_RAD = 0.004;

export function orbitSnapTauMs(delta: number, yawVel: number): number {
  if (Math.abs(yawVel) < 1e-9) return ORBIT_SNAP_TAU_MAX_MS;
  const tau = delta / yawVel;
  if (!Number.isFinite(tau) || tau <= 0) return ORBIT_SNAP_TAU_MAX_MS;
  return Math.min(ORBIT_SNAP_TAU_MAX_MS, Math.max(ORBIT_SNAP_TAU_MIN_MS, tau));
}

/** Below this |yawVel| (rad/ms), snap to 0 — prevents an infinite tail. */
const ORBIT_VEL_EPS = 0.000005;

/**
 * kind → ring height (y, up is positive) and radius — the hero engine's PLANE
 * table unchanged, in its 620-unit world. `DomeModel.unit` scales it to actual
 * world units.
 */
export const DOME_PLANE: Readonly<Record<DomeViewKind, { y: number; r: number }>> = {
  project: { y: 148, r: 0 },
  domain: { y: 56, r: 148 },
  capability: { y: -48, r: 192 },
  element: { y: -150, r: 224 },
};

/** The dome's nominal bottom radius (dome units) — the element ring. Denominator of the world scale. */
export const DOME_FIT_RADIUS = DOME_PLANE.element.r;

/** Radius cap for in-plane drag (dome units) — 1.5× the bottom ring. Beyond it, direction is kept and length clamped. */
const DOME_DRAG_MAX_RADIUS = DOME_FIT_RADIUS * 1.5;

/**
 * Positive floor for the plane back-projection denominator (dome units) — keeps the
 * solution from flipping behind the camera when the pointer crosses the plane's
 * horizon (see `solveDomePlanePoint`). It is comfortably below `F·sin(pitch)` ≈ 125
 * at the old pitch floor (0.12), so solutions in the normal region are untouched.
 */
const DOME_PLANE_SOLVE_DENOM_MIN = 30;

/**
 * Depth fog — the hero engine's fog ramp unchanged: near nodes 1.0, far nodes 0.09,
 * quadratic falloff. «This contrast is the 3D itself» (this contrast *is* the 3D — hero
 * comment). Far deeper than the 2D map's 3:1 ink contrast floor, which is a
 * dispensation the owner granted for 3D mode alone (`docs/DECISIONS.md`
 * «3D exemption list», the 3D dispensation list). In exchange, whenever something must
 * actually be read (hover, focus, ego, trail) the draw exempts it from fog and
 * brings it back up. `u` is depth normalised within this frame (0 near → 1 far).
 */
export function domeFogAlpha(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 0.09 + 0.91 * Math.pow(1 - c, 1.8);
}

/**
 * Depth halo — the device that makes **near things actually occlude far things** on
 * a 2D canvas. Just before stroking a line, the same curve is stroked once slightly
 * thicker **in the canvas background colour**. Whatever was already drawn behind is
 * cut away by that width, and the eye reads the cut as front-versus-back.
 *
 * Source: Everts et al., *Depth-Dependent Halos: Illustrative Rendering of Dense
 * Line Data*, IEEE TVCG 15(6), 2009 (IEEE Vis 2009 Best Paper) — making halo width
 * **depth-dependent** keeps bundle structure readable in dense line data. The same
 * paper prescribes pairing halos with **line-width attenuation**, which this file
 * already has (`domeLineWidthFactor`). The lineage is Appel et al.'s haloed line
 * (1979).
 *
 * **Why this is not "making things glow".** A halo is **background colour** — it
 * removes ink rather than adding it. The glow the charter forbids spreads colour
 * outwards and **adds** ink. Opposite directions.
 *
 * **Why the width varies with depth.** A halo asserts "I am in front". A far line
 * wearing a thick halo claims to occlude what it could never occlude, which inverts
 * the depth cue. So it is widest near and converges to 0 far away.
 *
 * The unit is **screen px**, not world — a halo is a property of ink, not a size of
 * the object, so the cut must be the same width at any zoom.
 */
export const DOME_HALO_MAX_PX = 3.4;

/** Depth → halo half-width (screen px). u=0 near → max, u=1 far → 0. */
export function domeHaloPx(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return DOME_HALO_MAX_PX * Math.pow(1 - c, 1.35);
}

/**
 * Opacity multiplier for the halo — multiplied into the alpha that line is being
 * drawn at.
 *
 * To cut, the halo must be **denser than what it cuts**. But fog has already
 * dropped far lines to 0.09, so using the alpha as-is would thin the near lines'
 * halos too and cut nothing. Hence a gain, with a cap: pinning it at 1.0 would let
 * a barely-visible far line leave a solid mark on the background.
 */
export const DOME_HALO_ALPHA_GAIN = 2.4;
export const DOME_HALO_ALPHA_CAP = 0.96;

/** Depth → line-width multiplier — the hero's lw attenuation (0.45→1.60) expressed as a multiplier. */
export function domeLineWidthFactor(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 0.35 + 0.55 * (1 - c);
}

/*
 * ── Far-side detail ramp — folds the back hemisphere's secondary strokes away
 * continuously with depth ─────────────────────────────────────────────────────
 *
 * Owner decision (2026-08-19): the remaining cost of 3D rotation was **stroke count
 * itself** (profile: ~24% of draw time in node fill/stroke/translate, ~22% in edge
 * stroke, much of it **secondary strokes** — halos, dimensional shading, seams,
 * outlines). Reducing node count (LOD, culling) was rejected; instead a
 * dispensation opened to omit secondary strokes on the **far side that fog has
 * already flattened to 0.09**, where they contribute almost nothing visually. The
 * marks themselves (discs, relation lines) are unchanged at every depth — the
 * contract that the count is the output is untouched.
 *
 * **Why this shape — three constraints decide the curve.**
 *
 * 1. **Front unchanged**: exactly 1 for u ≤ START. START (0.55) > 0.5, so marks on
 *    the observer's hemisphere multiply by 1 — not one pixel can differ.
 * 2. **No popping**: smoothstep (C¹ continuous, zero slope at both ends), so a node
 *    crossing the boundary as the dome turns cannot lose a stroke with a snap — the
 *    same continuous-depth grammar as fog (`domeFogAlpha`). The draw's skip
 *    conditions (halo 0.05 px, shading 0.01) only fire after this ramp has already
 *    taken them below the visibility limit.
 * 3. **Depth reading preserved**: a halo is the cue that near occludes far (Everts
 *    et al. 2009 — see the `domeHaloPx` doc-block), and that paper itself
 *    prescribes converging far halos to 0 (something that cannot occlude must not
 *    claim to, or the cue inverts). This ramp only brings that convergence forward,
 *    and only on the back hemisphere — front halo widths are unchanged.
 *
 * Why END (0.75) < 1: from u≈0.96 halos already failed the 0.05 px skip condition
 * and went undrawn, so omission is not new grammar — only where the fold starts has
 * moved into the depth fog had already darkened (fog alpha at u=0.75 is 0.16).
 */
export const DOME_DETAIL_FADE_START = 0.55;
export const DOME_DETAIL_FADE_END = 0.75;

/** Depth → multiplier for secondary strokes (halo, shading, seam, outline, pin tick). u≤0.55 → 1, u≥0.75 → 0, C¹ continuous. */
export function domeDetailFactor(u: number): number {
  if (u <= DOME_DETAIL_FADE_START) return 1;
  if (u >= DOME_DETAIL_FADE_END) return 0;
  const t = (u - DOME_DETAIL_FADE_START) / (DOME_DETAIL_FADE_END - DOME_DETAIL_FADE_START);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * kind → dot radius (dome units) — the hero's NODE_R unchanged. 3D is a layer for
 * reading **shape**, not a data table, so nodes are drawn as dots rather than
 * numbered chips (owner judgment: the feel of the hero). Screen radius is
 * `× 2.1 × unit × perspective s`, the hero's ratio.
 */
export const DOME_NODE_R: Readonly<Record<DomeViewKind, number>> = {
  project: 10.5,
  domain: 4.6,
  capability: 3.1,
  element: 2.05,
};

/** Deterministic hash → [0,1) — the hero engine's FNV-1a jitter, unchanged (angle stability). */
function domeHash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export interface DomeInputNode {
  id: string;
  kind: DomeViewKind;
  x: number;
  y: number;
  parentId: string | null;
}

/** One node's dome coordinates (dome units) — px/pz on the ring plane, py the kind height. */
export interface DomeCoord {
  px: number;
  py: number;
  pz: number;
}

/**
 * One **cone base** — the circle a parent's children rest on (dome units). The
 * project's base is the domain ring; every parent with two or more children gets
 * its own, centred directly under that parent on the children's kind plane. These
 * are the coordinate system the draw shows as rings (`DOME_RING_KINDS` doc-block).
 */
interface DomeCircle {
  /** The tier of the children resting on this circle — its assembly ramp and yaw torsion follow that tier. */
  kind: DomeViewKind;
  cx: number;
  cz: number;
  y: number;
  r: number;
}

export interface DomeModel {
  /**
   * Which arrangement produced these coordinates — the draw decides whether to draw
   * rings from this. A coupling cloud has no kind planes, so latitude rings would
   * be a lie rather than a coordinate system.
   */
  arrangement: DomeArrangement;
  /** 2D layout centre (world) — the dome sits on it (camera continuity). */
  centerX: number;
  centerY: number;
  /** Dome units → world units — sized so the element ring overlaps the 2D layout radius. */
  unit: number;
  coords: Map<string, DomeCoord>;
  /** Cone bases (ownership only; empty for the cloud) — see `DomeCircle`. */
  circles: DomeCircle[];
}

/**
 * **Ownership layout — a cone tree, not a dome of rings (2026-09-02).**
 *
 * The first ownership layout (2026-08-18, ledger (76)) was the hero engine's dome:
 * every kind on one latitude ring, a node's bearing taken from its parent's
 * sector. Measured against the dogfood vault and a 1,000-node synthetic vault it
 * failed on distribution rather than on shape: 70% of the nodes (the elements) sat
 * on the single lowest, widest ring, which at the default pitch flattens into a
 * band, so the crowd overlapped in exactly the place the eye lands, while the top
 * half of the silhouette stayed empty. Ownership was carried only by *sector*, a
 * fact the 2D map already shows by proximity.
 *
 * A cone tree (Robertson, Mackinlay & Card, "Cone Trees: animated 3D
 * visualizations of hierarchical information", CHI 1991) keeps both typed facts
 * and strengthens the second:
 *
 * - **height = containment tier** — unchanged, the kind planes of `DOME_PLANE`;
 * - **position = ownership** — a parent is the apex of its own cone and its
 *   children rest on that cone's base circle, **directly under it**, not merely
 *   inside its sector. A subtree is a physical bump you can point at and rotate to
 *   the front.
 *
 * Geometry, all deterministic (sorted by id, no randomness):
 * - the project sits at the apex and the domains rest on the project's base, the
 *   ring of radius `DOME_PLANE.domain.r`; each domain owns an angular sector
 *   proportional to its subtree size (a floor of 1 keeps an empty domain a slot);
 * - a domain's children (capabilities, and elements it contains directly) rest on
 *   a circle centred under the domain, radius from the child count (`CONE_SPACING`)
 *   capped by the room to the next domain's sector (`coneRoom`), so sibling cones
 *   do not intersect;
 * - a capability's elements rest on a circle centred under the capability, radius
 *   capped by the gap to its sibling capabilities;
 * - a parent with one child gets radius 0 (the child hangs straight down: a stalk
 *   is the honest one-child cone) and no base circle;
 * - crowded bases (more than `CONE_STAGGER_FROM` children) alternate two radii so
 *   labels and discs interleave rather than fuse;
 * - a node whose parent is not in the model falls back to a deterministic hash
 *   bearing on its own kind plane, as the dome did.
 *
 * Cones nest three deep at most, so the footprint stays inside the old bottom
 * ring (`DOME_FIT_RADIUS`) and the camera, fog, grip and in-plane drag contracts
 * are untouched: y is still one value per kind, which is what `solveDomePlanePoint`
 * relies on.
 */
const CONE_SPACING: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: 0,
  // Capability disc ≈ 6.5 dome units radius → 13 diameter; 16 leaves a hairline gap.
  capability: 16,
  // Element disc ≈ 4.3 radius → 8.6 diameter.
  element: 10,
};
/** Smallest base radius that still reads as a circle rather than a smear (dome units). */
const CONE_MIN_R: Readonly<Record<DomeViewKind, number>> = { project: 0, domain: 0, capability: 10, element: 6 };
/** Largest base radius per tier — a giant domain must not swallow its neighbours' room. */
const CONE_MAX_R: Readonly<Record<DomeViewKind, number>> = { project: 0, domain: 0, capability: 64, element: 26 };
/** Fraction of the available room a cone base may take — the rest is the gap between sibling cones. */
const CONE_ROOM_FILL = 0.82;
/** Above this many children on one base, alternate two radii. */
const CONE_STAGGER_FROM = 8;
const CONE_STAGGER_OUT = 1.12;
const CONE_STAGGER_IN = 0.9;

function layoutConeTree(nodes: readonly DomeInputNode[]): { coords: Map<string, DomeCoord>; circles: DomeCircle[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const coords = new Map<string, DomeCoord>();
  const circles: DomeCircle[] = [];
  const byIdAsc = (a: DomeInputNode, b: DomeInputNode) => (a.id < b.id ? -1 : 1);

  const kids = new Map<string, DomeInputNode[]>();
  for (const n of nodes) {
    if (n.parentId === null || !byId.has(n.parentId) || n.parentId === n.id) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n);
    else kids.set(n.parentId, [n]);
  }
  for (const list of kids.values()) list.sort(byIdAsc);

  /** Subtree size including the node itself; cycles (a bad vault) are cut at the first repeat. */
  const weightMemo = new Map<string, number>();
  const weightOf = (id: string, trail: Set<string>): number => {
    const memo = weightMemo.get(id);
    if (memo !== undefined) return memo;
    if (trail.has(id)) return 1;
    trail.add(id);
    let w = 1;
    for (const k of kids.get(id) ?? []) w += weightOf(k.id, trail);
    trail.delete(id);
    weightMemo.set(id, w);
    return w;
  };

  const projects = nodes.filter((n) => n.kind === "project").sort(byIdAsc);
  projects.forEach((p, i) => {
    if (projects.length === 1) {
      coords.set(p.id, { px: 0, py: DOME_PLANE.project.y, pz: 0 });
    } else {
      const a = (i / projects.length) * TAU - Math.PI / 2;
      coords.set(p.id, { px: Math.cos(a) * 26, py: DOME_PLANE.project.y, pz: Math.sin(a) * 26 });
    }
  });

  // Domains on the project's base ring, sectors proportional to subtree weight.
  const domains = nodes.filter((n) => n.kind === "domain").sort(byIdAsc);
  const ringR = DOME_PLANE.domain.r;
  const weights = domains.map((d) => weightOf(d.id, new Set()));
  const weightSum = weights.reduce((acc, w) => acc + w, 0) || 1;
  const sectorOf = new Map<string, number>();
  const bearingOf = new Map<string, number>();
  let cursor = -Math.PI / 2;
  domains.forEach((d, i) => {
    const sector = (weights[i] / weightSum) * TAU;
    const a = cursor + sector / 2;
    cursor += sector;
    sectorOf.set(d.id, sector);
    bearingOf.set(d.id, a);
    coords.set(d.id, { px: Math.cos(a) * ringR, py: DOME_PLANE.domain.y, pz: Math.sin(a) * ringR });
  });
  if (domains.length > 0) circles.push({ kind: "domain", cx: 0, cz: 0, y: DOME_PLANE.domain.y, r: ringR });

  /**
   * Rest `children` on a circle of radius `r` around `parent`.
   *
   * **The heaviest child faces outward.** Children are ordered by subtree size
   * (then id) and dealt symmetrically about the parent's outward bearing: the
   * largest sub-cone on the bearing itself, the next two one slot to either
   * side, and so on, so the lightest children end up on the inside, toward the
   * axis — the only place where sibling domains' cones can meet. Heavy subtrees
   * therefore grow away from each other and a rotation that brings a domain to
   * the front brings its biggest capability with it.
   */
  const rest = (parent: DomeCoord, outward: number, children: readonly DomeInputNode[], r: number): void => {
    const n = children.length;
    const ordered = [...children].sort((a, b) => {
      const dw = weightOf(b.id, new Set()) - weightOf(a.id, new Set());
      return dw !== 0 ? dw : byIdAsc(a, b);
    });
    ordered.forEach((k, i) => {
      // 0, +1, −1, +2, −2, … slots of TAU/n around the outward bearing.
      const slot = i === 0 ? 0 : i % 2 ? (i + 1) / 2 : -(i / 2);
      const a = outward + (slot / n) * TAU;
      const ri = n > CONE_STAGGER_FROM ? r * (i % 2 ? CONE_STAGGER_OUT : CONE_STAGGER_IN) : r;
      coords.set(k.id, { px: parent.px + Math.cos(a) * ri, py: DOME_PLANE[k.kind].y, pz: parent.pz + Math.sin(a) * ri });
    });
  };
  /** Base radius for `count` children of tier `tier` inside `room` — 0 for a single child (a stalk). */
  const baseRadius = (count: number, tier: DomeViewKind, room: number): number => {
    if (count <= 1) return 0;
    const cap = Math.min(CONE_MAX_R[tier], room * CONE_ROOM_FILL);
    const wanted = Math.max(CONE_MIN_R[tier], (count * CONE_SPACING[tier]) / TAU);
    return Math.max(0, Math.min(cap, wanted));
  };

  const capRoom = new Map<string, number>();
  for (const d of domains) {
    const children = kids.get(d.id) ?? [];
    const room = ringR * Math.sin((sectorOf.get(d.id) ?? 0) / 2);
    const r = baseRadius(children.length, "capability", room);
    const at = coords.get(d.id)!;
    const outward = bearingOf.get(d.id) ?? 0;
    rest(at, outward, children, r);
    if (r > 0) circles.push({ kind: "capability", cx: at.px, cz: at.pz, y: DOME_PLANE.capability.y, r });
    // Room for each child's own cone: the gap to its sibling on this base, or the
    // domain's whole room when it hangs alone.
    const childRoom = children.length <= 1 ? room * CONE_ROOM_FILL : r * Math.sin(Math.PI / children.length);
    for (const c of children) capRoom.set(c.id, childRoom);
  }

  const capabilities = nodes.filter((n) => n.kind === "capability").sort(byIdAsc);
  for (const c of capabilities) {
    const at = coords.get(c.id);
    if (!at) continue;
    const children = kids.get(c.id) ?? [];
    if (children.length === 0) continue;
    const parentAt = c.parentId !== null ? coords.get(c.parentId) : undefined;
    const outward = parentAt ? Math.atan2(at.pz - parentAt.pz, at.px - parentAt.px) : Math.atan2(at.pz, at.px);
    const r = baseRadius(children.length, "element", capRoom.get(c.id) ?? CONE_MAX_R.element);
    rest(at, outward, children, r);
    if (r > 0) circles.push({ kind: "element", cx: at.px, cz: at.pz, y: DOME_PLANE.element.y, r });
  }

  // Whatever is still unplaced — no parent, a parent outside the model, or a
  // parent that was itself unplaced — takes a deterministic hash bearing on its
  // own kind plane, as the dome did.
  for (const n of nodes) {
    if (coords.has(n.id)) continue;
    const a = domeHash01(n.id) * TAU;
    const r = DOME_PLANE[n.kind].r;
    coords.set(n.id, { px: Math.cos(a) * r, py: DOME_PLANE[n.kind].y, pz: Math.sin(a) * r });
  }
  return { coords, circles };
}
/**
 * **The arrangement axis — 「Ownership」 (ownership) and 「Coupling」 (coupling).**
 *
 * `ownership` (default) is the Dome: height carries kind tier and bearing comes
 * from containment. `coupling` is the Cloud: a deterministic force layout lets
 * all relations decide all three coordinates, so it answers a genuinely
 * different question. The first tier-constrained coupling prototype was reverted
 * because it merely twisted the Dome. The detailed physical and determinism
 * contract follows below.
 */
export type DomeArrangement = "ownership" | "coupling";

/**
 * **The coupling cloud's physical character.**
 *
 * If the ownership arrangement **writes the rules into geometry** (height = tier,
 * bearing = parent), the coupling arrangement **writes no rules at all** and lets
 * relations decide position. So its shape is a cloud, not a dome — and that is the
 * point: if the two arrangements looked alike, one of them would have no reason to
 * exist.
 *
 * **Why the tier is not held (it was built that way once and reverted).** The first
 * build fixed height and relaxed only bearing, a "tier-constrained hybrid". The
 * owner's judgment was *"What I wanted was the existing one, plus a completely different shape"* (what I
 * wanted was the existing one, plus a completely different shape). That is right:
 * something still bound to rings with only its angle twisted is a variation on the
 * dome, not a different reading. Height has to be decided by relations too before
 * it answers "what clusters regardless of the declared hierarchy".
 *
 * **Determinism — no randomness at all.** The seed is **the ownership arrangement's
 * coordinates**. The iteration count is fixed and there is no random jitter. So the
 * same vault draws the same cloud whenever it is opened, and nodes start roughly
 * where they were when you switch arrangements. A force layout that reshuffles the
 * map on every reload destroys spatial memory — the property this repo's
 * fixed-scale contract protects.
 */
/**
 * Iteration ceiling. **Relaxation stops before this when it converges**
 * (`settleEpsilon`) — a ceiling, not a target. Lowering it from 420 to 260 came
 * from measurement: the transition held the main thread for 143 ms; merging the
 * pair loops brought that to 100 ms, and lowering the ceiling took it under. 100 ms
 * is the limit at which people perceive "instant" (Nielsen 1993).
 */
export const CLOUD_ITERATIONS = 260;
/** Strength of the all-pairs repulsion. Inverse-square in distance (Coulomb-like). */
const CLOUD_REPULSION = 16000;
/** Strength of the pull along a relation — a Hooke spring. */
const CLOUD_SPRING = 0.008;
/** Rest length of one relation (dome units). */
const CLOUD_REST_LENGTH = 92;

/**
 * **No overlap.**
 *
 * Repulsion alone **guarantees nothing**. An inverse-square force grows as distance
 * shrinks, but it is integrated in finite steps, so a node with many relations gets
 * pressed onto its neighbours by the springs. Owner judgment (2026-08-18):
 * *"They're too close together, it doesn't look great"* (they're too close together, it doesn't look great).
 *
 * So at the end of every iteration a separate pass **pushes discs apart until they
 * genuinely do not overlap**. It is a position correction rather than a force, so it
 * holds regardless of step size (the same grammar as d3-force's `forceCollide`).
 *
 * The radius comes from the per-kind dot radius (`DOME_NODE_R`) — the size drawn on
 * screen has to be the size that occupies space, or it will not *look*
 * non-overlapping. The multiplier is the clearance on top: 1.0 makes discs touch,
 * 2.4 leaves room for another disc between them.
 */
const CLOUD_COLLIDE_RADIUS_SCALE = 2.4;
/** What fraction of an overlap one correction resolves. 1.0 oscillates, so resolve half at a time. */
const CLOUD_COLLIDE_RELAX = 0.5;

/**
 * **The cloud uses deeper fog and smaller dots.**
 *
 * No amount of raising the force constants relieves on-screen density, and the
 * reason is geometric: the radius is normalised after layout, so **scaling
 * everything up shrinks it back**, leaving only shape uniformity. Packing 125 nodes
 * into a ball always overlaps front and back at the centre of the projection — not
 * a force problem but the problem of pressing a volume into a plane.
 *
 * What screens in this family actually prescribe is **render**, not layout: deep
 * fog, dots smaller than you would expect, very thin lines. Pushing the back half
 * into the atmosphere **halves the density the eye takes in.** The dome, having
 * layers as structure, never needed this much.
 *
 * The implementation adds no new path — it only re-scores the two terms
 * `updateDomeFrame` already writes into the frame map (`u` depth, `s` radius
 * multiplier), for the cloud alone. Draw, hit-test and instrumentation all read
 * those two terms already, so the wiring is zero.
 */
const CLOUD_DEPTH_GAMMA = 0.62;
const CLOUD_NODE_SCALE = 0.78;
/** A very weak pull back to the origin — keeps the cloud from inflating without bound. */
const CLOUD_CENTERING = 0.0016;
/** Farthest a node may move in one iteration — runaway guard. */
const CLOUD_MAX_STEP = 9;
/**
 * Node count up to which the O(n²) all-pairs repulsion runs in full. This vault
 * (82–125 nodes) is far below it; above it, iterations are reduced so time stays
 * closer to linear. An octree (Barnes-Hut) gets built once a genuinely large vault
 * is observed — building it now would leave nothing to validate against.
 */
const CLOUD_FULL_ITERATION_NODE_CAP = 400;

/**
 * **Resumable handle** for the coupling-cloud relaxation — call `step(budgetMs)`
 * repeatedly to advance by budget; it returns true on the frame it completes.
 *
 * **Why a stepper (measured 2026-08-19).** Relaxation is O(n²)×iterations, so at
 * 2,000 nodes it is **~350 ms in one go**. Opening the map with the cloud
 * arrangement on put all of that into **a single first rAF frame**, and boot started
 * with a 346–368 ms single-frame hitch (measured, headless:false). Iterations are
 * purely sequential, so holding the state (coordinate arrays plus an iteration
 * counter) lets it be cut and resumed anywhere, and **splitting it keeps
 * floating-point operation order identical, so the result is bit-identical** — the
 * determinism contract that the same vault always draws the same cloud survives
 * intact. The caller (use-topology-loop) advances it by budget each frame and does
 * not create the dome runtime until it completes.
 */
interface CouplingCloudRelaxer {
  /** Advance iterations for budgetMs. True once finished, convergence included. */
  step(budgetMs: number): boolean;
}

function createCouplingCloudRelaxer(
  coords: Map<string, DomeCoord>,
  nodes: readonly DomeInputNode[],
  edges: readonly { sourceId: string; targetId: string }[],
): CouplingCloudRelaxer {
  const ids = nodes.map((n) => n.id).filter((id) => coords.has(id));
  const n = ids.length;
  if (n < 2) return { step: () => true };
  const index = new Map(ids.map((id, i) => [id, i]));

  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = coords.get(ids[i])!;
    px[i] = c.px;
    py[i] = c.py;
    pz[i] = c.pz;
  }

  const links: Array<[number, number]> = [];
  for (const e of edges) {
    const a = index.get(e.sourceId);
    const b = index.get(e.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    links.push([a, b]);
  }

  /*
   * Collision radius — from the per-kind dot radius (`CLOUD_COLLIDE_RADIUS_SCALE`).
   * `DOME_NODE_R × 2.1` is the dome-unit radius the draw uses, so that is the base.
   */
  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]));
  const collideR = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const kind = kindOf.get(ids[i]) ?? "element";
    collideR[i] = DOME_NODE_R[kind] * 2.1 * CLOUD_COLLIDE_RADIUS_SCALE;
  }

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const fz = new Float64Array(n);
  const iterations =
    n <= CLOUD_FULL_ITERATION_NODE_CAP
      ? CLOUD_ITERATIONS
      : Math.max(60, Math.round((CLOUD_ITERATIONS * CLOUD_FULL_ITERATION_NODE_CAP) / n));

  /**
   * Stop on convergence — when the node that moved **the most** in an iteration
   * moved less than this (dome units), the remaining iterations do not change the
   * screen. A fixed iteration count spends full compute even on an already settled
   * layout (measured: the transition held the main thread for 143 ms). The threshold
   * is a constant, so identical input stops at the identical iteration —
   * determinism preserved.
   */
  const settleEpsilon = 0.05;

  let iter = 0;
  let settled = false;
  let done = false;

  /** One pass of the original for-loop — cooling factor and convergence test included. */
  /*
   * An iteration is resumable **inside the pair loop** (2026-09-02). One
   * iteration at 3,000 nodes is 4.5 million pairs — about 40 ms on the owner's
   * machine — so an iteration-sized budget check could not hold a 28 ms slice
   * and the arrangement switch stuttered at p95 52 ms for ~30 frames. The outer
   * row `i` is the cursor: pausing between rows changes no operation order (row
   * `i` only ever reads rows ≥ i after earlier rows have finished pushing), so
   * the result stays bit-identical to the unsliced run. Springs, centering, and
   * cooling always run to completion in the call that finishes the rows.
   */
  let pairRow = 0;
  let inPairLoop = false;
  const beginIteration = (): void => {
    fx.fill(0);
    fy.fill(0);
    fz.fill(0);
    pairRow = 0;
    inPairLoop = true;
  };
  /** Runs pair rows until the deadline; true once every row of this iteration is done. */
  const runPairRows = (deadlineMs: number): boolean => {

    /*
     * ①+② repulsion and collision are handled in **one pair loop**.
     *
     * Both need the same (dx, dy, dz, d), and running them separately computes every
     * pair twice (2×n²/2 per iteration). Merging deletes that half outright — for
     * this vault, at 420 iterations × 7,750 pairs, **3.25 million pair computations
     * saved**.
     *
     * Collision is a **position correction** rather than a force, a different kind
     * of thing from force accumulation, but within a relaxation algorithm only the
     * order inside an iteration matters (here the position correction is applied
     * first and the forces are integrated once, below).
     */
    while (pairRow < n) {
      const i = pairRow;
      for (let j = i + 1; j < n; j += 1) {
        let dx = px[i] - px[j];
        let dy = py[i] - py[j];
        let dz = pz[i] - pz[j];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6) {
          // Exactly coincident pair — to stay deterministic, separate by **index**
          // rather than by a random number.
          dx = (i - j) * 1e-3;
          dy = 1e-3;
          dz = (j - i) * 1e-3;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const d = Math.sqrt(d2);

        // Repulsion — inverse-square (Coulomb-like).
        const inv = CLOUD_REPULSION / d2 / d;
        const ux = dx * inv;
        const uy = dy * inv;
        const uz = dz * inv;
        fx[i] += ux;
        fy[i] += uy;
        fz[i] += uz;
        fx[j] -= ux;
        fy[j] -= uy;
        fz[j] -= uz;

        // Collision — push positions directly until the discs really do not overlap.
        const want = collideR[i] + collideR[j];
        if (d < want) {
          const push = ((want - d) / d) * CLOUD_COLLIDE_RELAX * 0.5;
          px[i] += dx * push;
          py[i] += dy * push;
          pz[i] += dz * push;
          px[j] -= dx * push;
          py[j] -= dy * push;
          pz[j] -= dz * push;
        }
      }
      pairRow += 1;
      // A row costs up to n pair evaluations; checking the clock every 16 rows
      // keeps the overshoot past the deadline under a millisecond at any size.
      if ((pairRow & 15) === 0 && performance.now() >= deadlineMs) return false;
    }
    inPairLoop = false;
    return true;
  };
  const finishIteration = (): void => {
    // ③ Relation springs — pull or push toward the rest length.
    for (const [a, b] of links) {
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      const dz = pz[b] - pz[a];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const pull = (d - CLOUD_REST_LENGTH) * CLOUD_SPRING;
      const ux = (dx / d) * pull;
      const uy = (dy / d) * pull;
      const uz = (dz / d) * pull;
      fx[a] += ux;
      fy[a] += uy;
      fz[a] += uz;
      fx[b] -= ux;
      fy[b] -= uy;
      fz[b] -= uz;
    }

    // ④ Pull back to the origin, then apply cooling.
    const cool = 1 - iter / iterations;
    let maxStep = 0;
    for (let i = 0; i < n; i += 1) {
      fx[i] -= px[i] * CLOUD_CENTERING;
      fy[i] -= py[i] * CLOUD_CENTERING;
      fz[i] -= pz[i] * CLOUD_CENTERING;
      const step = Math.hypot(fx[i], fy[i], fz[i]);
      const scale = (step > CLOUD_MAX_STEP ? CLOUD_MAX_STEP / step : 1) * cool;
      const mx2 = fx[i] * scale;
      const my2 = fy[i] * scale;
      const mz2 = fz[i] * scale;
      px[i] += mx2;
      py[i] += my2;
      pz[i] += mz2;
      const moved = Math.hypot(mx2, my2, mz2);
      if (moved > maxStep) maxStep = moved;
    }
    if (maxStep < settleEpsilon) settled = true;
    iter += 1;
  };

  /*
   * **Move the centre of mass to the origin** — the rotation axis must not sit
   * outside the cloud.
   *
   * The projection always rotates about the origin. If the cloud's centre of mass is
   * off the origin, orbit drag does not *rotate the cloud*, it *swings the cloud
   * around the origin*, so even a small turn sweeps it off screen (measured: a
   * 12-step drag threw the cloud out the bottom-right). The dome is origin-symmetric
   * to begin with and never had this problem, which is why it first surfaced with
   * the cloud.
   */
  const finalize = (): void => {
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < n; i += 1) {
      mx += px[i];
      my += py[i];
      mz += pz[i];
    }
    mx /= n;
    my /= n;
    mz /= n;

    // Normalise the radius so camera fit and fog normalisation see the same scale
    // as the dome.
    let maxR = 0;
    for (let i = 0; i < n; i += 1) {
      const r = Math.hypot(px[i] - mx, py[i] - my, pz[i] - mz);
      if (r > maxR) maxR = r;
    }
    const norm = maxR > 1e-6 ? DOME_FIT_RADIUS / maxR : 1;
    for (let i = 0; i < n; i += 1) {
      const c = coords.get(ids[i])!;
      c.px = (px[i] - mx) * norm;
      c.py = (py[i] - my) * norm;
      c.pz = (pz[i] - mz) * norm;
    }
  };

  return {
    step(budgetMs: number): boolean {
      if (done) return true;
      // Budget clock — the pair loop yields between rows, so a slice ends within a
      // millisecond of its budget at any vault size and the next call resumes the
      // same iteration where it paused.
      const deadline = performance.now() + budgetMs;
      while (iter < iterations && !settled) {
        if (!inPairLoop) beginIteration();
        if (!runPairRows(deadline)) return false;
        finishIteration();
        if (performance.now() >= deadline) break;
      }
      if (iter >= iterations || settled) {
        finalize();
        done = true;
      }
      return done;
    },
  };
}

/**
 * Budget one frame spends on a slice of coupling-cloud relaxation (ms).
 *
 * Why 28: it leaves headroom under the long-task threshold (50 ms) while keeping
 * total elapsed time close to the old synchronous hitch (~350 ms at 2,000 nodes) —
 * 12 slices × 28 ms ≈ 340 ms of compute, plus a few ms per frame-boundary yield,
 * puts the moment assembly starts within tens of ms of before (staging timing
 * preserved). Lower and relaxation spreads over dozens of frames, visibly delaying
 * the start of assembly; higher and it becomes a hitch again.
 */
export const DOME_BUILD_SLICE_MS = 28;

export interface DomeModelBuild {
  /** Not safe to use before completion — valid only after `step` has returned true. */
  model: DomeModel;
  /** null means already complete. Otherwise call it by budget until the frame it completes. */
  step: ((budgetMs: number) => boolean) | null;
}

/**
 * The **staged** entry point to `buildDomeModel` — the geometric seed (the ownership
 * arrangement) is built immediately and only the coupling cloud's O(n²) relaxation
 * is handed to `step`. Why: see the `CouplingCloudRelaxer` doc-block (measured
 * 346–368 ms single-frame boot hitch). Slicing yields a bit-identical result.
 */
export function beginDomeModelBuild(
  nodes: readonly DomeInputNode[],
  options?: {
    /** What decides bearing — see the `DomeArrangement` doc-block above. Defaults to `ownership`. */
    arrangement?: DomeArrangement;
    /** The relations that decide angles when `coupling`. Omitted, it matches the ownership arrangement. */
    edges?: readonly { sourceId: string; targetId: string }[];
  },
): DomeModelBuild {
  let cx = 0;
  let cy = 0;
  for (const n of nodes) {
    cx += n.x;
    cy += n.y;
  }
  const count = Math.max(1, nodes.length);
  cx /= count;
  cy /= count;
  let radius = 0;
  for (const n of nodes) {
    const d = Math.hypot(n.x - cx, n.y - cy);
    if (d > radius) radius = d;
  }
  // Floor so the dome does not collapse to a point even in a tiny vault (the 5
  // starter nodes).
  const unit = Math.max(radius, 220) / DOME_FIT_RADIUS;

  const { coords, circles } = layoutConeTree(nodes);

  /*
   * "Coupling" (coupling) arrangement — relaxes from a **warm start** at the angles the
   * ownership arrangement produced. Not starting from arbitrary angles is what buys
   * determinism and spatial memory (`DomeArrangement` doc-block).
   */
  const arrangement = options?.arrangement ?? "ownership";
  const model: DomeModel = {
    centerX: cx,
    centerY: cy,
    unit,
    coords,
    arrangement,
    // The cloud has no cone bases — drawing them would assert a coordinate system
    // relations did not produce.
    circles: arrangement === "coupling" ? [] : circles,
  };
  if (arrangement === "coupling" && options?.edges && options.edges.length > 0) {
    const relaxer = createCouplingCloudRelaxer(coords, nodes, options.edges);
    return { model, step: (budgetMs: number) => relaxer.step(budgetMs) };
  }
  return { model, step: null };
}

export function buildDomeModel(
  nodes: readonly DomeInputNode[],
  options?: {
    /** What decides bearing — see the `DomeArrangement` doc-block above. Defaults to `ownership`. */
    arrangement?: DomeArrangement;
    /** The relations that decide angles when `coupling`. Omitted, it matches the ownership arrangement. */
    edges?: readonly { sourceId: string; targetId: string }[];
  },
): DomeModel {
  const build = beginDomeModelBuild(nodes, options);
  if (build.step !== null) {
    while (!build.step(Number.POSITIVE_INFINITY)) {
      // step(∞) finishes in one call — the same form as relaxCouplingCloud above.
    }
  }
  return build.model;
}

/**
 * **Shell radius** at height y — the **convex** surface passing through the four
 * rings.
 *
 * **Why not interpolate linearly between the rings** (the first attempt, reverted on
 * measurement 2026-08-18). The first version linearly interpolated the four (y, r)
 * samples. That makes `domeEdgeControl`'s bow **exactly zero** — the midpoint of a
 * chord running from the apex down to a ring already lies on that linear
 * interpolation. On a linear shell a radial relation line does not *follow* the
 * shell, it **is** the shell. The screen stayed a tent.
 *
 * So the shell becomes a sphere's profile: 0 at the apex height, the bottom radius
 * at the bottom ring's height, and `√(1−t²)` **bulging outwards** in between. The
 * four rings sit inside that surface (measured: domain 148 vs surface 162,
 * capability 192 vs 210) — the rings are where data sits and the surface is the skin
 * relation lines ride over, so it is right that they do not coincide.
 *
 * Values are derived from the plane table (zero constants re-entered): apex height,
 * plus the bottom ring's height and radius.
 */
export function domeShellRadiusAtY(y: number): number {
  const top = DOME_PLANE.project.y;
  const bottom = DOME_PLANE.element.y;
  const rMax = DOME_PLANE.element.r;
  const span = top - bottom;
  if (span <= 1e-6) return rMax;
  const t = (y - bottom) / span; // 0 at the bottom … 1 at the apex
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return rMax * Math.sqrt(Math.max(0, 1 - c * c));
}

/**
 * How far a relation line **bows along its meridian** — 0 is a straight chord, 1
 * puts the curve's midpoint exactly on the shell.
 *
 * **Why it must bow — this is what separates a "tent" from a "dome".** In the first
 * implementation every relation line was a **chord**. Lines from the apex down to
 * the rings cut **through** the inside of the dome, leaving spokes radiating from
 * the apex, and that silhouette is a **tent (a cone)**, not a dome. Worse, every
 * spoke passes through one point, so the centre is densest — the least readable
 * place on screen was exactly the most important one (project, domain).
 *
 * Pushing the midpoint out to the shell makes a line between the same two points
 * travel **over the skin**. Three things improve at once: ① the silhouette becomes
 * spherical ② the centre clears, so the spine reads ③ meridians from different
 * parents separate into their own bearings, reducing crossings.
 *
 * Why 0.9 and not 1: pinned to the shell, the outermost meridian coincides with the
 * silhouette's outline and reads as "someone drew a border". Keep it a hair inside.
 *
 * The equivalent concept in 3D libraries is `linkCurvature`
 * (vasturiano/3d-force-graph) — technique only, no code ported (this repo has torn
 * out a graph render dependency twice; ledger 2026-08-18 (76), rejection ③).
 */
export const DOME_EDGE_BOW = 0.9;

/**
 * Control point (dome coordinates) for the relation line between two nodes — see
 * `DOME_EDGE_BOW`. Returns null if either coordinate is missing (the caller then
 * uses the 2D control point as-is).
 *
 * **A control point is not a point the curve passes through — push it twice as
 * far.** A quadratic Bézier passes through `(A + 2C + B)/4` at t=0.5, i.e. the
 * curve's midpoint is **halfway between** the chord midpoint and the control point.
 * To send the curve out to the shell, the control point has to be pushed **twice**
 * that far. Drop this one line and the bow is always half of what was intended, and
 * half reads as "is that bowed or not".
 */
export function domeEdgeControl(
  model: DomeModel,
  sourceId: string,
  targetId: string,
  /**
   * The edge's kind. In the cone tree a **containment** edge is a cone's own
   * edge (apex to base) and draws straight; only a `depends` relation bows over
   * the shell so it does not cut through the cones. Omitted, the edge bows.
   */
  kind: "contains" | "depends" = "depends",
): DomeCoord | null {
  // A coupling cloud has no shell — with no skin to bow over, lines go straight
  // (the caller takes null and falls back to the 2D control point).
  if (model.arrangement === "coupling") return null;
  if (kind === "contains") return null;
  const a = model.coords.get(sourceId);
  const b = model.coords.get(targetId);
  if (!a || !b) return null;
  const mx = (a.px + b.px) / 2;
  const my = (a.py + b.py) / 2;
  const mz = (a.pz + b.pz) / 2;
  const chordR = Math.hypot(mx, mz);
  const shellR = domeShellRadiusAtY(my);
  // Already outside the shell (a node dragged out, a diametrically opposed pair) —
  // do not push further. Pulling it inward would bow that one line the other way and
  // read as "why is that one like that".
  const target = Math.max(chordR, shellR * DOME_EDGE_BOW);
  const controlR = chordR + (target - chordR) * 2;
  if (chordR < 1e-6) {
    /*
     * The midpoint is on the axis — either two diametrically opposed nodes, or a
     * point directly below the apex. There is no direction to push in, so push along
     * the **sum of the two endpoints' bearings**. That way a line between opposed
     * nodes also goes around the axis rather than through it. If even that sum is 0
     * (perfect antipodes) it does not bow — the data does not say which way to go,
     * and picking arbitrarily makes the direction snap during rotation.
     */
    const sx = a.px + b.px;
    const sz = a.pz + b.pz;
    const n = Math.hypot(sx, sz);
    if (n < 1e-6) return { px: mx, py: my, pz: mz };
    return { px: (sx / n) * controlR, py: my, pz: (sz / n) * controlR };
  }
  const k = controlR / chordR;
  return { px: mx * k, py: my, pz: mz * k };
}

/**
 * **The dome's "grip" — where dragging rotates and where it pans.**
 *
 * In 3D, dragging empty space was **all orbit rotation** from the start, which left
 * no way at all to move the map (owner report 2026-08-18: *"There's no way to move the canvas itself?"* — there's no way to move the canvas
 * itself). The 2D behaviour of "drag empty space and the map follows" had simply
 * been covered over in 3D, so this is not a new 3D rule but **an existing rule being
 * restored**.
 *
 * The dividing line is exactly what the owner described: **on the object it rotates,
 * off the object it pans.** No mode toggle, no modifier key, no right button — what
 * the hand is over is what it has grabbed (direct manipulation).
 *
 * **Why an ellipse and not the bbox.** A drawn node's bbox is a rectangle and the
 * dome is round. Testing against the rectangle makes **the four corners** count as
 * "on the object" — black, empty screen that rotates when dragged, which is exactly
 * the «this black area» (this black area) the owner pointed at. The ellipse inscribed
 * in the bbox nearly coincides with the dome's silhouette, so what is seen and what
 * is tested agree.
 *
 * **Why a margin.** The outermost node's centre is not the silhouette (its disc
 * radius, label and selection ring lie outside it). Cutting with no margin gives "I
 * clearly grabbed the dome's edge and the map panned". Too generous and dragging
 * black space rotates. 1.08 is the minimum that covers the outermost node's disc (a
 * few px of radius) and its selection ring.
 */
export const DOME_GRIP_MARGIN = 1.08;

/**
 * Is this world point inside the dome's grip — true orbits, false pans the camera.
 * `bounds` is `DomeRuntime.drawnBounds` (the world bbox of the nodes actually drawn
 * this frame). With no bbox (2D, or before assembly) it is false: with no object to
 * test against, the default — pan — wins.
 */
export function isInsideDomeGrip(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  worldX: number,
  worldY: number,
  margin = DOME_GRIP_MARGIN,
): boolean {
  if (bounds === null) return false;
  const halfW = ((bounds.maxX - bounds.minX) / 2) * margin;
  const halfH = ((bounds.maxY - bounds.minY) / 2) * margin;
  if (halfW <= 0 || halfH <= 0) return false;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const nx = (worldX - cx) / halfW;
  const ny = (worldY - cy) / halfH;
  return nx * nx + ny * ny <= 1;
}

export interface DomeProjection {
  /** Projected world 2D coordinates — the existing camera looks at these. */
  wx: number;
  wy: number;
  /** Weak perspective factor s = f/(f+z) — radii and hit discs multiply by it too. */
  s: number;
  /** Camera-space depth z2 — input to the per-frame fog normalisation (`updateDomeFrame`). */
  z: number;
}

/**
 * A relation line's control point in **world 2D** — `domeEdgeControl` plus the
 * current pose projection. It uses `runtime.yaw`, without tier torsion: a control
 * point shapes the curve, it is not an object belonging to a tier, and mixing
 * torsion in makes the curve wobble to a different beat than its endpoints during a
 * drag.
 */
export function domeEdgeControlWorld(
  runtime: DomeRuntime,
  sourceId: string,
  targetId: string,
  kind: "contains" | "depends" = "depends",
): { wx: number; wy: number } | null {
  const coord = domeEdgeControl(runtime.model, sourceId, targetId, kind);
  if (coord === null) return null;
  // Use the trig computed once per frame (see the `drawCosYaw` doc-block) — redoing
  // cos/sin per edge exceeds a thousand calls per frame in this vault alone.
  const p = projectWithTrig(
    runtime.model,
    coord,
    runtime.drawCosYaw,
    runtime.drawSinYaw,
    runtime.drawCosPitch,
    runtime.drawSinPitch,
  );
  return { wx: p.wx, wy: p.wy };
}

/** Project one dome coordinate to world 2D at yaw/pitch — a port of the hero's `project()`. */
export function projectDomeCoord(model: DomeModel, coord: DomeCoord, yaw: number, pitch: number): DomeProjection {
  return projectWithTrig(model, coord, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
}

function projectWithTrig(
  model: DomeModel,
  coord: DomeCoord,
  cy: number,
  sy: number,
  cp: number,
  sp: number,
): DomeProjection {
  const x = coord.px * cy - coord.pz * sy;
  const zr = coord.px * sy + coord.pz * cy;
  const y2 = coord.py * cp + zr * sp;
  const z2 = -coord.py * sp + zr * cp;
  const s = DOME_FOCAL / (DOME_FOCAL + z2);
  return {
    wx: model.centerX + x * s * model.unit,
    wy: model.centerY - y2 * s * model.unit,
    s,
    z: z2,
  };
}

/* ── 3D-only feel constants — these never leak outside this module ─────────── *
 *
 * Owner dispensation (2026-08-18): 3D mode is not bound to the app's motion
 * conventions (the three-step duration ramp and the rest). In exchange the values
 * all live inside this module — standardising them later will be decided by reading
 * this one file (`docs/DECISIONS.md` «3D Dispensation List», the 3D dispensation list).  */

/**
 * Tier torsion — during an orbit drag the deeper tiers lag slightly, then spring
 * back. The hero engine's elastic torsion (LAGW) unchanged: classical animation's
 * follow-through (secondary motion) applied to the yaw axis. Per-tier yaw differs
 * within a frame, so an edge joining two tiers passes through geometry that exists
 * in no single projection — but torsion only lives during the drag and for a few
 * hundred ms after, decaying to 0.
 */
export const DOME_TIER_LAG: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: -0.1,
  capability: -0.2,
  element: -0.3,
};
/** Geometric decay of torsion per ms — the hero's 0.90 per frame @60fps, made dt-invariant. */
export const DOME_TIER_LAG_DECAY_PER_MS = 0.9937;

/**
 * **Programmatic pose moves get torsion too** — scaled by this.
 *
 * **Why (2026-08-18, third round).** Torsion (follow-through) was charged only by
 * hand drags, so the same rotation **moved like a different object depending on who
 * turned it**: turned by hand the deep rings lagged and sprang back, but when a node
 * click flew the camera all four rings turned rigidly as one lump. The latter is
 * exactly the impression of "a JS animation" — an object not reacting to its own
 * motion.
 *
 * In classical animation follow-through arises from **mass**, whatever the cause. A
 * camera-driven rotation is the same rotation from the object's point of view. So
 * the same constants are charged the same way, with one multiplier: a programmatic
 * move is far faster than a hand (half a turn in 750 ms), and at 1.0 the leaf ring
 * lags by nearly 12° and feels **broken**.
 *
 * One side effect is settle motion for free: when the move ends, charging stops and
 * the existing decay rewinds the rings into place, so **a short settling wobble
 * after arrival** costs nothing. No new easing, no new timer, no permanent rotation.
 */
export const DOME_POSE_LAG_SCALE = 0.55;

/**
 * Charge tier torsion by this frame's yaw movement — **hand drag and programmatic
 * move call the same function.**
 *
 * Split them and they diverge: because torsion existed only on the drag path, the
 * same rotation moved like a different object depending on who turned it (see
 * `DOME_POSE_LAG_SCALE`). With both call sites in one function that divergence is
 * structurally impossible.
 *
 * `scale` is the per-cause push strength: 1 for the hand (1:1 direct manipulation),
 * `DOME_POSE_LAG_SCALE` for the much faster programmatic move.
 */
export function chargeTierLag(lag: Record<DomeViewKind, number>, deltaYaw: number, scale = 1): void {
  const d = deltaYaw * scale;
  lag.project += d * DOME_TIER_LAG.project;
  lag.domain += d * DOME_TIER_LAG.domain;
  lag.capability += d * DOME_TIER_LAG.capability;
  lag.element += d * DOME_TIER_LAG.element;
}

/**
 * Assembly stagger — on switching on, the rings rise in order starting from the
 * project spine (the hero's tierDelay unchanged). Switching off replays the same
 * clock backwards, settling from the leaves down.
 */
const DOME_TIER_DELAY_MS: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: 180,
  capability: 380,
  element: 600,
};
/** How long one tier takes to rise (ms) — the hero's 520 ms ease-out cubic. */
const DOME_TIER_RISE_MS = 520;

/**
 * **Entry sweep — the dome takes its place by rising *and turning*.**
 *
 * The assembly stagger (`DOME_TIER_DELAY_MS`) choreographs only the rings *rising*.
 * Camera pose was at its final value from the first frame, so switching on looked
 * like **a finished angle being filled with objects**. In motion graphics that cut
 * is an arrangement, not an entrance.
 *
 * So one more pose is tied to the assembly clock.
 *
 * - **Pitch starts from above** (nearly a plan view). The rings are first seen
 *   spread as concentric circles, so **structure reads first**, and then the dome
 *   rises and that structure becomes dimensional. Information order matches form
 *   order.
 * - **Yaw enters slightly turned.** Rotation is the only axis that produces motion
 *   parallax, and that parallax is what says "this is 3D" (Ware & Franck 1996 —
 *   structured 3D motion contributes more to comprehension than stereo. Permanent
 *   rotation fights reading, though, so it is used **on entry only** and reaches 0
 *   on arrival).
 *
 * The values are multiplied by the assembly ramp's remainder (`1 − ease`), so when
 * the ramp finishes they are exactly 0 — after entry this section might as well not
 * exist.
 */
const DOME_ENTRY_PITCH_LIFT = 0.62;
const DOME_ENTRY_YAW_SWEEP = 0.45;

/**
 * The entry sweep's **own clock** (ms) — it does not use the assembly clock.
 *
 * It was tied to the assembly clock (`rampClock`) first, and was nearly invisible on
 * screen. The reason is geometric: a node's offset during assembly is
 * `(projected position − 2D position) × tier ramp`, so while the ramp is low
 * **turning the pose barely moves any node.** The interval where the sweep is
 * strongest and the interval where it is visible were misaligned.
 *
 * Hence a separate clock. The sweep **outlives** assembly (1500 ms vs 1120 ms) and
 * puts down the remaining angle after the rings are all up — that final stretch is
 * in fact the only stretch where motion parallax reads.
 *
 * During the leading `HOLD` it stays at 1.0: only the spine is up then, so moving
 * the pose has no information to carry. Hold it, and put it down once there are
 * objects to carry.
 */
export const DOME_ENTRY_SWEEP_MS = 1500;
const DOME_ENTRY_SWEEP_HOLD_MS = 220;

/**
 * **Fold the entry sweep into the pose** and disarm it — call this the moment a hand
 * touches the map.
 *
 * Simply setting `entryArmed = false` makes the drawn pose **jump** by the sweep
 * offset in one frame. The screen jumping on the very frame the user grabs it breaks
 * precisely the contract this repo keeps consistently across camera tweens, orbit
 * momentum and pose moves: **a gesture inherits the position exactly as it is right
 * now**.
 *
 * So the offset moves into the real yaw/pitch: the drawn pose stays byte-identical
 * and from the next frame on the concept of a sweep is gone. Pitch is clamped back
 * into range (the sweep is presentation-layer and did not know about the limits).
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
/** Full length of the assembly clock (ms) = last tier delay + rise. */
export const DOME_ASSEMBLE_TOTAL_MS = DOME_TIER_DELAY_MS.element + DOME_TIER_RISE_MS;

/** ease-out cubic — the hero's tierAlpha curve. */
function domeEaseOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

/** Assembly clock (0..TOTAL) → one kind's eased ramp, 0..1. */
export function domeTierRamp(clockMs: number, kind: DomeViewKind): number {
  return domeEaseOutCubic((clockMs - DOME_TIER_DELAY_MS[kind]) / DOME_TIER_RISE_MS);
}

/**
 * This frame's render handoff for one node — world offset plus perspective factor.
 * Draw, hit-test, popover anchor and the `__atlasMap` instrumentation must all read
 * **the same map** so clicks and measurements follow where a node was drawn during
 * rotation. Entries are updated in place (allocations per frame converge to 0 — the
 * Map and its entries are reused while the node set is stable).
 */
export interface DomeNodeFrame {
  dx: number;
  dy: number;
  /**
   * Radius multiplier — computed **by inversion**, so that multiplying the 2D base
   * radius (radiusForKind × magnitudeScale) by it yields the dome's dot radius
   * (DOME_NODE_R ratio × perspective). Draw, hit and instrumentation all use
   * base × s, so all three agree structurally.
   */
  s: number;
  /** This node kind's assembly ramp 0..1 — the interpolator for presentation-layer crossfades (label, fog, width). */
  a: number;
  /** This frame's normalised depth, 0 (near)..1 (far) — input to fog and line width. */
  u: number;
}

/**
 * Update the runtime's frame map in place from the current pose (yaw + per-kind
 * torsion, pitch) and the assembly clock. Trig is computed once per kind (four
 * pairs) and node entries are reused.
 */
export function updateDomeFrame(
  runtime: DomeRuntime,
  nodes: ReadonlyArray<{ id: string; kind: DomeViewKind; x: number; y: number }>,
  /** A node's 2D base radius (world) — radiusForKind × magnitudeScale. Denominator of the `s` inversion. */
  baseRadiusFor: (node: { id: string; kind: DomeViewKind }) => number,
  /** Frame clock (`performance.now()`), only read while a morph is in flight. */
  nowMs = 0,
): void {
  const { model, frame } = runtime;
  // Morph progress — see `DomeMorph`. Ends itself the frame it reaches 1.
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
  /** The coordinate to draw this frame — the target, or the eased blend from the previous model. */
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
   * Entry sweep — added to the drawn pose only (`DOME_ENTRY_PITCH_LIFT` doc-block).
   * Why not push `runtime.yaw/pitch` directly: that would make the entry animation
   * compete for the same variables as idle spin, the orbit target and the pose
   * tween, and nothing in the code says which wins on a frame where all three
   * overlap. An offset is presentation-layer and has nothing to compete with.
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
    ramp[kind] = domeTierRamp(runtime.rampClock, kind);
  }
  // Pass 1 — project, plus this frame's depth range (per-frame fog normalisation is
  // the honest one: the hero's rule), plus **the drawn world bbox** (the anchor for
  // the camera pan leash — it must be where the dome actually sits rather than the
  // 2D layout bbox, or the elastic clamp drags the dome toward the 2D centre during
  // zoom and orbit).
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
    // A tier at r=0 skips projection — offset 0 (not −0), factor 1, identical to 2D.
    const p = r > 0 ? projectWithTrig(model, coordFor(node.id, coord), cy, sy, cp, sp) : null;
    const dx = p === null ? 0 : (p.wx - node.x) * r;
    const dy = p === null ? 0 : (p.wy - node.y) * r;
    let s = 1;
    if (p !== null) {
      const baseR = baseRadiusFor(node);
      const domeR = DOME_NODE_R[node.kind] * 2.1 * model.unit * p.s;
      // Clamp the project apex glyph (the compass cross) so it never exceeds the 2D
      // radius — the hero's apex is "a slightly bigger dot", not a cross spanning the
      // screen.
      let target = baseR > 0 ? domeR / baseR : 1;
      if (node.kind === "project") target = Math.min(target, 1.1);
      // The cloud needs smaller dots for density to read (doc-block above).
      if (model.arrangement === "coupling") target *= CLOUD_NODE_SCALE;
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
   * Latitude ring samples — projected at the **same pose** as the nodes (per-kind yaw
   * torsion included). Without the torsion, the rings alone stay put during a drag
   * and slide relative to their own tier.
   *
   * Ring z is **not** fed into the normalisation range (zMin/zMax). A ring goes all
   * the way round, including angles where there are no nodes, so its z span is always
   * wider than the nodes', and including it would flatten the fog contrast between
   * nodes by that much — the coordinate system would be changing the data's
   * presentation. The rings read their own u by clamping to the same range below.
   */
  // Cone bases — the model's own circles (the cloud carries none: drawing rings
  // there would assert a coordinate system that does not exist). During a morph
  // the previous model's bases fade out behind the new ones fading in.
  let ringCount = 0;
  const sampleCircle = (circle: DomeCircle, alpha: number): void => {
    const { kind } = circle;
    const [cyK, syK] = trig[kind];
    let ring = runtime.rings[ringCount];
    if (!ring) {
      ring = { kind, a: 0, points: [] };
      runtime.rings[ringCount] = ring;
    }
    ring.kind = kind;
    ring.a = ramp[kind] * alpha;
    const samples = domeRingSampleCount(circle.r);
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
    }
    ring.points.length = samples;
    ringCount++;
  };
  for (const circle of model.circles) sampleCircle(circle, morphing ? morphE : 1);
  if (morphing) for (const circle of morph!.fromCircles) sampleCircle(circle, 1 - morphE);
  runtime.rings.length = ringCount;

  // Pass 2 — normalise z into 0..1 (u). If every tier is r=0 there is no span → u 0.
  const span = zMax - zMin;
  // The cloud reads depth more steeply (`CLOUD_DEPTH_GAMMA` doc-block) — the back
  // has to recede into atmosphere faster for the front cluster to read.
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
  // Rings read the same scale but clamped (doc-block above — not in the range, read only).
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

/** Scratch coordinate for ring sampling — one object per module, never per sample. */
const ringCoord: DomeCoord = { px: 0, py: 0, pz: 0 };

/**
 * Samples for a base of radius `r` — `DOME_RING_SAMPLES` on the domain ring
 * (r=148), proportionally fewer on the small bases so a 12-unit circle is not
 * drawn with 96 segments. The floor keeps the smallest base round.
 */
export function domeRingSampleCount(r: number): number {
  return Math.max(12, Math.min(DOME_RING_SAMPLES, Math.round(r * 0.65)));
}

/** ease-in-out cubic — the camera tween's curve, shared by the morph. */
function domeEaseInOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/**
 * Swap the model in and start a morph from the one being replaced — see
 * `DomeMorph`. Call it from the loop when a rebuild (arrangement or world change)
 * completes while the dome is on screen. `durationMs` 0 is a cut (reduced-motion).
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
 * Put a dome that has fully left the screen to rest (2026-09-02).
 *
 * The loop's dome step runs only while 3D is on or the teardown ramp is still
 * above 0, so anything that was in flight at the moment 2D took over — a pose
 * tween, tier torsion, momentum, the landing target — stayed frozen at its last
 * value. The idle gate names every one of those as "motion", so the map never
 * slept again after a single visit to 3D (measured: 120 frames/s, 32 s after the
 * last input, cause `domeMotion`). Nothing here is visible — the frame map is
 * already empty — so settling is a pure bookkeeping reset.
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
  runtime.lag.project = 0;
  runtime.lag.domain = 0;
  runtime.lag.capability = 0;
  runtime.lag.element = 0;
  runtime.pitch = clampDomePitch(runtime.pitch);
  runtime.pitchTarget = runtime.pitch;
  runtime.yawTarget = runtime.yaw;
}

/**
 * Back-projection — solve one world 2D point into dome coordinates **on the plane at
 * height py** (closed form). The core of 3D node drag: one screen point maps to
 * infinitely many depths, so a node moves only within its own kind plane, preserving
 * the typed fact z carries. A near-zero denominator (a horizontal line of sight)
 * returns null and the caller discards that frame's movement.
 */
export function solveDomePlanePoint(
  model: DomeModel,
  planeY: number,
  wx: number,
  wy: number,
  yaw: number,
  pitch: number,
): { px: number; pz: number } | null {
  const ux = (wx - model.centerX) / model.unit;
  const uy = (wy - model.centerY) / model.unit;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Solve uy = −(py·cp + zr·sp)·s, s = F/(F + (−py·sp + zr·cp)) for zr.
  //
  // Degenerate handling (2026-08-18, owner: "some nodes don't move properly when clicked"
  // — some of them don't move properly when clicked). As the pointer approaches this
  // plane's **horizon** (the line where the plane vanishes on screen) denom → 0, and
  // past it the sign flips and the solution jumps behind the camera. This used to
  // return null, and since the caller discards that frame's movement, dragging a node
  // upward at low pitch (a near-edge-on viewpoint) produced **no response at all**.
  // Clamping denom to a positive floor instead pushes the solution continuously out
  // to "a far point toward the horizon", and the radius cap below catches it at the
  // ring's edge — it slides to the edge instead of freezing.
  //
  // Follow-up to opening the full pitch range (2026-08-18, second round): from below
  // (sp<0) the denominator's sign in the normal region is **negative**. Clamping
  // unconditionally to a positive floor, as before, would pin every drag from an
  // underside viewpoint to the floor constant. The viewpoint (whether the camera is
  // above or below = the sign of sp) decides the expected sign, and only the
  // magnitude is clamped on that side — continuity across the horizon (no sign flip)
  // holds identically for both viewpoints.
  const rawDenom = DOME_FOCAL * sp + uy * cp;
  const denom =
    sp >= 0
      ? Math.max(rawDenom, DOME_PLANE_SOLVE_DENOM_MIN)
      : Math.min(rawDenom, -DOME_PLANE_SOLVE_DENOM_MIN);
  const zr = -(uy * (DOME_FOCAL - planeY * sp) + DOME_FOCAL * planeY * cp) / denom;
  const z2 = -planeY * sp + zr * cp;
  const s = DOME_FOCAL / Math.max(DOME_FOCAL + z2, DOME_FOCAL * 0.05);
  if (!Number.isFinite(s) || !Number.isFinite(zr)) return null;
  const x = ux / s;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let px = x * cy + zr * sy;
  let pz = -x * sy + zr * cy;
  const r = Math.hypot(px, pz);
  if (r > DOME_DRAG_MAX_RADIUS) {
    const k = DOME_DRAG_MAX_RADIUS / r;
    px *= k;
    pz *= k;
  }
  return { px, pz };
}

/** Clamp pitch into range — keeps it from collapsing to edge-on or plan view. */
export function clampDomePitch(pitch: number): number {
  return Math.min(DOME_PITCH_MAX, Math.max(DOME_PITCH_MIN, pitch));
}

/**
 * Pitch rubber-banding during a drag — the part beyond the limit is taken at a
 * quarter resistance (the same grammar as iOS scroll boundaries). On release the loop
 * returns exponentially to the `clampDomePitch` target: pressed and rebounding rather
 * than stuck against the wall.
 */
export function resistDomePitch(pitch: number): number {
  if (pitch > DOME_PITCH_MAX)
    return DOME_PITCH_MAX + Math.min(DOME_PITCH_OVERSHOOT_CAP, (pitch - DOME_PITCH_MAX) * 0.25);
  if (pitch < DOME_PITCH_MIN)
    return DOME_PITCH_MIN - Math.min(DOME_PITCH_OVERSHOOT_CAP, (DOME_PITCH_MIN - pitch) * 0.25);
  return pitch;
}

/** Per-frame decay of release momentum — the same feel regardless of dt (geometric decay per ms). */
export function decayOrbitVelocity(velRadPerMs: number, dtMs: number): number {
  const v = velRadPerMs * Math.pow(ORBIT_VEL_DECAY_PER_MS, dtMs);
  return Math.abs(v) < ORBIT_VEL_EPS ? 0 : v;
}

/**
 * One step of the critically damped spring for in-plane node drag (semi-implicit
 * Euler). Makes a node follow the pointer **as if it had mass** rather than instantly
 * — the velocity at the moment of grabbing carries over, and on release it settles
 * into the target (the last pointer position). `angFreq` is taken straight from
 * `--topology-v2-camera-spring-angfreq-interactive` (the crisp tier): no new easing
 * invented, the existing value layer extended to the 3D axis.
 */
export interface DomeDragSpring {
  px: number;
  pz: number;
  vx: number;
  vz: number;
}

export function stepDomeDragSpring(
  spring: DomeDragSpring,
  targetPx: number,
  targetPz: number,
  dtMs: number,
  angFreq: number,
): void {
  const dt = Math.min(dtMs, 64) / 1000;
  const ax = angFreq * angFreq * (targetPx - spring.px) - 2 * angFreq * spring.vx;
  const az = angFreq * angFreq * (targetPz - spring.pz) - 2 * angFreq * spring.vz;
  spring.vx += ax * dt;
  spring.vz += az * dt;
  spring.px += spring.vx * dt;
  spring.pz += spring.vz * dt;
}

/** The world bbox the dome occupies at the current yaw/pitch — input to 3D's "fit view". */
export function domeWorldBounds(
  model: DomeModel,
  yaw: number,
  pitch: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const coord of model.coords.values()) {
    const p = projectDomeCoord(model, coord, yaw, pitch);
    if (p.wx < minX) minX = p.wx;
    if (p.wx > maxX) maxX = p.wx;
    if (p.wy < minY) minY = p.wy;
    if (p.wy > maxY) maxY = p.wy;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Among the angles equivalent to `target` (mod 2π), the one nearest `current` — keeps
 * a programmatic rotation ("fit view", selection reframe) from taking the long way
 * round.
 */
export function domeNearestYawTurn(target: number, current: number): number {
  return target + Math.round((current - target) / TAU) * TAU;
}

/**
 * Yaw target for a selection reframe — the angle that brings this node to the dome's
 * **front** (nearest the camera, minimal z2). In the projection depth is
 * `zr = r·sin(yaw + θ)` (θ = atan2(pz, px)), so `yaw + θ = −π/2` is the minimum. The
 * return value is the equivalent angle nearest the current yaw, so rotation always
 * takes the short way.
 *
 * Why the front (2026-08-18, second round; owner: *"a proper camera move motion seems needed when clicking"
 * — clicking should get a proper camera move too): in a dome a node
 * can be on the structure's **far side**, and zooming alone would grow it while it
 * stays hidden behind other rings. If 2D's focus dive is "bring the target to the
 * centre of the screen", the dome's equivalent is "bring the target to the front of
 * the structure" — yaw is the camera's third axis, so rotating *is* moving the camera.
 */
export function domeFocusYaw(coord: DomeCoord, currentYaw: number): number {
  const r = Math.hypot(coord.px, coord.pz);
  // On the axis (the project apex, say) there is no bearing — and no reason to rotate.
  if (r < 1e-6) return currentYaw;
  const theta = Math.atan2(coord.pz, coord.px);
  return domeNearestYawTurn(-Math.PI / 2 - theta, currentYaw);
}

/**
 * The world bbox a node set (ego: the selected node + 1-hop) projects to at a given
 * pose — the camera target input for a selection reframe. Ids missing from the model
 * are skipped.
 */
export function domeEgoWorldBounds(
  model: DomeModel,
  ids: Iterable<string>,
  yaw: number,
  pitch: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const coord = model.coords.get(id);
    if (!coord) continue;
    const p = projectDomeCoord(model, coord, yaw, pitch);
    if (p.wx < minX) minX = p.wx;
    if (p.wx > maxX) maxX = p.wx;
    if (p.wy < minY) minY = p.wy;
    if (p.wy > maxY) maxY = p.wy;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * A programmatic pose move ("fit view", selection reframe) — puts yaw/pitch on the
 * same cubic ease-in-out clock as the camera tween. The loop interpolates it every
 * frame, and it is dropped the instant an orbit drag, wheel or pointerdown begins so
 * the gesture takes over (the same interruption contract as the 2D camera tween).
 */
interface DomePoseTween {
  startYaw: number;
  startPitch: number;
  targetYaw: number;
  targetPitch: number;
  /** `performance.now()` clock — the same reference as the camera tween. */
  startMs: number;
  durationMs: number;
}

/**
 * Dome runtime — the single state box the loop (`use-topology-loop.ts`) owns and
 * updates every frame. Pointer handlers (orbit drag, in-plane node drag, hit-testing)
 * and instrumentation share this frame's coordinates and pose through **this one
 * box**. The gesture decision (node vs orbit) is made by the same `hitTestWorld` as
 * 2D — we do not create a second source of truth.
 */
/**
 * One sample point on a latitude ring — world 2D coordinates plus this frame's
 * normalised depth. It uses the **same normalisation** as the node frame
 * (`DomeNodeFrame`): if fog used different scales for nodes and lines, two things at
 * the same depth would draw at different brightness.
 */
interface DomeRingSample {
  wx: number;
  wy: number;
  u: number;
}

/** One kind plane's latitude ring — a sampled polyline plus that tier's assembly ramp. */
interface DomeRing {
  kind: DomeViewKind;
  /** Assembly ramp 0..1 — rings rise and fall with their tier across the 2D↔3D transition. */
  a: number;
  points: DomeRingSample[];
}

/**
 * Cone-base rings — **the device that makes the tree read as a tree of cones**.
 *
 * The dome drew one latitude ring per kind plane; those rings were what made it
 * read as a dome rather than as spokes (ledger 2026-08-18 (78)). The cone tree
 * keeps the same device with a different membership: the ring is now **each
 * parent's base circle** (`DomeModel.circles`), so the three things a ring did
 * still happen, and one more:
 *
 * 1. **Height being a typed fact becomes visible** — bases sit on the kind
 *    planes, so "project on top, element at the bottom" reads without explanation.
 * 2. **Rotation gains a reference** — how flat an ellipse is *is* the pitch, and
 *    which arc is in front *is* the yaw.
 * 3. **Depth becomes a continuous signal** — a ring's brightness runs all the way
 *    round and makes the fog ramp itself visible.
 * 4. **Ownership becomes a shape** — a base under a parent, with its children
 *    on it, is the cone; a person can point at "that domain's cone".
 *
 * A ring is **a coordinate system, not data** — so it plays the same role as the
 * background dot grid ("it only says a coordinate system exists"), and its ink is the
 * lowest tier to match.
 */

/**
 * Samples on the largest ring. At 96, the domain ring (r=148) has a per-segment chord-arc
 * error under 0.1 dome units, so it does not look faceted. 3 rings × 96 = 288
 * projections per frame — 2.3× the 125 node projections, but both are below the
 * decimal point of the frame budget.
 */
export const DOME_RING_SAMPLES = 96;

/**
 * Base opacity of ring ink — before fog and the assembly ramp are multiplied in.
 *
 * Raise it and the coordinate system competes with the data for attention. Kept low
 * so it stays the same tier as the background dot grid ("it only says it exists").
 * Near arcs draw at this value; on far arcs fog multiplies in 0.09 and they
 * effectively disappear.
 */
export const DOME_RING_ALPHA = 0.34;

/** Base hairline width of a ring (screen px) — the depth width attenuation multiplies straight into it. */
export const DOME_RING_WIDTH_PX = 1;

/**
 * A **coordinate morph** — the frames between one model and the next when the
 * arrangement (or the world) changes while the dome is on screen (2026-09-02).
 *
 * Before this, an arrangement switch swapped `model` and the next frame drew the
 * new coordinates: a hard cut. The offset the frame map carries is
 * `(projected − 2D) × ramp`, and the ramp is already 1 mid-session, so nothing
 * interpolated. Now the previous model's coordinates are kept and each node is
 * drawn at `lerp(from, to, ease(t))`; a node with no previous coordinate takes its
 * target directly. The previous cone bases fade out while the new ones fade in on
 * the same clock, so a dome→cloud switch dissolves its rings rather than dropping
 * them. Duration is the pose-move cap (`DOME_POSE_MS`) so a simultaneous camera
 * refit runs on the same clock. Reduced-motion passes 0 and gets the cut.
 */
interface DomeMorph {
  fromCoords: ReadonlyMap<string, DomeCoord>;
  fromCircles: readonly DomeCircle[];
  startMs: number;
  durationMs: number;
}

export interface DomeRuntime {
  model: DomeModel;
  /** In-flight coordinate morph, or null. Registered with the idle gate — a morph is motion. */
  morph: DomeMorph | null;
  /**
   * This frame's cone-base rings (world coordinates) — `updateDomeFrame` updates them
   * in place. Entries and arrays are reused, so allocations per frame converge to 0.
   */
  rings: DomeRing[];
  /** Per-node handoff map from the last drawn frame — the reference hit-testing and instrumentation judge against. */
  frame: Map<string, DomeNodeFrame>;
  /**
   * World bbox of the nodes drawn in the last frame — the anchor for the camera pan
   * leash (elastic clamp). Using 2D `world.bounds` as-is left the leash anchor
   * misaligned with the camera centre the dome fit had set, so the first wheel-zoom
   * tick dragged the camera toward the 2D centre (measured 2026-08-18 — the world
   * point under the cursor moved 175 units). `updateDomeFrame` refreshes it every
   * frame; null when the frame is empty (the 2D path unchanged).
   */
  drawnBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /**
   * The camera factor at which the whole dome sits on screen with 15% margin — the
   * dome fit computes and stores it. While the dome is on, the camera factor's
   * **floor** drops to this value (the min of it and the 2D floor).
   *
   * Why (measured 2026-08-18): the dome's projected bbox is wider than the 2D spine
   * bbox, so the fit factor (0.391) was **below** the 2D anchor-derived floor
   * (0.574). Previously the fit wrote only the target as 0.391 while the spring stuck
   * at the floor, 0.574 — with target ≠ value, the first wheel tick computed its
   * anchor from the target factor (0.391) and the screen jumped sideways (175 world
   * units), and zooming out right after a fit was a permanent no-op (the target was
   * already below the floor). Dropping the floor to the fit factor makes the target
   * reachable so target = value holds, and zoom-out can return to "the whole dome in
   * frame". null = dome off (2D unchanged).
   */
  fitScale: number | null;
  /** Frame generation — invalidation key for the edge candidate cache (needed because entries are updated in place). */
  frameEpoch: number;
  yaw: number;
  pitch: number;
  /**
   * Orbit drag's target pose — pointer events fill it immediately and the loop relaxes
   * yaw/pitch toward it each frame at `ORBIT_SMOOTH_TAU_MS` (removing the staircase
   * when the event period exceeds the frame period). Outside a drag it is always kept
   * in sync with yaw/pitch.
   */
  yawTarget: number;
  pitchTarget: number;
  /** Orbit release momentum (rad/ms) — `decayOrbitVelocity` reduces it every frame. */
  yawVel: number;
  /** Pitch release momentum (rad/ms) — the same decay. */
  pitchVel: number;
  /**
   * The meaningful-landing yaw the release momentum is aimed at, or null (pure
   * momentum). Pointer-up projects the natural landing point and fills it, and the
   * loop carries it there by a velocity-continuous exponential approach. Any new input
   * clears it immediately (input always wins). Rationale: the
   * `ORBIT_SNAP_WINDOW_RAD` doc-block.
   */
  yawSnap: number | null;
  /**
   * Whether idle spin is armed — the attract loop belongs to **a screen nobody has
   * touched yet** (2026-08-18, second round; owner: *"stop it spinning after I click"
   * — stop it spinning after I click). Any user intervention (orbit, zoom,
   * pinch, node drag, selection) drops it to false and it does not come back, so
   * rotation never fights the pose being worked on. Only explicit returns re-arm it:
   * the "auto-align" chip, which eases the pose home, and re-entering 3D.
   */
  spinArmed: boolean;
  /**
   * The programmatic pose move in progress — "fit view" and selection reframe fill it
   * and the loop interpolates it cubically each frame. Any gesture clears it
   * immediately (the gesture inherits the current pose — the same contract as the 2D
   * tween).
   */
  poseTween: DomePoseTween | null;
  /** Per-kind yaw torsion (rad) — orbit drag charges it and every frame decays it. */
  lag: Record<DomeViewKind, number>;
  /** Assembly clock, ms, 0..`DOME_ASSEMBLE_TOTAL_MS` — forward when switching on, backward when switching off. */
  rampClock: number;
  /**
   * Is the entry sweep still alive — it switches off the moment a hand touches the map
   * (the same contract as `spinArmed`). The sweep is an offset added to the drawn pose
   * only, so grabbing a node while it is on makes **the plane back-projection solve a
   * different pose than the one drawn** and the node jumps out of the hand. "Touch it
   * and it turns off" is the cheapest way not to define the pose in two places.
   */
  entryArmed: boolean;
  /** The entry sweep's own clock (ms) — from 0 on every re-entry. See `DOME_ENTRY_SWEEP_MS`. */
  entryClock: number;
  /**
   * The pose this frame **actually drew** — `yaw/pitch` plus the entry sweep offset.
   * `updateDomeFrame` writes it every frame, and consumers that must recompute that
   * frame's geometry (relation-line meridian control points) read it. Reading
   * `yaw/pitch` instead would leave **only the control point at the final pose**
   * during entry, so the curve would pass through a different world than its
   * endpoints.
   */
  drawYaw: number;
  drawPitch: number;
  /**
   * Trig of the drawn pose — computed **once per frame**.
   *
   * Meridian control points are computed per edge (258 times in this vault), so
   * recomputing `cos/sin` inside would exceed a thousand calls per frame. The pose is
   * constant within a frame, so computing it once is enough; this is that cache.
   */
  drawCosYaw: number;
  drawSinYaw: number;
  drawCosPitch: number;
  drawSinPitch: number;
  /** The target is on (3D) and no realm is active — the branch condition for orbit vs in-plane drag. */
  active: boolean;
  /** An orbit drag is in progress (empty-space drag) — the stop condition for idle spin and momentum. */
  orbiting: boolean;
  /**
   * In-plane node drag — the grabbed node's spring state. It survives `released` until
   * the spring settles into its last target (velocity continuity — the loop watches
   * for the settle and clears it).
   */
  drag: { nodeId: string; spring: DomeDragSpring; targetPx: number; targetPz: number; released?: boolean } | null;
}

/** A fresh dome runtime — default pose, assembly clock at 0 (2D). */
export function createDomeRuntime(model: DomeModel): DomeRuntime {
  return {
    model,
    morph: null,
    frame: new Map(),
    rings: [],
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
    active: false,
    orbiting: false,
    drag: null,
  };
}
