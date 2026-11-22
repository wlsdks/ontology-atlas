/**
 * The per-node offset a drag leaves behind and how it comes home, in world units on top of the
 * node's natural position: `stepLagOffset` while dragging, `stepHomeOffset` after release,
 * `seedDropOffset` once for the dragged node. Pure functions over plain data.
 */

import { stepTugAxis } from "../interaction/drag-tug";
import {
  clampDropVelocity,
  massForDegree,
  releaseSpringForMass,
  springAtRest,
  stepDampedSpring,
  type MassTokens,
  type SpringResponse,
} from "./mass-spring";

export interface SpringOffset {
  x: number;
  y: number;
  /** World units per second. */
  vx: number;
  vy: number;
}

export const REST_OFFSET: Readonly<SpringOffset> = Object.freeze({ x: 0, y: 0, vx: 0, vy: 0 });

export function springForDegree(degree: number, tokens: MassTokens): SpringResponse {
  return releaseSpringForMass(massForDegree(degree, tokens.heavyDegree), tokens);
}

/** Live drag: ease toward the target on the exponential, recording velocity by finite difference so a release starts continuous. */
export function stepLagOffset(
  previous: Readonly<SpringOffset>,
  targetX: number,
  targetY: number,
  dt: number,
  tau: number,
): SpringOffset {
  const x = stepTugAxis(previous.x, targetX, dt, tau);
  const y = stepTugAxis(previous.y, targetY, dt, tau);
  return { x, y, vx: dt > 0 ? (x - previous.x) / dt : 0, vy: dt > 0 ? (y - previous.y) / dt : 0 };
}

export function stepHomeOffset(previous: Readonly<SpringOffset>, dt: number, spring: SpringResponse): SpringOffset {
  const sx = stepDampedSpring(previous.x, previous.vx, 0, dt, spring);
  const sy = stepDampedSpring(previous.y, previous.vy, 0, dt, spring);
  return { x: sx.value, y: sy.value, vx: sx.velocity, vy: sy.velocity };
}

/** An offset that is 1:1 with its target and carries no velocity (reduced motion). */
export function snapOffset(targetX: number, targetY: number): SpringOffset {
  return { x: targetX, y: targetY, vx: 0, vy: 0 };
}

/** The drop: zero offset, the hand's velocity, capped so the excursion stays under `maxPx`. */
export function seedDropOffset(vx: number, vy: number, spring: SpringResponse, maxPx: number): SpringOffset {
  const v = clampDropVelocity(vx, vy, spring, maxPx);
  return { x: 0, y: 0, vx: v.vx, vy: v.vy };
}

export function isOffsetAtRest(offset: Readonly<SpringOffset>): boolean {
  return springAtRest(offset.x, offset.vx, 0) && springAtRest(offset.y, offset.vy, 0);
}

/**
 * Ids holding an offset that nothing steps any more (a second grab replaced the drag group).
 * They are springs mid-flight: the loop steps them home, since dropping snaps up to 21 px.
 */
export function orphanedOffsetIds(
  offsets: ReadonlyMap<string, Readonly<SpringOffset>>,
  stepped: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const id of offsets.keys()) if (!stepped.has(id)) out.push(id);
  return out;
}

export function smoothVelocity(
  previous: Readonly<{ x: number; y: number }>,
  dx: number,
  dy: number,
  dt: number,
  weight = 0.5,
): { x: number; y: number } {
  if (!(dt > 0)) return { x: previous.x, y: previous.y };
  return { x: previous.x * (1 - weight) + (dx / dt) * weight, y: previous.y * (1 - weight) + (dy / dt) * weight };
}
