/**
 * Galaxy's pure visual model: each concept is a borderless light core, corona and sparse
 * glint, with positions from `galaxy-layout.ts`. Resting luminance keeps the connection-count
 * magnitude; deterministic twinkle modulates it, so one instant is not an importance rank.
 * Reduced motion returns a steady level.
 */

import type { WorldNodeKind } from "../ui/topology-world";

/**
 * Normalises the `size + fullDegree * 18` ranking `topology-world.ts` already uses, so the
 * sky has magnitudes rather than a special top N. The square root follows Stevens' law,
 * as `computeMagnitudeScale` does for radius.
 */
export function starMagnitude(size: number, fullDegree: number, maxRaw: number): number {
  const raw = Math.max(0, (Number.isFinite(size) ? size : 0) + Math.max(0, fullDegree) * 18);
  const ceiling = Math.max(1, maxRaw);
  return Math.sqrt(Math.min(1, raw / ceiling));
}

/**
 * A node connected to nothing still exists, and the overview shows what you have, so faint
 * stars never reach zero; the range above the floor carries the fact.
 */
export const GALAXY_DIM_FLOOR = 0.42;

export function starLuminance(magnitude: number): number {
  const m = Number.isFinite(magnitude) ? Math.min(1, Math.max(0, magnitude)) : 0;
  return GALAXY_DIM_FLOOR + (1 - GALAXY_DIM_FLOOR) * m;
}

/**
 * Keeps the `#rrggbb` contract of `drawStarEmission`: the grid lerp returns `rgb(...)`,
 * which the emitter's alpha helper cannot parse.
 */
export function galaxySelectionInk(temperatureInk: string, selectionInk: string, ramp: number): string {
  const amount = Math.min(1, Math.max(0, Number.isFinite(ramp) ? ramp : 0));
  const parse = (ink: string) => Number.parseInt(ink.slice(1), 16);
  const a = parse(temperatureInk);
  const b = parse(selectionInk);
  const channel = (shift: number) => {
    const from = (a >> shift) & 255;
    const to = (b >> shift) & 255;
    return Math.round(from + (to - from) * amount);
  };
  return `#${[channel(16), channel(8), channel(0)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Warm to cool down the containment ladder, so temperature reads as depth. INDEX and the
 * inspector remain the non-colour statement of kind; radius does not identify kind.
 */
export const GALAXY_TEMPERATURE_ORDER: readonly WorldNodeKind[] = [
  "project",
  "domain",
  "capability",
  "element",
];

export function galaxyTemperatureKey(
  kind: WorldNodeKind,
): "galaxyProject" | "galaxyDomain" | "galaxyCapability" | "galaxyElement" {
  switch (kind) {
    case "project":
      return "galaxyProject";
    case "domain":
      return "galaxyDomain";
    case "capability":
      return "galaxyCapability";
    default:
      return "galaxyElement";
  }
}

/**
 * Used after returning coordinates settle, so Flat bodies reappear without outlines
 * travelling across the sky.
 */
export function bodyPresence(galaxy: number): number {
  const g = Number.isFinite(galaxy) ? Math.min(1, Math.max(0, galaxy)) : 0;
  const remaining = 1 - g;
  return remaining * remaining;
}

export interface GalaxyAppearance {
  /** Responds first so the view change is acknowledged at once. */
  core: number;
  field: number;
  /** Settles after the heart without extending the duration. */
  corona: number;
  /** Follows the aura so structure never cuts ahead of its stars. */
  filament: number;
}

function phase(ramp: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (ramp - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/**
 * Heart first, then field, corona and relations inside the same reversible ramp; reversing
 * the view retraces these values.
 */
export function galaxyAppearance(galaxy: number): GalaxyAppearance {
  const g = Number.isFinite(galaxy) ? Math.min(1, Math.max(0, galaxy)) : 0;
  return {
    core: 1 - (1 - g) ** 3,
    field: phase(g, 0, 1),
    corona: phase(g, 0.06, 0.9),
    filament: phase(g, 0.12, 1),
  };
}

function atmosphereHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffff_ffff;
}

export interface GalaxyTwinkle {
  intensity: number;
  glint: number;
  rotation: number;
  periodMs: number;
}

interface TwinkleSeed {
  seed: number;
  periodMs: number;
  flareDurationMs: number;
  rotation: number;
}

const TWINKLE_SEED_LIMIT = 65_536;
const twinkleSeeds = new Map<string, TwinkleSeed>();

function twinkleSeedFor(nodeId: string): TwinkleSeed {
  const cached = twinkleSeeds.get(nodeId);
  if (cached !== undefined) return cached;
  if (twinkleSeeds.size >= TWINKLE_SEED_LIMIT) twinkleSeeds.clear();
  const entry = {
    seed: atmosphereHash(nodeId),
    periodMs: 4000 + atmosphereHash(`${nodeId}:interval`) * 4000,
    flareDurationMs: 700 + atmosphereHash(`${nodeId}:duration`) * 600,
    rotation: atmosphereHash(`${nodeId}:glint`) * Math.PI,
  };
  twinkleSeeds.set(nodeId, entry);
  return entry;
}

/** Deterministic; no frame changes graph meaning. */
export function galaxyTwinkle(nodeId: string, nowMs: number, reducedMotion: boolean): GalaxyTwinkle {
  const { seed, periodMs, flareDurationMs, rotation } = twinkleSeedFor(nodeId);
  if (reducedMotion) return { intensity: 0.9, glint: 0.32, rotation, periodMs };
  const cycleMs = ((nowMs + seed * periodMs) % periodMs + periodMs) % periodMs;
  const flareProgress = cycleMs <= flareDurationMs ? cycleMs / flareDurationMs : -1;
  const glint = flareProgress < 0 ? 0 : Math.sin(Math.PI * flareProgress) ** 2;
  return {
    // The painter floors the hot core's contrast; this wider range is for corona and glint, so
    // a leaf flares without blinking out.
    intensity: 0.9 + glint * 0.7,
    glint,
    rotation,
    periodMs,
  };
}

export interface GalaxyMeteorPhase {
  progress: number;
  direction: 1 | -1;
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  trailFraction: number;
}

const METEOR_FIRST_AT_MS = 1800;
const METEOR_INTERVAL_COUNT = 12;

/** FNV plus Murmur's final avalanche, so neighbouring cycle suffixes never share visible lanes. */
function meteorHash(value: string): number {
  let mixed = Math.floor(atmosphereHash(value) * 0xffff_ffff) >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x85eb_ca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2_ae35);
  mixed ^= mixed >>> 16;
  return (mixed >>> 0) / 0xffff_ffff;
}

const METEOR_INTERVALS_MS = Array.from({ length: METEOR_INTERVAL_COUNT }, (_, index) =>
  7000 + meteorHash(`meteor-interval:${index}`) * 5000,
);
const METEOR_INTERVAL_BLOCK_MS = METEOR_INTERVALS_MS.reduce((sum, value) => sum + value, 0);

/**
 * A repeating interval block finds the cycle in constant time; the global cycle id keeps
 * visible paths from repeating with it.
 */
export function galaxyMeteorPhase(
  elapsedMs: number,
  entrySeed = 0,
  quietUntilMs = Number.NEGATIVE_INFINITY,
): GalaxyMeteorPhase | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < METEOR_FIRST_AT_MS) return null;
  const sinceFirst = elapsedMs - METEOR_FIRST_AT_MS;
  const block = Math.floor(sinceFirst / METEOR_INTERVAL_BLOCK_MS);
  let withinBlock = sinceFirst - block * METEOR_INTERVAL_BLOCK_MS;
  let index = 0;
  while (index < METEOR_INTERVALS_MS.length - 1 && withinBlock >= METEOR_INTERVALS_MS[index]) {
    withinBlock -= METEOR_INTERVALS_MS[index];
    index += 1;
  }
  const cycle = block * METEOR_INTERVAL_COUNT + index;
  const seed = `${entrySeed.toFixed(6)}:${cycle}`;
  const duration = 820 + meteorHash(`meteor-duration:${seed}`) * 620;
  const within = withinBlock;
  if (within > duration || elapsedMs - within <= quietUntilMs) return null;
  const direction = meteorHash(`meteor-direction:${seed}`) < 0.5 ? 1 : -1;
  const deltaX = direction * (0.28 + meteorHash(`meteor-length-x:${seed}`) * 0.34);
  const absDeltaX = Math.abs(deltaX);
  const startX = direction > 0
    ? 0.03 + meteorHash(`meteor-start-x:${seed}`) * (0.94 - absDeltaX)
    : 0.97 - meteorHash(`meteor-start-x:${seed}`) * (0.94 - absDeltaX);
  const verticalDirection = meteorHash(`meteor-slope:${seed}`) < 0.22 ? -1 : 1;
  const deltaY = verticalDirection * (0.1 + meteorHash(`meteor-delta-y:${seed}`) * 0.2);
  const absDeltaY = Math.abs(deltaY);
  const startY = verticalDirection > 0
    ? 0.04 + meteorHash(`meteor-start-y:${seed}`) * (0.92 - absDeltaY)
    : 0.96 - meteorHash(`meteor-start-y:${seed}`) * (0.92 - absDeltaY);
  return {
    progress: Math.min(1, Math.max(0, within / duration)),
    direction,
    startX,
    startY,
    deltaX,
    deltaY,
    trailFraction: 0.3 + meteorHash(`meteor-trail:${seed}`) * 0.2,
  };
}

export interface GalaxyNebulaMotion {
  /** Geometry never breathes or zooms. */
  luminance: number;
  innerRotation: number;
  outerRotation: number;
}

/**
 * Two transparent wisp layers move through shallow unequal arcs while the base texture and
 * every real concept stay fixed and easy to point at. Reduced motion is the anchored frame.
 */
export function galaxyNebulaMotion(elapsedMs: number, reducedMotion: boolean): GalaxyNebulaMotion {
  if (reducedMotion) {
    return { luminance: 1, innerRotation: 0, outerRotation: 0 };
  }
  const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return {
    // Six percent reads across a few seconds without making the canvas pulse.
    luminance: 0.94 + Math.sin((time / 8400) * Math.PI * 2) * 0.06,
    innerRotation: Math.sin((time / 18000) * Math.PI * 2) * (Math.PI / 26),
    outerRotation: Math.sin((time / 27000) * Math.PI * 2 + Math.PI * 0.72) * (Math.PI / 36),
  };
}

/**
 * Relations thin to filaments but never vanish: without structure between stars the galaxy
 * is a scatter plot. Floored well above where a line stops being visible.
 */
export const GALAXY_FILAMENT_FLOOR = 0.34;

export function filamentPresence(galaxy: number): number {
  const g = Number.isFinite(galaxy) ? Math.min(1, Math.max(0, galaxy)) : 0;
  return 1 - (1 - GALAXY_FILAMENT_FLOOR) * g;
}
