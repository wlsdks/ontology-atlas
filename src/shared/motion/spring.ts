export interface Spring {
  stiffness: number;
  dampingRatio: number;
}

const HOUSE_DAMPING_RATIO = 0.85;

export const SPRING = {
  control: { stiffness: 800, dampingRatio: HOUSE_DAMPING_RATIO },
  surface: { stiffness: 300, dampingRatio: HOUSE_DAMPING_RATIO },
  canvas: { stiffness: 140, dampingRatio: HOUSE_DAMPING_RATIO },
} as const satisfies Record<string, Spring>;

const EASING_STOPS = 33;
const VISUAL_BAND = 0.02;
const SETTLE_BAND = 0.005;

export function springState(
  spring: Spring,
  tSec: number,
  start: { x0: number; v0: number } = { x0: 0, v0: 0 },
  mass = 1,
): { x: number; v: number } {
  const omega = Math.sqrt(spring.stiffness / mass);
  const zeta = spring.dampingRatio;
  const e0 = start.x0 - 1;
  const decay = Math.exp(-zeta * omega * tSec);
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const b = (start.v0 + zeta * omega * e0) / wd;
    const cos = Math.cos(wd * tSec);
    const sin = Math.sin(wd * tSec);
    const e = decay * (e0 * cos + b * sin);
    const v = decay * ((b * wd - zeta * omega * e0) * cos - (e0 * wd + zeta * omega * b) * sin);
    return { x: 1 + e, v };
  }
  const b = start.v0 + omega * e0;
  return { x: 1 + decay * (e0 + b * tSec), v: decay * (b - omega * (e0 + b * tSec)) };
}

function timeWithin(spring: Spring, band: number, mass: number): number {
  const horizon = 20 / (spring.dampingRatio * Math.sqrt(spring.stiffness / mass));
  for (let tenth = Math.ceil(horizon * 10_000); tenth >= 0; tenth -= 1) {
    if (Math.abs(springState(spring, tenth / 10_000, undefined, mass).x - 1) > band) return Math.ceil(tenth / 10);
  }
  return 0;
}

export function springVisualMs(spring: Spring, mass = 1): number {
  return timeWithin(spring, VISUAL_BAND, mass);
}

export function springSettleMs(spring: Spring, mass = 1): number {
  return timeWithin(spring, SETTLE_BAND, mass);
}

export function springEasing(spring: Spring): string {
  const durationSec = springSettleMs(spring) / 1000;
  const stops = Array.from({ length: EASING_STOPS }, (_, i) => {
    if (i === EASING_STOPS - 1) return "1";
    const x = springState(spring, (durationSec * i) / (EASING_STOPS - 1)).x;
    return String(Math.round(x * 100_000) / 100_000);
  });
  return `linear(${stops.join(", ")})`;
}
