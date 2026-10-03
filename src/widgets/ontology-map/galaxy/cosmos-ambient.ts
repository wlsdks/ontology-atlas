import { ambientSleepFactor, createAmbientClock, stepAmbientClock, type AmbientClock } from "../model/ambient-sleep";
import type { CosmosLayout } from "./layout/cosmos-layout";
import { hash01 } from "./layout/cosmos-morphology";
import type { GalaxyPose } from "./cosmos-types";

const HAZE_DELAY_MS = 10_000;
const HAZE_RAMP_MS = 2_000;
const WISP_TURN_MS = 18_000;
const WISP_BREATH_MS = 8_400;

interface HazeState {
  tau: number;
  factor: number;
  reducedMotion: boolean;
  origin: number;
  clock: AmbientClock;
}

export function createHazeState(): HazeState {
  return { tau: 0, factor: 0, reducedMotion: false, origin: Number.NaN, clock: createAmbientClock() };
}

export function hazeWindowStart(lastInput: number, arrivalEnd: number): number {
  return Math.max(lastInput, arrivalEnd);
}

export function hazeFactor(now: number, windowStart: number): number {
  return ambientSleepFactor(now, windowStart, HAZE_DELAY_MS, HAZE_RAMP_MS);
}

export function stepHaze(
  state: HazeState,
  input: { now: number; dt: number; windowStart: number; reducedMotion: boolean; visible: boolean },
): boolean {
  state.reducedMotion = input.reducedMotion;
  const factor = !input.reducedMotion && input.visible ? hazeFactor(input.now, input.windowStart) : 0;
  if (Number.isNaN(state.origin)) state.origin = input.now;
  const dt = state.clock.lastFactor > 0 ? input.dt : 0;
  const lost = stepAmbientClock(state.clock, state.origin, input.now, dt, factor);
  state.tau = input.now - state.origin - lost;
  state.factor = factor;
  return factor > 0;
}

export function applyHaze(layout: CosmosLayout, state: HazeState, poses: GalaxyPose[], reducedMotion = false): void {
  const haze = !reducedMotion && !state.reducedMotion;
  layout.galaxies.forEach((g, i) => {
    const pose = poses[i]!;
    const phase = hash01(g.id, "ambient-phase") * Math.PI * 2;
    pose.theta = 0;
    pose.wispTheta = haze ? g.spin * 0.12 * Math.sin((state.tau / WISP_TURN_MS) * Math.PI * 2 + phase) : 0;
    pose.wispLight = haze ? 0.94 + 0.06 * Math.sin((state.tau / WISP_BREATH_MS) * Math.PI * 2 + phase) : 1;
  });
}
