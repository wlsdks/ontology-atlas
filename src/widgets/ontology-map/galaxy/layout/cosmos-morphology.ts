import type { CosmosGalaxyModel } from "./cosmos-model";

export type GalaxyShape = "spiral" | "elliptical" | "irregular";

export interface GalaxyForm {
  shape: GalaxyShape;
  arms: number;
  pitch: number;
  radius: number;
  tilt: number;
  angle: number;
  spin: 1 | -1;
  axisRatio: number;
}

export const GALAXY_RADIUS_UNIT = 14;

const IRREGULAR_BELOW_MEMBERS = 10;

const ELLIPTICAL_CONCENTRATION = 0.4;

const ELLIPTICAL_COHESION = 0.9;

export function hash01(id: string, salt: string): number {
  let h = 2166136261;
  const text = `${salt}:${id}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function classifyGalaxy(galaxy: Pick<CosmosGalaxyModel, "members" | "cohesion" | "concentration">): GalaxyShape {
  if (galaxy.members < IRREGULAR_BELOW_MEMBERS) return "irregular";
  if (galaxy.concentration >= ELLIPTICAL_CONCENTRATION || galaxy.cohesion >= ELLIPTICAL_COHESION) return "elliptical";
  return "spiral";
}

export function galaxyForm(galaxy: CosmosGalaxyModel): GalaxyForm {
  const shape = classifyGalaxy(galaxy);
  const sizeFactor = shape === "elliptical" ? 0.8 : shape === "irregular" ? 0.95 : 1;
  const radius = GALAXY_RADIUS_UNIT * Math.sqrt(galaxy.members + 6) * sizeFactor;
  const clusters = galaxy.clusters.length;
  const arms = shape !== "spiral" ? 0 : clusters <= 8 ? 2 : clusters <= 24 ? 3 : 4;
  const pitch = ((26 - 12 * clamp01(galaxy.cohesion / ELLIPTICAL_COHESION)) * Math.PI) / 180;
  return {
    shape,
    arms,
    pitch,
    radius,
    tilt: 0.6 + 0.4 * hash01(galaxy.id, "tilt"),
    angle: hash01(galaxy.id, "position-angle") * Math.PI * 2,
    spin: hash01(galaxy.id, "spin") < 0.5 ? 1 : -1,
    axisRatio: shape === "elliptical" ? 0.62 + 0.3 * hash01(galaxy.id, "axis") : 1,
  };
}
