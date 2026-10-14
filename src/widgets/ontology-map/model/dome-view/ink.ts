import type { DomeArrangement, DomeViewKind } from './types';

/**
 * Near 1.0, far 0.09, falling as (1 − u)^1.8. Deeper than the 2D 3:1 ink floor by a 3D-only dispensation
 * (`docs/DECISIONS.md`, 3D exemption list); anything that must be read (hover, focus, ego,
 * trail) is exempted. `u` is depth normalised in this frame, 0 near.
 */
export function domeFogAlpha(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 0.09 + 0.91 * Math.pow(1 - c, 1.8);
}

/**
 * A depth-dependent halo (Everts et al., IEEE TVCG 15(6), 2009): each line is first stroked
 * slightly wider in the background colour, cutting what lies behind so near reads over far.
 * It removes ink rather than adding it, so it is not a glow. Widest near and 0 far, since a
 * far halo would claim occlusion it cannot have; in screen px so the cut is zoom-independent.
 */
export const DOME_HALO_MAX_PX = 3.4;

export function domeHaloPx(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return DOME_HALO_MAX_PX * Math.pow(1 - c, 1.35);
}

/**
 * Fog has already thinned far lines, so the halo needs a gain to be denser than what it
 * cuts; capped so a barely visible far line leaves no solid mark.
 */
export const DOME_HALO_ALPHA_GAIN = 2.4;
export const DOME_HALO_ALPHA_CAP = 0.96;

/** The hero's width attenuation (0.45→1.60) as a multiplier. */
export function domeLineWidthFactor(u: number): number {
  const c = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return 0.35 + 0.55 * (1 - c);
}

/**
 * Floor under a resting relation line's `fog alpha × width factor` product (a lit near line
 * has 0.90); stacked, fog and width would draw the far end at 3.5% of the near ink. Past the
 * crossover (u ≈ 0.17) alpha rises as width falls. The near side is unchanged; width, halo,
 * node fog, perspective and draw order still carry depth. The browser gate is
 * the spec `tests/e2e/map/3d/map-3d-relation-ink.spec.ts`.
 */
const DOME_EDGE_INK_FLOOR = 0.62;

/**
 * Without it the far end meets the ink floor as a bright hairline at alpha 1, reading as
 * nearer than the line in front.
 */
const DOME_EDGE_WIDTH_FLOOR = 0.72;

/** A sub-pixel hairline loses coverage to antialiasing before alpha, so width is part of the floor. */
export function domeEdgeWidthFactor(u: number): number {
  return Math.max(domeLineWidthFactor(u), DOME_EDGE_WIDTH_FLOOR);
}

/**
 * Raw fog lifted only as far as the ink floor needs against the floored width, never past 1.
 * Nodes, plane rings and exempt lines keep `domeFogAlpha`.
 */
export function domeEdgeFogAlpha(u: number): number {
  return Math.min(1, Math.max(domeFogAlpha(u), DOME_EDGE_INK_FLOOR / domeEdgeWidthFactor(u)));
}

/**
 * The ink floor reaches the eye only while the stroke covers a device pixel; thinner, the
 * rasteriser splits it across two rows and the peak contrast falls, which on a DPR 1 screen
 * gave back the whole gain. The caller converts this at its rasterising ratio
 * (`domeEdgeMinWidthPx`). Browser gate: `tests/e2e/map/3d/map-3d-relation-ink.spec.ts`.
 */
export const DOME_EDGE_DEVICE_WIDTH_FLOOR = 1.0;

/** A missing or nonsense ratio falls back to 1, the widest floor rather than none. */
export function domeEdgeMinWidthPx(devicePixelRatio: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return DOME_EDGE_DEVICE_WIDTH_FLOOR / dpr;
}


/*
 * Far-side detail ramp: secondary strokes (halo, shading, seam, outline, pin tick) fold away
 * on the back hemisphere, where fog has already flattened them; the marks themselves never
 * change. Exactly 1 up to START (> 0.5), so no front pixel differs; smoothstep, so nothing
 * pops as the dome turns; and converging far halos to 0 is what Everts et al. prescribe.
 */
export const DOME_DETAIL_FADE_START = 0.55;
export const DOME_DETAIL_FADE_END = 0.75;

/** u ≤ 0.55 → 1, u ≥ 0.75 → 0, C¹ continuous. */
export function domeDetailFactor(u: number): number {
  if (u <= DOME_DETAIL_FADE_START) return 1;
  if (u >= DOME_DETAIL_FADE_END) return 0;
  const t = (u - DOME_DETAIL_FADE_START) / (DOME_DETAIL_FADE_END - DOME_DETAIL_FADE_START);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Screen-pixel radii, so fitting the cone larger buys spacing, not ink: with a dome-unit
 * radius the camera zoom grew dots and gaps alike and every size kept the same overlaps.
 * Perspective (`p.s`) still scales a dot, since that is depth, not zoom.
 */
export const DOME_NODE_PX: Readonly<Record<DomeViewKind, number>> = {
  project: 13,
  domain: 8.5,
  capability: 5.8,
  element: 4,
};

/**
 * The floor fog may darken a node's rim to, so the dimmest rim token
 * (`--map-node-stroke-element`) keeps 3 : 1 over the canvas ground, the flat map's ink
 * floor. `dome-rim-contrast.contract.test.ts` derives it from the tokens.
 */
export const DOME_RIM_FOG_FLOOR = 0.75;

/**
 * Higher than the cone's 0.34 because a plane ring spends most of its circumference at
 * depth, where fog and width falloff multiply it and the ring ink is near the ground: 0.55
 * is where the ring is a visible hairline without reading as the subject.
 */
export const DOME_STRATA_RING_ALPHA = 0.55;

export function domeRingAlphaFor(arrangement: DomeArrangement): number {
  return arrangement === "strata" ? DOME_STRATA_RING_ALPHA : DOME_RING_ALPHA;
}

/**
 * Each parent's base circle drawn as a ring, which makes the tree read as cones: bases on
 * the kind planes show height as a fact, an ellipse's flatness and front arc show pitch and
 * yaw, brightness round the ring shows depth, and a base under a parent makes ownership a
 * shape. A coordinate system, not data, so its ink is the lowest tier.
 */

/** At 96 the domain ring's chord-arc error stays under 0.1 dome units, so it never looks faceted. */
export const DOME_RING_SAMPLES = 96;

/** Kept low so the coordinate system never competes with the data. */
export const DOME_RING_ALPHA = 0.34;

/** The depth width attenuation multiplies straight into it. */
export const DOME_RING_WIDTH_PX = 1;
