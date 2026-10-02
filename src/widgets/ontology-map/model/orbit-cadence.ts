export const ORBIT_SPREAD_MAX_FRAMES = 4;

export interface OrbitCadence {
  yawTarget: number;
  pitchTarget: number;
  gapFrames: number;
  framesSinceInput: number;
}

export function startOrbitCadence(yawTarget: number, pitchTarget: number): OrbitCadence {
  return { yawTarget, pitchTarget, gapFrames: 1, framesSinceInput: ORBIT_SPREAD_MAX_FRAMES };
}

function stepOrbitCadence(cadence: OrbitCadence, yawTarget: number, pitchTarget: number): number {
  if (yawTarget !== cadence.yawTarget || pitchTarget !== cadence.pitchTarget) {
    const gap = cadence.framesSinceInput + 1;
    cadence.gapFrames = gap <= ORBIT_SPREAD_MAX_FRAMES ? gap : 1;
    cadence.framesSinceInput = 0;
    cadence.yawTarget = yawTarget;
    cadence.pitchTarget = pitchTarget;
  } else {
    cadence.framesSinceInput += 1;
  }
  return 1 / Math.max(1, cadence.gapFrames - cadence.framesSinceInput);
}

interface OrbitPose {
  yaw: number;
  pitch: number;
  yawTarget: number;
  pitchTarget: number;
}

export function followOrbitTarget(pose: OrbitPose, cadence: OrbitCadence, reducedMotion: boolean): void {
  const share = reducedMotion ? 1 : stepOrbitCadence(cadence, pose.yawTarget, pose.pitchTarget);
  pose.yaw += (pose.yawTarget - pose.yaw) * share;
  pose.pitch += (pose.pitchTarget - pose.pitch) * share;
}
