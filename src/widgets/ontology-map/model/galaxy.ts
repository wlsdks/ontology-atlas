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
 * A star has no fill and no outline; it is light. But the body cannot simply be switched off,
 * because the ramp is continuous and a body that vanished at some threshold would put the flip
 * back that choosing altitude removed. It fades, and it fades **faster than the light arrives**
 * — the exponent — so there is no altitude at which a node is both a solid shape and a bright
 * star, which is the frame that would read as a bug.
 */
export function bodyPresence(galaxy: number): number {
  const g = Number.isFinite(galaxy) ? Math.min(1, Math.max(0, galaxy)) : 0;
  const remaining = 1 - g;
  return remaining * remaining;
}

export interface GalaxyAppearance {
  /** Compact heart: responds first so the view change is acknowledged immediately. */
  core: number;
  /** Stellar field presence: resolves with the retiring body crossfade. */
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

/** Deterministic, slow stellar atmosphere; no frame mutates graph meaning. */
export function galaxyTwinkle(nodeId: string, nowMs: number, reducedMotion: boolean): GalaxyTwinkle {
  const seed = atmosphereHash(nodeId);
  const periodMs = 3000 + seed * 3000;
  const rotation = atmosphereHash(`${nodeId}:glint`) * Math.PI;
  if (reducedMotion) return { intensity: 0.9, glint: 0.32, rotation, periodMs };
  const wave = 0.5 + 0.5 * Math.sin((nowMs / periodMs + seed) * Math.PI * 2);
  const glint = phase(wave, 0.58, 1);
  return {
    intensity: 0.72 + wave * 0.36,
    glint,
    rotation,
    periodMs,
  };
}

export interface GalaxyMeteorPhase {
  progress: number;
  lane: number;
  direction: 1 | -1;
}

/** One bounded meteor: first at 1.8s, then every 9.5s, travelling for 1.15s. */
export function galaxyMeteorPhase(elapsedMs: number): GalaxyMeteorPhase | null {
  const firstAt = 1800;
  const interval = 9500;
  const duration = 1150;
  if (!Number.isFinite(elapsedMs) || elapsedMs < firstAt) return null;
  const sinceFirst = elapsedMs - firstAt;
  const cycle = Math.floor(sinceFirst / interval);
  const within = sinceFirst - cycle * interval;
  if (within > duration) return null;
  return {
    progress: Math.min(1, Math.max(0, within / duration)),
    lane: atmosphereHash(`meteor:${cycle}`),
    direction: cycle % 2 === 0 ? 1 : -1,
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
