/**
 * One frame's physics — camera spring, altitude, hover-ripple emphasis, and
 * ambient comet-tail progress (prototype `frame()` §14: `updateCamera` ->
 * `updateAltitude` -> `updateEmphasis` -> `updateParticles`). Split out of
 * `use-topology-loop.ts`'s rAF callback to keep that file under budget.
 * Mutates `input.world.edges[].t` and `input.emphasisById` in place — this is
 * the one place per-frame mutation is expected, matching the engine's own
 * "live state, stepped every frame" contract (`engine/camera.ts`).
 */

import { computePanBounds, stepCamera, type CameraAxes, type CameraTarget } from "../engine/camera";
import { computeAltitudeBand, computeFarT } from "../model/altitude";
import { stepEmphasis } from "../model/focus-state";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import type { TopologyWorld } from "./topology-world";

export interface PhysicsStepInput {
  world: TopologyWorld;
  camera: CameraAxes;
  target: CameraTarget;
  damping: number;
  overviewScale: number;
  tokens: TopologyV2Tokens;
  dt: number;
  now: number;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  /** True while the pointer is actively dragging — suppresses the elastic pan-bounds clamp (see `engine/camera.ts`). */
  isDragging: boolean;
  /** Mutated in place — the hook owns this map's lifetime across frames. */
  emphasisById: Map<string, number>;
  rippleStartById: ReadonlyMap<string, number>;
}

export interface PhysicsStepResult {
  camera: CameraAxes;
  farT: number;
}

export function stepTopologyPhysics(input: PhysicsStepInput): PhysicsStepResult {
  const {
    world,
    camera,
    target,
    damping,
    overviewScale,
    tokens,
    dt,
    now,
    focusedNodeId,
    hoveredNodeId,
    isDragging,
    emphasisById,
    rippleStartById,
  } = input;

  const nextCamera = stepCamera({
    camera,
    target,
    dt,
    damping,
    angularFrequency: tokens.cameraSpringAngFreq,
    scaleMin: tokens.cameraScaleMin,
    scaleMax: tokens.cameraScaleMax,
    panBounds: computePanBounds(world.bounds),
    isDragging,
  });

  const band = computeAltitudeBand(overviewScale, tokens.altitudeFarHighRatio, tokens.altitudeFarLowRatio);
  const farT = computeFarT(nextCamera.scale.value, band.farLow, band.farHigh);

  const activeEgoId = focusedNodeId ? null : hoveredNodeId;
  for (const node of world.nodes) {
    const isInActiveEgoSet = !!activeEgoId && (node.id === activeEgoId || world.neighborMap.get(activeEgoId)?.has(node.id) === true);
    const rippleHasStarted = now >= (rippleStartById.get(node.id) ?? 0);
    const previous = emphasisById.get(node.id) ?? 0;
    emphasisById.set(
      node.id,
      stepEmphasis(previous, isInActiveEgoSet, rippleHasStarted, dt, tokens.emphasisRiseTau, tokens.emphasisDecayTau),
    );
  }

  for (const edge of world.edges) {
    if (edge.kind === "depends") edge.t = (edge.t + dt * 0.075) % 1;
  }

  return { camera: nextCamera, farT };
}
