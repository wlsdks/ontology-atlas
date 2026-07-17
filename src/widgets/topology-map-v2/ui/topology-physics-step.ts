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
import { isNodeEmphasisActive, resolveEdgePulseSpeed, stepEmphasis } from "../model/focus-state";
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
  /**
   * The one neighbor the user is hovering in the detail panel's "연결된 노드"
   * list, or null. Under focus (hover suppressed) this node still ramps its
   * emphasis so the panel row and the on-canvas node/edge light up together
   * ("emphasis ripple" linkage, lead spec §4). Null until the panel-hover API
   * feeds it in.
   */
  panelEmphasisNodeId: string | null;
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
    panelEmphasisNodeId,
    isDragging,
    emphasisById,
    rippleStartById,
  } = input;

  // Focus-aware pan clamp (drag-while-focused must not lose the subject): while
  // a node is ego-focused AND the camera is zoomed IN past the overview scale,
  // clamp the pan so the camera centre stays within `cameraFocusPanMargin` world
  // units of the FOCUSED NODE — so an empty-space pan can look around the cluster
  // but the subject can never leave the frame; overshooting rubber-bands back
  // (Obsidian feel). Clamping to the focused node's own point (not the whole ego
  // bbox) is what keeps the subject on screen: a wide ego bbox + margin would let
  // the camera reach the cluster's far corner and slide the focused node off the
  // opposite edge. The zoom gate is essential: "지도 전체 맞추기"/fit-view keeps the
  // node selected (focusedNodeId stays set) while springing OUT to the overview;
  // once the camera scale drops below the overview fit scale the clamp reverts to
  // the full world bounds, so fit-view/close-focus recovery is never fought.
  const focusNode = focusedNodeId !== null && camera.scale.value > overviewScale
    ? world.nodeById.get(focusedNodeId)
    : undefined;
  const panBounds = focusNode
    ? computePanBounds(
        { minX: focusNode.x, minY: focusNode.y, maxX: focusNode.x, maxY: focusNode.y },
        tokens.cameraFocusPanMargin,
      )
    : computePanBounds(world.bounds);

  const nextCamera = stepCamera({
    camera,
    target,
    dt,
    damping,
    angularFrequency: tokens.cameraSpringAngFreq,
    scaleMin: tokens.cameraScaleMin,
    scaleMax: tokens.cameraScaleMax,
    panBounds,
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
    const isHoverEgoMember =
      !!activeEgoId && (node.id === activeEgoId || world.neighborMap.get(activeEgoId)?.has(node.id) === true);
    const isInActiveEgoSet = isNodeEmphasisActive(node.id, focusedNodeId, isHoverEgoMember, panelEmphasisNodeId);
    const rippleHasStarted = now >= (rippleStartById.get(node.id) ?? 0);
    const previous = emphasisById.get(node.id) ?? 0;
    emphasisById.set(
      node.id,
      stepEmphasis(previous, isInActiveEgoSet, rippleHasStarted, dt, tokens.emphasisRiseTau, tokens.emphasisDecayTau),
    );
  }

  // Powered subgraph carries more current: an edge incident to the focused node
  // advances its comet-tail at the accelerated ego speed, everything else at the
  // ambient base speed (`resolveEdgePulseSpeed`, lead spec §2).
  for (const edge of world.edges) {
    if (edge.kind !== "depends") continue;
    const touchesFocused =
      focusedNodeId !== null && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId);
    const speed = resolveEdgePulseSpeed(touchesFocused, focusedNodeId, tokens.edgePulseSpeed, tokens.edgePulseSpeedEgo);
    edge.t = (edge.t + dt * speed) % 1;
  }

  return { camera: nextCamera, farT, zoomRatio };
}
