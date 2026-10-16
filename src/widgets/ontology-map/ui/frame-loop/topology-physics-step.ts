/**
 * One frame's physics — camera spring, altitude, hover-ripple emphasis, and
 * ambient comet-tail progress (prototype `frame()` §14: `updateCamera` ->
 * `updateAltitude` -> `updateEmphasis` -> `updateParticles`). Split out of
 * `use-topology-loop.ts`'s rAF callback to keep that file under budget.
 * Mutates `input.world.edges[].t` and `input.emphasisById` in place — this is
 * the one place per-frame mutation is expected, matching the engine's own
 * "live state, stepped every frame" contract (`engine/camera.ts`).
 */

import { clampPointToPanBounds, stepCamera, type CameraAxes, type CameraTarget, type PanBounds } from "../../engine/camera";
import { computeAltitudeBand, computeFarT } from "../../model/visibility/altitude";
import { isNodeEmphasisActive, resolveEdgePulseSpeed, stepEmphasis, stepFocusRamp } from "../../model/visibility/focus-state";
import { settleTierAssembly, tierAssemblyAppear } from "../../morph/tier-assembly";
import { selectEgoContainsComets, updateParticles, type ParticleEdge } from "../../render/edge-fireflies";
import { computeZoomRatio, DEFAULT_TIER_REVEAL, isSpineOnlyZoom, type TierRevealConfig } from "../../model/visibility/tier-visibility";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import {
  computeEffectiveCameraScaleMax,
  computeEffectiveCameraScaleMin,
  computeUnfocusedPanBounds, focusPanBounds, type FocusLeashPx } from "../camera/topology-camera-math";
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
   * True while an edge-pair focus is live (`selectedEdge !== null`) with no node
   * focus — the click-focus dim ramp treats edge selection as "the scene is
   * focused" too, so selecting/deselecting a line ramps the same normal↔dim
   * transition instead of snapping (⑨ removing the edge-selection dim snap). Only
   * the ramp gate uses it; the ego/pair CLASSIFICATION still lives in the draw pass.
   */
  pairFocusActive: boolean;
  hoveredNodeId: string | null;
  /**
   * The one neighbour the user is hovering in the detail panel's "Connected Nodes"
   * list, or null. Under focus (hover suppressed) this node still
   * ramps its emphasis so the panel row and the on-canvas node/edge light up
   * together ("emphasis ripple" linkage, lead spec §4). Null until the panel-hover
   * API feeds it in.
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
   * null/omitted keeps the previous behaviour.
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
   * A8 — `prefers-reduced-motion: reduce`. Springs and ramps snap straight to
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
   * Nodes the density gate collapsed and therefore **does not draw** (a subtree
   * replaced by a single chip).
   *
   * Given this, the four ramps below are not run for them — the emphasis, ego-reveal,
   * focus-dim and entry ramps of a node that is not on screen appear nowhere.
   * Measured (synth=3000): **2,820 of 3,000 (94%) were collapsed**, and roughly
   * 24,000 map operations per frame were going to that 94% — permanently, not only
   * while dragging.
   *
   * ⚠️ **Skipping must not leave the value behind.** A leftover value revives as «its
   * past state» the instant that node is expanded out of the chip, so a node expanded
   * while focused **snaps** to dim. So the entry is deleted when skipped — every
   * consumer has a `?? 0` (emphasis, ego, focus) or `?? 1` (entry) default, so a
   * deleted entry falls back to the existing contract of «ramping in from scratch».
   *
   * Omitted means every node is in scope — an existing caller or test that does not
   * know this argument behaves exactly as before.
   */
  clusteredIds?: ReadonlySet<string> | null;
  /** Mutated in place — the hook owns this map's lifetime across frames. */
  emphasisById: Map<string, number>;
  rippleStartById: ReadonlyMap<string, number>;
  /**
   * C1 A2 (focus ego tier exemption) — mutated in place, like `emphasisById`.
   * Ramps toward 1 for the focused node + its 1-hop neighbors while a focus is
   * active (so semantic-zoom-gated tiers still fade IN under focus instead of
   * staying invisible/unclickable), toward 0 otherwise. Kept separate from
   * `emphasisById` (the hover-ripple map) because that map's "active" condition
   * under focus is narrowly the panel-hover row, not the whole ego set — reusing
   * it here would either break that contract or require loosening it.
   */
  egoRevealById: Map<string, number>;
  /**
   * Click-focus signature — mutated in place like `emphasisById`. Each node's
   * scalar 0..1 ramps toward 1 while ANY focus is live (node OR edge-pair) and
   * toward 0 otherwise, on `--map-focus-dim-tau`. `frame-draw/node-visual.ts`
   * lerps normal→dim/ego color and eases the center radius by this factor, so
   * the dim/ego swap a click triggers rides the camera-dive time axis instead of
   * hard-cutting (and reverses on deselect). Per-node (not one scalar) so a node
   * that appears mid-focus — e.g. an expanded cluster child — ramps INTO dim
   * from 0 rather than snapping in already-dimmed.
   */
  focusRampById: Map<string, number>;
  /**
   * rank8 — new-node appear ramp, mutated in place like `emphasisById`. Seeded
   * to 0 for nodes that first appear on a world rebuild (existing nodes stay 1)
   * by `use-topology-loop.ts`; stepped here toward 1 for every present node on
   * `egoRevealRiseTau` (reused — same "content resolves onto the scene" rise as
   * the ego reveal). `frame-draw/paint-nodes.ts` multiplies effRadius (0.6→1 micro
   * scale) and globalAlpha (0→1) by it so a new node swells in instead of
   * hard-popping. reduced-motion snaps to 1. Missing entry defaults to 1 (never
   * fades an untracked node).
   */
  appearById: Map<string, number>;
  /**
   * Slice C (the dev/non-dev mode toggle) — the tier gate config. Omitted defaults to
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
  // camera's own effective zoom-in ceiling (C1 A1) is now DERIVED from this
  // same entry scale.
  const overviewEntryScale = overviewScale * tokens.overviewEntryRatio;

  // Focus-aware pan clamp (drag-while-focused must not lose the subject): while
  // a node is ego-focused AND the camera is zoomed IN past the overview scale,
  // clamp the pan so the camera centre stays within `cameraFocusPanMargin` world
  // units of the FOCUSED NODE — so an empty-space pan can look around the cluster
  // but the subject can never leave the frame; overshooting rubber-bands back
  // (Obsidian feel). Clamping to the focused node's own point (not the whole ego
  // bbox) is what keeps the subject on screen: a wide ego bbox + margin would let
  // the camera reach the cluster's far corner and slide the focused node off the
  // opposite edge. The zoom gate is essential: "Fit Whole Map"
  // / fit-view keeps the node selected (focusedNodeId stays set) while springing OUT
  // to the overview; once the camera scale drops below the overview fit scale the
  // clamp reverts to the full world bounds, so fit-view/close-focus recovery is
  // never fought.
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

  // C1 A1: the camera's real zoom-in ceiling is now ratio-based (viewport-
  // relative), not the absolute `cameraScaleMax` token — see
  // `topology-camera-math.ts#computeEffectiveCameraScaleMax`'s JSDoc for the
  // audit finding this fixes (capability/element tiers were unreachable).
  const effectiveScaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax, world.dialScaleMax ?? undefined);
  const effectiveScaleMin = Math.min(
    computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin),
    // 3D dome — if the dome's fit zoom sits below the 2D minimum, drop that far (`DomeRuntime.fitScale`).
    scaleMinOverride ?? Infinity,
  );
  // The spring aims inside the same box the elastic clamp holds; aimed past it, the two would hold
  // the camera still-moving at a stalemate outside the box for as long as the target stood there.
  const heldTarget = isDragging ? target : { ...target, ...clampTargetToPanBounds(target, panBounds) };
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

    // C1 A2 — ego tier-reveal ramp: while a node is focused, it + its 1-hop
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
    // (1) or not (0). A8 reduced motion snaps to the end state (the color swap
    // still lands, just without the interpolated journey).
    const previousFocusRamp = focusRampById.get(node.id) ?? 0;
    focusRampById.set(
      node.id,
      reducedMotion ? (focusActive ? 1 : 0) : stepFocusRamp(previousFocusRamp, focusActive, rampDt, tokens.focusDimTau),
    );

    // rank8 — new-node appear ramp: rise every present node's value toward 1
    // (seed 0 for fresh nodes / 1 for existing set upstream). Reuses the ego
    // reveal's rise τ so a new node resolves with the same cadence content does.
    const previousAppear = appearById.get(node.id) ?? 1;
    const assemblyAppear = tierAssemblyAppear(world, node.kind, now);
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
