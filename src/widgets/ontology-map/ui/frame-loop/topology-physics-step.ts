/**
 * One frame's physics: camera spring, altitude, hover-ripple emphasis and ambient comet-tail progress (`updateCamera` ->
 * `updateAltitude` -> `updateEmphasis` -> `updateParticles`), split out of the rAF callback. It mutates `input.world.edges[].t`
 * and `input.emphasisById` in place, the one place per-frame mutation is expected (`engine/camera.ts`'s "live state, stepped every frame").
 */

import { clampPointToPanBounds, stepCamera, type CameraAxes, type CameraTarget, type PanBounds } from "../../engine/camera";
import { computeAltitudeBand, computeFarT } from "../../model/visibility/altitude";
import { isNodeEmphasisActive, resolveEdgePulseSpeed, stepEmphasis, stepFocusRamp } from "../../model/visibility/focus-state";
import { settleTierAssembly, tierAssemblyAppear } from "../../morph/tier-assembly";
import { selectEgoContainsComets, updateParticles, type ParticleEdge } from "../../render/edge-fireflies";
import { computeZoomRatio, DEFAULT_TIER_REVEAL, isSpineOnlyZoom, type TierRevealConfig } from "../../model/visibility/tier-visibility";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeUnfocusedPanBounds, focusPanBounds, type FocusLeashPx } from "../camera/target/pan-leash";
import { computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin, drawsFlatGraph } from "../camera/target/zoom-range";
import type { TopologyWorld } from "../world/topology-world";

export interface PhysicsStepInput {
  world: TopologyWorld;
  camera: CameraAxes;
  target: CameraTarget;
  damping: number;
  overviewScale: number;
  tokens: OntologyMapTokens;
  /**
   * Selects the interactive or transition spring token for this frame's camera step; passed in so
   * this function stays pure.
   */
  cameraAngularFrequency: number;
  dt: number;
  rampDt?: number;
  now: number;
  focusedNodeId: string | null;
  /**
   * True while an edge-pair focus is live (`selectedEdge !== null`) with no node focus: the click-focus dim ramp treats it
   * as "the scene is focused" too, so a line's selection ramps normal↔dim instead of snapping. Only the ramp gate uses it;
   * the ego/pair classification stays in the draw pass.
   */
  pairFocusActive: boolean;
  hoveredNodeId: string | null;
  /**
   * The one neighbour hovered in the detail panel's "Connected Nodes" list, or null. Under focus (hover suppressed) it still
   * ramps its emphasis, so the panel row and the on-canvas node and edge light up together.
   */
  panelEmphasisNodeId: string | null;
  /** True while the pointer is actively dragging — suppresses the elastic pan-bounds clamp (see `engine/camera.ts`). */
  isDragging: boolean;
  /**
   * World bbox of the nodes actually drawn. The dome has its own projection, so anchoring the pan leash
   * to 2D `world.bounds` drags the camera off. Null/omitted uses the 2D bounds.
   */
  worldBoundsOverride?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /**
   * 3D dome view — where the focused node is **drawn** (world). The focus pan leash
   * binds the camera to the node's 2D coordinates (`node.x/y`), but in the dome that
   * node is drawn a frame offset away, so the leash ends up guarding empty space.
   * null/omitted: the leash uses `node.x/y`.
   */
  focusAnchorOverride?: { x: number; y: number } | null;
  /**
   * The focus leash in screen pixels (`focusLeashPx`), converted with the live
   * scale each frame so a zoom-in tightens it. Null keeps the token alone.
   */
  focusLeashPx?: FocusLeashPx | null;
  /**
   * Overrides the camera minimum zoom (`DomeRuntime.fitScale`): the dome fit can sit below the 2D
   * minimum, which would make the fit target unreachable.
   */
  scaleMinOverride?: number | null;
  /**
   * `prefers-reduced-motion: reduce`. Springs and ramps snap straight to
   * their targets: the user gets every end state (focus dive lands, ripple
   * emphasis applies, ego children appear) without the interpolated journey.
   */
  reducedMotion: boolean;
  /**
   * Ambient sleep factor in [0,1] multiplied into comet phase speed. The ramp keeps particles from
   * stopping dead mid-orbit. Omitted means 1 (awake).
   */
  ambientFactor?: number;
  /**
   * WCAG 2.2 2.3.3: the reduced-motion snap covers only app-initiated camera moves; hand-driven
   * gestures keep their spring. Set by pointer handlers, cleared by programmatic camera setters.
   */
  userDrivenCamera?: boolean;
  /**
   * True while a camera tween or a zoom step (`model/camera/camera-easing.ts`) drives
   * the camera: the spring step and pan-bounds clamp are skipped and `camera`
   * is used verbatim. Under reduced motion only a hand-driven camera
   * (`userDrivenCamera`) stays frozen; app-initiated travel still arrives.
   */
  freezeCamera?: boolean;
  altitudeScale?: number | null;
  /**
   * Nodes the density gate collapsed and therefore does not draw (a subtree replaced by one chip): the four ramps (emphasis,
   * ego-reveal, focus-dim, entry) are not run for them. Measured on synth=3000: 2,820 of 3,000 were collapsed, about 24,000 map
   * operations per frame. Skipping deletes the entry rather than leave it, or a node expanded while focused snaps to dim:
   * every consumer defaults a missing entry (`?? 0` or `?? 1`) to ramping in from scratch. Omitted: every node is in scope.
   */
  clusteredIds?: ReadonlySet<string> | null;
  /** Mutated in place — the hook owns this map's lifetime across frames. */
  emphasisById: Map<string, number>;
  rippleStartById: ReadonlyMap<string, number>;
  /**
   * Mutated in place, like `emphasisById`. Ramps toward 1 for the focused node and its 1-hop neighbours while a focus is
   * active (so semantic-zoom-gated tiers fade in under focus), toward 0 otherwise. Separate from `emphasisById`, whose active
   * condition under focus is only the panel-hover row, not the whole ego set.
   */
  egoRevealById: Map<string, number>;
  /**
   * Click-focus signature, mutated in place like `emphasisById`: each node's 0..1 scalar ramps toward 1 while ANY focus is
   * live (node or edge pair) and toward 0 otherwise, on `--map-focus-dim-tau`. `node-visual.ts` lerps normal→dim/ego colour and
   * the centre radius by it. Per node, so a node appearing mid-focus (an expanded child) ramps into dim from 0.
   */
  focusRampById: Map<string, number>;
  /**
   * New-node appear ramp, mutated in place like `emphasisById`: seeded to 0 for nodes that first appear on a world rebuild
   * (existing stay 1) and stepped toward 1 on `egoRevealRiseTau`; `paint-nodes.ts` multiplies radius (0.6→1) and alpha (0→1)
   * by it so a new node swells in. Reduced motion snaps to 1; a missing entry is 1.
   */
  appearById: Map<string, number>;
  /**
   * The tier gate config. Omitted defaults to
   * `DEFAULT_TIER_REVEAL`. The pan clamp's spine-only decision has to see the same
   * config as the draw and the hit test.
   */
  tierReveal?: TierRevealConfig;
}

export interface PhysicsStepResult {
  camera: CameraAxes;
  /** Visual-expression axis — constellation (1) ↔ circuit (0). Drives node/edge/label morph. */
  farT: number;
  /**
   * Semantic-zoom axis — `cameraScale / overviewEntryScale`. `1.0` at the
   * overview entry, `>1` zoomed in, `<1` zoomed out. Drives tier visibility
   * (`model/visibility/tier-visibility.ts`), NOT `farT`, so the default circuit entry can
   * still show only the project/domain/hub spine.
   */
  zoomRatio: number;
}

function clampTargetToPanBounds(target: CameraTarget, panBounds: PanBounds): { tx: number; ty: number } {
  const held = clampPointToPanBounds(target.tx, target.ty, panBounds);
  return { tx: held.x, ty: held.y };
}

export function stepTopologyPhysics(input: PhysicsStepInput): PhysicsStepResult {
  const {
    world,
    camera,
    target,
    damping,
    overviewScale,
    tokens,
    cameraAngularFrequency,
    dt,
    rampDt = dt,
    now,
    focusedNodeId,
    pairFocusActive,
    hoveredNodeId,
    panelEmphasisNodeId,
    isDragging,
    worldBoundsOverride = null,
    focusAnchorOverride = null,
    altitudeScale = null,
    focusLeashPx = null,
    scaleMinOverride = null,
    reducedMotion,
    ambientFactor,
    userDrivenCamera = false,
    freezeCamera,
    clusteredIds = null,
    emphasisById,
    rippleStartById,
    egoRevealById,
    focusRampById,
    appearById,
    tierReveal = DEFAULT_TIER_REVEAL,
  } = input;

  // Tier visibility rides a SEPARATE zoom-ratio signal (not farT): entry scale
  // is `overviewScale × overviewEntryRatio`, so ratio = 1 at the overview
  // entry. Computed up-front (not just after the camera step) because the
  // camera's own effective zoom-in ceiling is now DERIVED from this
  // same entry scale.
  const overviewEntryScale = overviewScale * tokens.overviewEntryRatio;

  // Focus-aware pan clamp: while a node is ego-focused AND the camera is zoomed in past the overview scale, the pan is clamped
  // so the camera centre stays within `cameraFocusPanMargin` world units of the FOCUSED NODE (not the ego bbox, whose far corner
  // would slide the node off the opposite edge); overshooting rubber-bands back. The zoom gate keeps fit-view, which springs out
  // with the node still selected, from being fought: below the overview fit scale the clamp reverts to the world bounds.
  const focusNode = focusedNodeId !== null && camera.scale.value > overviewScale
    ? world.nodeById.get(focusedNodeId)
    : undefined;
  // Unfocused clamp uses the visible tier's bounds: at spine-only zoom the full-graph bounds include
  // empty de-pileup space and would strand the camera. Uses the pre-step scale.
  const preStepZoomRatio = computeZoomRatio(camera.scale.value, overviewScale * tokens.overviewEntryRatio);
  // 3D dome — the leash anchor follows where the node is «drawn» (see the two
  // overrides' JSDoc above). The dome always draws every tier, so the override
  // replaces the spine-only special case too.
  const focusAnchor = focusNode ? (focusAnchorOverride ?? { x: focusNode.x, y: focusNode.y }) : null;
  const panBounds = focusAnchor
    ? focusPanBounds(focusAnchor, focusLeashPx, camera.scale.value, tokens.cameraFocusPanMargin)
    : computeUnfocusedPanBounds(
        worldBoundsOverride ?? (isSpineOnlyZoom(preStepZoomRatio, tierReveal) ? world.spineBounds : world.bounds),
        camera.scale.value,
        tokens,
      );

  // The camera's real zoom-in ceiling is now ratio-based (viewport-
  // relative), not the absolute `cameraScaleMax` token — see
  // `target/zoom-range.ts#computeEffectiveCameraScaleMax`'s JSDoc for the
  // audit finding this fixes (capability/element tiers were unreachable).
  const effectiveScaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax, world.dialScaleMax ?? undefined);
  const effectiveScaleMin = Math.min(
    computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin, drawsFlatGraph(world)),
    // 3D dome — if the dome's fit zoom sits below the 2D minimum, drop that far (`DomeRuntime.fitScale`).
    scaleMinOverride ?? Infinity,
  );
  // The spring aims inside the same box the elastic clamp holds; aimed past it, the two would hold
  // the camera still-moving at a stalemate outside the box for as long as the target stood there.
  const tscale = Math.min(effectiveScaleMax, Math.max(effectiveScaleMin, target.tscale));
  const heldTarget = isDragging ? { ...target, tscale } : { ...target, ...clampTargetToPanBounds(target, panBounds), tscale };
  const nextCamera: CameraAxes = freezeCamera
    ? { x: { ...camera.x }, y: { ...camera.y }, scale: { ...camera.scale } }
    : stepCamera({
        camera,
        target: heldTarget,
        dt,
        damping,
        angularFrequency: cameraAngularFrequency,
        scaleMin: effectiveScaleMin,
        scaleMax: effectiveScaleMax,
        panBounds,
        isDragging,
      });
  if (reducedMotion && !userDrivenCamera) {
    nextCamera.x.value = target.tx;
    nextCamera.y.value = target.ty;
    nextCamera.scale.value = Math.min(effectiveScaleMax, Math.max(effectiveScaleMin, target.tscale));
    nextCamera.x.velocity = 0;
    nextCamera.y.velocity = 0;
    nextCamera.scale.velocity = 0;
  }

  const band = computeAltitudeBand(overviewScale, tokens.altitudeFarHighRatio, tokens.altitudeFarLowRatio);
  const farT = computeFarT(altitudeScale ?? nextCamera.scale.value, band.farLow, band.farHigh);

  const zoomRatio = computeZoomRatio(nextCamera.scale.value, overviewEntryScale);

  const activeEgoId = focusedNodeId ? null : hoveredNodeId;
  const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) : undefined;
  // The scene is focused if a node or an edge pair is selected; one gate drives both color ramps.
  const focusActive = focusedNodeId !== null || pairFocusActive;
  if (focusActive || isDragging) settleTierAssembly(world);
  for (const node of world.nodes) {
    if (clusteredIds?.has(node.id)) {
      // Collapsed, so not on screen — the ramp is not run and **the leftover value is
      // deleted too**. Left behind, it revives as a past state and snaps when this node
      // is expanded out of the chip.
      emphasisById.delete(node.id);
      egoRevealById.delete(node.id);
      focusRampById.delete(node.id);
      appearById.delete(node.id);
      continue;
    }
    const isHoverEgoMember =
      !!activeEgoId && (node.id === activeEgoId || world.neighborMap.get(activeEgoId)?.has(node.id) === true);
    const isInActiveEgoSet = isNodeEmphasisActive(node.id, focusedNodeId, isHoverEgoMember, panelEmphasisNodeId);
    const rippleHasStarted = now >= (rippleStartById.get(node.id) ?? 0);
    const previous = emphasisById.get(node.id) ?? 0;
    emphasisById.set(
      node.id,
      reducedMotion
        ? (isInActiveEgoSet && rippleHasStarted ? 1 : 0)
        : stepEmphasis(previous, isInActiveEgoSet, rippleHasStarted, rampDt, tokens.emphasisRiseTau, tokens.emphasisDecayTau),
    );

    // Ego tier-reveal ramp: while a node is focused, it + its 1-hop
    // neighbors ramp toward full reveal (consumed by
    // `model/visibility/tier-visibility.ts#effectiveNodeAlpha` in the draw pass) even if
    // the semantic-zoom tier gate itself hasn't opened yet at this zoomRatio.
    const isEgoMember =
      focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocused?.has(node.id) === true);
    const previousReveal = egoRevealById.get(node.id) ?? 0;
    // The ego reveal has its own taus so children land with the camera dive; the fast decay is deliberate.
    egoRevealById.set(
      node.id,
      reducedMotion
        ? (isEgoMember ? 1 : 0)
        : stepEmphasis(previousReveal, isEgoMember, true, rampDt, tokens.egoRevealRiseTau, tokens.egoRevealDecayTau),
    );

    // Click-focus color ramp — one exp-smoothing step toward "scene focused"
    // (1) or not (0). Reduced motion snaps to the end state (the color swap
    // still lands, just without the interpolated journey).
    const previousFocusRamp = focusRampById.get(node.id) ?? 0;
    focusRampById.set(
      node.id,
      reducedMotion ? (focusActive ? 1 : 0) : stepFocusRamp(previousFocusRamp, focusActive, rampDt, tokens.focusDimTau),
    );

    // New-node appear ramp: rise every present node's value toward 1
    // (seed 0 for fresh nodes / 1 for existing set upstream). Reuses the ego
    // reveal's rise τ so a new node resolves with the same cadence content does.
    const previousAppear = appearById.get(node.id) ?? 1;
    const assemblyAppear = tierAssemblyAppear(world, node.kind, now, node.id);
    appearById.set(
      node.id,
      assemblyAppear ??
        (reducedMotion ? 1 : stepEmphasis(previousAppear, true, true, dt, tokens.egoRevealRiseTau, tokens.egoRevealRiseTau)),
    );
  }

  advanceTopologyComets(world, world.edges, dt, reducedMotion, focusedNodeId, tokens, ambientFactor);

  return { camera: nextCamera, farT, zoomRatio };
}

export function advanceTopologyComets(
  world: TopologyWorld,
  edges: readonly ParticleEdge[],
  dt: number,
  reducedMotion: boolean,
  focusedNodeId: string | null,
  tokens: Pick<OntologyMapTokens, "edgePulseSpeed" | "edgePulseSpeedEgo">,
  ambientFactor: number | undefined,
): void {
  // The focused node's capped incident `contains` edges advance like depends edges; the draw asks
  // `selectEgoContainsComets` and gets the same cached answer.
  const egoCometEdges: ReadonlySet<ParticleEdge> | null =
    focusedNodeId === null
      ? null
      : selectEgoContainsComets(world.edges, world.edgeIndexByNode.get(focusedNodeId)).edges;

  // Comet phase of `depends` edges always advances; focus-subgraph edges use `edgePulseSpeedEgo`.
  // Reduced motion skips the advance so the idle gate holds; `ambient` ramps it to 0 when asleep.
  const ambient = ambientFactor ?? 1;
  updateParticles(
    edges,
    dt,
    reducedMotion,
    (edge) => {
      const touchesFocused =
        focusedNodeId !== null && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId);
      return (
        resolveEdgePulseSpeed(touchesFocused, focusedNodeId, tokens.edgePulseSpeed, tokens.edgePulseSpeedEgo) *
        ambient
      );
    },
    egoCometEdges === null || egoCometEdges.size === 0 ? undefined : (edge) => egoCometEdges.has(edge),
  );
}
