/**
 * Auto-arrange springs each node back to its `homeX`/`homeY` (`topology-world.ts`, the
 * layout coordinate cached at build time) with the camera's `engine/spring.ts` primitive.
 * The caller (`use-topology-loop.ts`) owns the per-node state and stops once all converge.
 */

import { stepSpring, type SpringAxisState } from "../engine/spring";

export interface HomeSpringState {
  x: SpringAxisState;
  y: SpringAxisState;
}

/** Seeded at the current, possibly displaced, position with zero velocity. */
export function initHomeSpring(currentX: number, currentY: number): HomeSpringState {
  return { x: { value: currentX, velocity: 0 }, y: { value: currentY, velocity: 0 } };
}

export function stepHomeSpring(
  state: HomeSpringState,
  homeX: number,
  homeY: number,
  dt: number,
  angularFrequency: number,
  damping: number,
): HomeSpringState {
  return {
    x: stepSpring(state.x, homeX, dt, angularFrequency, damping),
    y: stepSpring(state.y, homeY, dt, angularFrequency, damping),
  };
}

/** The caller can drop the entry once both axes are within `epsilon`. */
export function isHomeSpringConverged(state: HomeSpringState, homeX: number, homeY: number, epsilon: number): boolean {
  return Math.abs(state.x.value - homeX) < epsilon && Math.abs(state.y.value - homeY) < epsilon;
}
