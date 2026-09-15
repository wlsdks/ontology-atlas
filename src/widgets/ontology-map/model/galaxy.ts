/**
 * Galaxy's pure visual model. The explicit flat view keeps the graph intact
 * while its sibling `galaxy-layout.ts` supplies view-specific positions and
 * this module paints each concept as a borderless circular light core,
 * corona, and sparse glint. INDEX and inspector text state kind; the existing
 * warm-to-cool token ramp reinforces it without making size stand for kind.
 *
 * Resting luminance retains the map's connection-count magnitude formula.
 * Deterministic atmospheric twinkle modulates that baseline, so one instant is
 * not an exact importance rank and never means activity or recency. Reduced
 * motion returns a steady readable level. All functions stay canvas-free and
 * deterministic so the renderer owns paint while tests own the timing bounds.
 */

import type { WorldNodeKind } from "../ui/topology-world";

/**
 * A node's magnitude, 0–1, from the two numbers this map has always ranked stars by.
 *
 * `size + fullDegree * 18` is not a new formula: it is the one `topology-world.ts` already sorts
 * by to pick which nodes wear a diffraction cross, ported from the prototype. Normalising it
 * instead of taking the top N is the whole difference between "twelve nodes are special" and "a
 * sky has magnitudes".
 *
 * The square root is Stevens' law doing its job: perceived brightness grows more slowly than
 * luminance, so a linear map would make a hub of degree 40 look barely brighter than one of
 * degree 20 while crushing everything below degree 5 into the same dark. It is the same reason
 * `computeMagnitudeScale` takes the root of child count for radius.
 */
export function starMagnitude(size: number, fullDegree: number, maxRaw: number): number {
  const raw = Math.max(0, (Number.isFinite(size) ? size : 0) + Math.max(0, fullDegree) * 18);
  const ceiling = Math.max(1, maxRaw);
  return Math.sqrt(Math.min(1, raw / ceiling));
}

/**
 * How brightly a node of this magnitude burns, 0–1.
 *
 * ⚠️ **The floor is the whole argument.** A galaxy whose faint stars reach zero is not a galaxy,
 * it is a few bright nodes on an empty field — and worse, it would be a lie: a node that exists
 * and connects to nothing is still there, and the overview's job is to show what you have. The
 * floor is what keeps a leaf element visible while still letting a hub outshine it, and the
 * range above it is what carries the fact.
 */
export const GALAXY_DIM_FLOOR = 0.42;

export function starLuminance(magnitude: number): number {
  const m = Number.isFinite(magnitude) ? Math.min(1, Math.max(0, magnitude)) : 0;
  return GALAXY_DIM_FLOOR + (1 - GALAXY_DIM_FLOOR) * m;
}

/**
 * Blend two star inks while retaining the `#rrggbb` contract consumed by
 * `drawStarEmission`. The general grid lerp returns `rgb(...)`, which Canvas
 * accepts directly but the shared emitter's alpha helper cannot parse.
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
 * Kind → the colour-temperature step used by Galaxy's borderless stars.
 *
 * The ramp runs warm to cool **down the containment ladder** — project, domain, capability,
 * element — so the temperature is not an arbitrary lookup but a reading of depth: the thing that
 * contains everything is the warm centre, and the leaves are the cool rim. INDEX labels and the
 * inspector remain the non-colour statement of kind; radius keeps its existing containment-count
 * meaning and does not identify kind.
 */
export const GALAXY_TEMPERATURE_ORDER: readonly WorldNodeKind[] = [
  "project",
  "domain",
  "capability",
  "element",
];

/** The token key whose value paints a node of this kind at galaxy altitude. */
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
 * How much of the node's ordinary body survives at this galaxy level.
 *
 * A selected Galaxy frame switches the ordinary body off immediately; this
 * ramp is used after returning coordinates have settled, so Flat bodies can
 * reappear without geometric outlines travelling across the sky.
 */
export function bodyPresence(galaxy: number): number {
  const g = Number.isFinite(galaxy) ? Math.min(1, Math.max(0, galaxy)) : 0;
  const remaining = 1 - g;
  return remaining * remaining;
}

export interface GalaxyAppearance {
  /** Compact heart: responds first so the view change is acknowledged immediately. */
  core: number;
  /** Stellar atmosphere presence; the readable hot core uses the mode identity. */
  field: number;
  /** Broad, faint corona: settles after the heart without extending the duration. */
  corona: number;
  /** Relation thinning: follows the aura so structure never cuts ahead of its stars. */
  filament: number;
}

/** Smooth a normalized interval without introducing another duration or clock. */
function phase(ramp: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (ramp - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/**
 * Resolve one existing Galaxy mode ramp into coordinated paint phases.
 *
 * The heart answers immediately, then the field, corona, and relations settle
 * inside that same reversible ramp. Independent deterministic twinkle runs only
 * after this mode clock has made the stars present; reversing the view retraces
 * these entry values.
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

/** Deterministic intermittent stellar atmosphere; no frame mutates graph meaning. */
export function galaxyTwinkle(nodeId: string, nowMs: number, reducedMotion: boolean): GalaxyTwinkle {
  const seed = atmosphereHash(nodeId);
  const periodMs = 4000 + atmosphereHash(`${nodeId}:interval`) * 4000;
  const flareDurationMs = 700 + atmosphereHash(`${nodeId}:duration`) * 600;
  const rotation = atmosphereHash(`${nodeId}:glint`) * Math.PI;
  if (reducedMotion) return { intensity: 0.9, glint: 0.32, rotation, periodMs };
  const cycleMs = ((nowMs + seed * periodMs) % periodMs + periodMs) % periodMs;
  const flareProgress = cycleMs <= flareDurationMs ? cycleMs / flareDurationMs : -1;
  const glint = flareProgress < 0 ? 0 : Math.sin(Math.PI * flareProgress) ** 2;
  return {
    // The hot core has its own contrast floor in the painter. This stronger
    // range belongs to corona/glint, so a leaf can flare without blinking out.
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

/** FNV plus Murmur's final avalanche; neighboring cycle suffixes must not share visible lanes. */
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
 * One bounded meteor with a deterministic position, path, speed, and gap for
 * each apparition. A repeating interval block finds the cycle in constant
 * time; the global cycle id keeps the visible paths from repeating with it.
 */
export function galaxyMeteorPhase(elapsedMs: number, entrySeed = 0): GalaxyMeteorPhase | null {
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
  if (within > duration) return null;
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
  /** Multiplicative light level only; geometry never breathes or zooms. */
  luminance: number;
  /** Small counter-moving rotations for the two diffuse wisp layers. */
  innerRotation: number;
  outerRotation: number;
}

/**
 * Calm motion for the diffuse Galaxy atmosphere.
 *
 * The anchored base texture and every real concept stay fixed. Two transparent
 * wisp layers oscillate by less than two degrees over long, unequal cycles, so
 * gas can flow inside the arms without turning the ontology disc as a whole.
 * Reduced motion resolves to the readable anchored frame at every timestamp.
 */
export function galaxyNebulaMotion(elapsedMs: number, reducedMotion: boolean): GalaxyNebulaMotion {
  if (reducedMotion) {
    return { luminance: 1, innerRotation: 0, outerRotation: 0 };
  }
  const time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return {
    // Six percent is visible across a few seconds without making the whole
    // canvas pulse. Only light changes; the footprint never scales.
    luminance: 0.94 + Math.sin((time / 8400) * Math.PI * 2) * 0.06,
    innerRotation: Math.sin((time / 26000) * Math.PI * 2) * (Math.PI / 150),
    outerRotation: Math.sin((time / 37000) * Math.PI * 2 + Math.PI * 0.72) * (Math.PI / 120),
  };
}

/**
 * How much of a relation's ink survives at this galaxy level.
 *
 * Relations do not disappear — a galaxy with no structure between its stars is a scatter plot,
 * and the structure is the thing Atlas is for. They thin to filaments: enough to read the shape
 * of the graph as gas between the stars, not enough to compete with the stars themselves. It
 * never reaches zero, and it is floored well above the point where a line stops being visible on
 * this canvas at all.
 */
export const GALAXY_FILAMENT_FLOOR = 0.34;

export function filamentPresence(galaxy: number): number {
  const g = Number.isFinite(galaxy) ? Math.min(1, Math.max(0, galaxy)) : 0;
  return 1 - (1 - GALAXY_FILAMENT_FLOOR) * g;
}
