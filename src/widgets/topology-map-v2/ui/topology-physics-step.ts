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
import { computeZoomRatio } from "../model/tier-visibility";
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
  /** Visual-expression axis — constellation (1) ↔ circuit (0). Drives node/edge/label morph. */
  farT: number;
  /**
   * Semantic-zoom axis — `cameraScale / overviewEntryScale`. `1.0` at the
   * overview entry, `>1` zoomed in, `<1` zoomed out. Drives tier visibility
   * (`model/tier-visibility.ts`), NOT `farT`, so the default circuit entry can
   * still show only the project/domain/hub spine.
   */
  zoomRatio: number;
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

  // Tier visibility rides a SEPARATE zoom-ratio signal (not farT): entry scale
  // is `overviewScale × overviewEntryRatio`, so ratio = 1 at the overview entry.
  const overviewEntryScale = overviewScale * tokens.overviewEntryRatio;
  const zoomRatio = computeZoomRatio(nextCamera.scale.value, overviewEntryScale);

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

  return { camera: nextCamera, farT, zoomRatio };
}
