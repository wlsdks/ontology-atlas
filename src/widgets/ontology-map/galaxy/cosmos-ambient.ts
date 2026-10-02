import type { CosmosLayout } from "./layout/cosmos-layout";
import { hash01 } from "./layout/cosmos-morphology";
import type { GalaxyPose } from "./cosmos-types";

type CosmosAmbient = "off" | "haze" | "sway";

const ACTIVE_MS = 12_000;
const SWAY_RIM_PX = 6;

interface HazeState {
  mode: CosmosAmbient;
  tau: number;
}

export function createHazeState(mode: CosmosAmbient = "haze"): HazeState {
  return { mode, tau: 0 };
}

export function stepHaze(
  state: HazeState,
  input: { now: number; dt: number; windowStart: number; reducedMotion: boolean; visible: boolean },
): boolean {
  const on = state.mode !== "off" && !input.reducedMotion;
  const active = on && input.now - input.windowStart < ACTIVE_MS && input.visible;
  if (active) state.tau += input.dt;
  return active;
}

export function applyHaze(layout: CosmosLayout, state: HazeState, poses: GalaxyPose[], cameraScale: number, reducedMotion = false): void {
  const sway = state.mode === "sway" && !reducedMotion;
  const haze = state.mode === "haze" && !reducedMotion;
  layout.galaxies.forEach((g, i) => {
    const pose = poses[i]!;
    const rho = g.radius * cameraScale;
    const phase = hash01(g.id, "ambient-phase") * Math.PI * 2;
    const period = 40_000 + 30_000 * hash01(g.id, "ambient-period");
    pose.theta = sway ? g.spin * Math.min(0.1, SWAY_RIM_PX / Math.max(1, rho)) * Math.sin((state.tau / period) * Math.PI * 2 + phase) : 0;
    pose.wispTheta = haze ? g.spin * 0.12 * Math.sin((state.tau / 18_000) * Math.PI * 2 + phase) : 0;
    pose.wispLight = haze ? 0.94 + 0.06 * Math.sin((state.tau / 8_400) * Math.PI * 2 + phase) : 1;
  });
}
