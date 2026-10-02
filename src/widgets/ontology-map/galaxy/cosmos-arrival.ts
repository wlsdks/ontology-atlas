import type { CosmosLayout } from "./layout/cosmos-layout";
import type { CosmosArrivalMode, GalaxyPose } from "./cosmos-types";

export const ARRIVAL_MS = 1_700;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

const arrivedKeys = new Set<string>();

export function hasArrived(key: string): boolean {
  return arrivedKeys.has(key);
}

export function markArrived(key: string): void {
  arrivedKeys.add(key);
}

export function chooseArrival(input: { firstOpen: boolean; reducedMotion: boolean; keyframes: number }): CosmosArrivalMode {
  return input.firstOpen && !input.reducedMotion && input.keyframes > 1 ? "replay" : "none";
}

export function applyArrival(layout: CosmosLayout, clockMs: number, mode: CosmosArrivalMode, poses: GalaxyPose[]): boolean {
  const arrivalT = mode === "replay" ? Math.min(1, Math.max(0, clockMs / ARRIVAL_MS)) : 1;
  const keyframes = layout.settle.keyframes;
  let frameA = 0;
  let frameB = 0;
  let frameMix = 0;
  if (arrivalT < 1) {
    const f = arrivalT * (keyframes.length - 1);
    frameA = Math.floor(f);
    frameB = Math.min(keyframes.length - 1, frameA + 1);
    frameMix = f - frameA;
  }
  const reach = Math.max(1, layout.settle.targetRadius);
  layout.galaxies.forEach((g, i) => {
    const pose = poses[i]!;
    if (arrivalT < 1) {
      const a = keyframes[frameA]!;
      const b = keyframes[frameB]!;
      pose.x = a[i * 2]! + (b[i * 2]! - a[i * 2]!) * frameMix;
      pose.y = a[i * 2 + 1]! + (b[i * 2 + 1]! - a[i * 2 + 1]!) * frameMix;
      const delay = 0.4 * Math.min(1, Math.hypot(g.x, g.y) / reach);
      const local = Math.min(1, Math.max(0, (arrivalT - delay) / 0.55));
      pose.presence = easeOut(Math.min(1, local * 1.6));
      pose.condense = 0.25 + 0.75 * easeOut(local);
    } else {
      pose.x = g.x;
      pose.y = g.y;
      pose.presence = 1;
      pose.condense = 1;
    }
  });
  return arrivalT < 1;
}
