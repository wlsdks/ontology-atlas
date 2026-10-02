interface DragSample {
  x: number;
  y: number;
  t: number;
}

export interface ReleaseVelocityInput {
  history: readonly DragSample[];
  releaseTime: number;
  windowMs: number;
  minSpeedPxPerMs: number;
}

export interface ReleaseVelocity {
  vx: number;
  vy: number;
  isFlick: boolean;
}

export function sampleReleaseVelocity(input: ReleaseVelocityInput): ReleaseVelocity {
  const { history, releaseTime, windowMs, minSpeedPxPerMs } = input;
  const windowStart = releaseTime - windowMs;
  const inWindow = history.filter((sample) => sample.t >= windowStart);
  if (inWindow.length < 2) return { vx: 0, vy: 0, isFlick: false };

  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const dtMs = Math.max(1, last.t - first.t);
  const vx = (last.x - first.x) / dtMs;
  const vy = (last.y - first.y) / dtMs;

  if (Math.hypot(vx, vy) < minSpeedPxPerMs) return { vx: 0, vy: 0, isFlick: false };
  return { vx, vy, isFlick: true };
}

export interface FlickReleaseInput {
  velocityPxPerMs: number;
  cameraPosition: number;
  cameraScale: number;
  timeConstantMs: number;
}

export interface FlickReleaseResult {
  landingTarget: number;
  worldVelocity: number;
}

export function projectFlickLanding(input: FlickReleaseInput): FlickReleaseResult {
  const { velocityPxPerMs, cameraPosition, cameraScale, timeConstantMs } = input;
  const worldPerMs = -velocityPxPerMs / cameraScale;
  const landingTarget = cameraPosition + worldPerMs * timeConstantMs;
  const worldVelocity = worldPerMs * 1000;
  return {
    landingTarget: landingTarget === 0 ? 0 : landingTarget,
    worldVelocity: worldVelocity === 0 ? 0 : worldVelocity,
  };
}
