/**
 * C1 B3 — auto-arrange restores canonical layout. The `relayoutToken` effect
 * (`use-topology-loop.ts`) used to only re-target the CAMERA — node positions
 * mutated by a prior drag/force-sim tick stayed put. This module springs each
 * node's live position back to its own `homeX`/`homeY` (`topology-world.ts`,
 * the deterministic layout coordinate cached at build time) over a short
 * critically-damped transition, reusing `engine/spring.ts#stepSpring` — the
 * same primitive the camera already uses — so the motion language is
 * consistent rather than a bespoke lerp.
 *
 * Pure — no DOM/rAF/world knowledge. The caller (`use-topology-loop.ts`) owns
 * a `Map<nodeId, HomeSpringState>` seeded at relayout-trigger time, steps it
 * every frame, writes `state.x.value`/`state.y.value` back into the world
 * node, and stops once `isHomeSpringConverged` is true for every node (or a
 * frame budget elapses).
 */

import { stepSpring, type SpringAxisState } from "../engine/spring";

export interface HomeSpringState {
  x: SpringAxisState;
  y: SpringAxisState;
}

/** Seeds a spring at the node's CURRENT (possibly drag/sim-displaced) position, zero velocity. */
export function initHomeSpring(currentX: number, currentY: number): HomeSpringState {
  return { x: { value: currentX, velocity: 0 }, y: { value: currentY, velocity: 0 } };
}

/** Advances both axes one frame toward `(homeX, homeY)`. */
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

/** True once both axes are within `epsilon` world units of home — the caller can stop stepping (and drop the map entry) at that point. */
export function isHomeSpringConverged(state: HomeSpringState, homeX: number, homeY: number, epsilon: number): boolean {
  return Math.abs(state.x.value - homeX) < epsilon && Math.abs(state.y.value - homeY) < epsilon;
}
