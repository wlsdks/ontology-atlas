import { easeOutCubic, TIER_ASSEMBLE_TOTAL_MS, TIER_RISE_MS } from "../morph/tier-assembly";
import type { CosmosLayout } from "./layout/cosmos-layout";
import type { CosmosArrivalMode, GalaxyPose } from "./cosmos-types";

export const ARRIVAL_MS = TIER_ASSEMBLE_TOTAL_MS;

const DELAY_BASE_MS = 180;
const DELAY_SPREAD_MS = 420;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const arrivedKeys = new Set<string>();

export function hasArrived(key: string): boolean {
  return arrivedKeys.has(key);
}

export function markArrived(key: string): void {
  arrivedKeys.add(key);
}

export function chooseArrival(input: {
  firstOpen: boolean;
  arrivedByMorph: boolean;
  hasRecord: boolean;
  relayout: boolean;
  reducedMotion: boolean;
}): CosmosArrivalMode {
  if (input.reducedMotion) return "none";
  if (input.relayout) return "replay";
  if (input.arrivedByMorph) return "none";
  if (!input.firstOpen) return "none";
  return input.hasRecord ? "condense" : "replay";
}

export function applyArrival(layout: CosmosLayout, clockMs: number, mode: CosmosArrivalMode, poses: GalaxyPose[]): boolean {
  const keyframes = layout.settle.keyframes;
  const effective: CosmosArrivalMode = keyframes.length === 0 ? "none" : mode === "replay" && keyframes.length === 1 ? "condense" : mode;
  const clock = Math.max(0, clockMs);
  const active = effective !== "none" && clock < ARRIVAL_MS;
  let frameA = 0;
  let frameB = 0;
  let frameMix = 0;
  if (active && effective === "replay") {
    const f = (clock / ARRIVAL_MS) * (keyframes.length - 1);
    frameA = Math.min(keyframes.length - 1, Math.floor(f));
    frameB = Math.min(keyframes.length - 1, frameA + 1);
    frameMix = f - frameA;
  }
  const reach = Math.max(1, layout.settle.targetRadius);
  layout.galaxies.forEach((g, i) => {
    const pose = poses[i]!;
    if (!active) {
      pose.x = g.x;
      pose.y = g.y;
      pose.presence = 1;
      pose.condense = 1;
      return;
    }
    if (effective === "replay") {
      const a = keyframes[frameA]!;
      const b = keyframes[frameB]!;
      pose.x = a[i * 2]! + (b[i * 2]! - a[i * 2]!) * frameMix;
      pose.y = a[i * 2 + 1]! + (b[i * 2 + 1]! - a[i * 2 + 1]!) * frameMix;
    } else {
      pose.x = g.x;
      pose.y = g.y;
    }
    const local = clamp01((clock - galaxyArrivalDelay(g, reach)) / TIER_RISE_MS);
    pose.presence = easeOutCubic(Math.min(1, 1.6 * local));
    pose.condense = 0.25 + 0.75 * easeOutCubic(local);
  });
  return active;
}

function galaxyArrivalDelay(centre: { x: number; y: number }, reach: number): number {
  return DELAY_BASE_MS + DELAY_SPREAD_MS * Math.min(1, Math.hypot(centre.x, centre.y) / Math.max(1, reach));
}
