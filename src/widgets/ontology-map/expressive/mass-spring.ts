/**
 * Second-order motion: a node's mass is its degree on a smoothstep; heavy nodes get underdamped
 * release springs, light ones critical. Mass rides damping ratio alone; omega is 16 for every node,
 * the integrator's stability bound (`spring-stability.contract.test.ts`). Pure functions only.
 */

export interface SpringResponse {
  /** Natural angular frequency ω (rad/s). */
  omega: number;
  /** Damping ratio ζ: 1 is critical (no overshoot), below 1 overshoots. */
  zeta: number;
}

export interface MassTokens {
  /** Degree at which a node is fully heavy (`--map-mass-heavy-degree`). */
  heavyDegree: number;
  /** ω for every release spring (`--map-mass-angfreq`): 16 is the integrator's stability bound at the 50 ms frame clamp, so mass lives in ζ alone. */
  angFreq: number;
  /** ζ for a fully heavy node (`--map-mass-heavy-zeta`); light nodes are always critical. */
  heavyZeta: number;
}

/** 0 (a leaf) … 1 (a hub at or past `heavyDegree`), smoothstep so a degree change never pops. */
export function massForDegree(degree: number, heavyDegree: number): number {
  if (!(heavyDegree > 0)) return 0;
  const t = Math.min(1, Math.max(0, degree / heavyDegree));
  return t * t * (3 - 2 * t);
}

/** The release spring for a node of the given mass: light snaps, heavy rings once. */
export function releaseSpringForMass(mass: number, tokens: MassTokens): SpringResponse {
  const m = Math.min(1, Math.max(0, mass));
  return {
    omega: tokens.angFreq,
    zeta: 1 + (tokens.heavyZeta - 1) * m,
  };
}

/**
 * One semi-implicit Euler step of a damped spring toward `target`. Sub-stepped
 * at 240 Hz so a hitchy frame (dt up to 100 ms) cannot blow the integrator up.
 */
export function stepDampedSpring(
  value: number,
  velocity: number,
  target: number,
  dt: number,
  spring: SpringResponse,
): { value: number; velocity: number } {
  let x = value;
  let v = velocity;
  let remaining = Math.min(0.1, Math.max(0, dt));
  const h = 1 / 240;
  while (remaining > 0) {
    const step = Math.min(h, remaining);
    const a = -2 * spring.zeta * spring.omega * v - spring.omega * spring.omega * (x - target);
    v += a * step;
    x += v * step;
    remaining -= step;
  }
  return { value: x, velocity: v };
}

export function springAtRest(value: number, velocity: number, target: number, epsilon = 0.05): boolean {
  return Math.abs(value - target) < epsilon && Math.abs(velocity) < epsilon * 10;
}

/**
 * The unit step response of an underdamped spring at time `t` (s): 0 at t=0,
 * rises past 1, rings, settles to 1. ζ ≥ 1 falls back to the critically damped
 * response (no overshoot). Used for the hover press.
 */
export function pressResponse(t: number, spring: SpringResponse): number {
  if (!(t > 0)) return 0;
  const { omega, zeta } = spring;
  if (zeta >= 1) {
    const e = Math.exp(-omega * t);
    return 1 - e * (1 + omega * t);
  }
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-zeta * omega * t);
  return 1 - e * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
}

/** The peak of `pressResponse` for a ζ < 1 spring: 1 + e^(−ζπ/√(1−ζ²)). */
export function pressPeak(spring: SpringResponse): number {
  if (spring.zeta >= 1) return 1;
  return 1 + Math.exp((-spring.zeta * Math.PI) / Math.sqrt(1 - spring.zeta * spring.zeta));
}

/**
 * Scale a release velocity so the drop's farthest excursion from the drop point
 * stays within `maxPx` (world units). A spring released from rest with velocity v
 * peaks near `0.6·v/ω` for the ζ range used here, so v is capped at `maxPx·ω/0.6`.
 */
export function clampDropVelocity(
  vx: number,
  vy: number,
  spring: SpringResponse,
  maxPx: number,
): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  const cap = (Math.max(0, maxPx) * spring.omega) / 0.6;
  if (speed <= cap || speed === 0) return { vx, vy };
  const k = cap / speed;
  return { vx: vx * k, vy: vy * k };
}
