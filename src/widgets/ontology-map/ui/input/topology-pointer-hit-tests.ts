import { projectDomeEdgeControl } from "../../model/dome-view/dome-edge";
import { lastDrawnLabelBoxes, lastDrawnNodeAlphas } from "../frame-draw/topology-frame-draw";
import { lastDialFrame } from "../../dial/frame/frame";
import { pickDial, pickDialAction } from "../../dial/pick";
import { clipBranchRelation } from "../../dial/branches/relation-ports";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import type { CameraAxes } from "../../engine/camera";
import { computeZoomRatio, DEFAULT_TIER_REVEAL, isNodeHittable } from "../../model/visibility/tier-visibility";
import type { EdgeHitCandidate } from "./topology-edge-hit";
import { clusterBadgeLabel, clusterBadgeRect, clusterBarLabel, clusterBarRect, clusterChipLabel, clusterChipRect, clusterChipScale, clusterControlForm } from "../../render/cluster-chips";
import { DEFAULT_EXPAND } from "@/shared/lib/preferences/appearance-preferences";
import { depthParallaxOffsetFor, ZERO_PARALLAX } from "../../model/realm/realm-depth-parallax";
import type { DomeNodeFrame } from "../../model/dome-view/runtime";
import { HIT_TOUCH_SLACK_PX, hitTestWorld, worldToScreen } from "../camera/topology-camera-math";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { radiusForKind, type TopologyWorld } from "../world/topology-world";
import type { PointerContext } from "./topology-pointer-context";
import type { HoverAvoidRect } from "./topology-pointer-types";

/** How far around the pointer drawn nodes and names are collected for the card to avoid. */
const HOVER_AVOID_REACH_PX = 420;
/** Breathing room around each disc and name so "clear" means visibly clear, not touching. */
const HOVER_AVOID_MARGIN_PX = 6;

/**
 * **What the edge hover card must not cover**: the discs and names the last
 * frame drew near the pointer, in client coordinates. Read at hover time,
 * from the same frame state the draw used, so the card judges the screen a
 * person sees rather than a model of it. Nodes the frame did not draw
 * (collapsed, or faded to nothing by the density gate) are not obstacles.
 */
export function collectHoverAvoidRects(
  world: TopologyWorld,
  camera: CameraAxes,
  width: number,
  height: number,
  tokens: OntologyMapTokens,
  clustered: ReadonlySet<string> | null,
  domeFrame: ReadonlyMap<string, DomeNodeFrame> | null,
  canvasOrigin: { x: number; y: number }, pointer: {
    x: number;
    y: number;
  }): HoverAvoidRect[] {
  const out: HoverAvoidRect[] = [];
  const alphas = lastDrawnNodeAlphas();
  const dialFrame = lastDialFrame();
  for (const pick of dialFrame?.picks ?? []) {
    if (Math.abs(pick.x - pointer.x) > HOVER_AVOID_REACH_PX || Math.abs(pick.y - pointer.y) > HOVER_AVOID_REACH_PX) continue;
    const rr = pick.r + HOVER_AVOID_MARGIN_PX;
    out.push({ x: canvasOrigin.x + pick.x - rr, y: canvasOrigin.y + pick.y - rr, w: 2 * rr, h: 2 * rr });
  }
  for (const node of dialFrame ? [] : world.nodes) {
    if (clustered?.has(node.id)) continue;
    if ((alphas.get(node.id) ?? 1) < 0.05) continue;
    const off = domeFrame?.get(node.id);
    const screen = worldToScreen(camera, width, height, node.x + (off?.dx ?? 0), node.y + (off?.dy ?? 0));
    if (Math.abs(screen.x - pointer.x) > HOVER_AVOID_REACH_PX || Math.abs(screen.y - pointer.y) > HOVER_AVOID_REACH_PX) continue;
    const r = radiusForKind(node.kind, tokens) * node.magnitudeScale * camera.scale.value * (off?.s ?? 1);
    const rr = r + HOVER_AVOID_MARGIN_PX;
    out.push({ x: canvasOrigin.x + screen.x - rr, y: canvasOrigin.y + screen.y - rr, w: 2 * rr, h: 2 * rr });
  }
  for (const box of lastDrawnLabelBoxes()) {
    if (box.maxX < pointer.x - HOVER_AVOID_REACH_PX || box.minX > pointer.x + HOVER_AVOID_REACH_PX) continue;
    if (box.maxY < pointer.y - HOVER_AVOID_REACH_PX || box.minY > pointer.y + HOVER_AVOID_REACH_PX) continue;
    out.push({
      x: canvasOrigin.x + box.minX - HOVER_AVOID_MARGIN_PX,
      y: canvasOrigin.y + box.minY - HOVER_AVOID_MARGIN_PX,
      w: box.maxX - box.minX + 2 * HOVER_AVOID_MARGIN_PX,
      h: box.maxY - box.minY + 2 * HOVER_AVOID_MARGIN_PX,
    });
  }
  return out;
}

export type PointerHitTests = ReturnType<typeof createPointerHitTests>;

export function createPointerHitTests(ctx: PointerContext) {
  const {
    worldRef, cameraRef, viewportRef, focusedSlugRef, hoveredNodeIdRef, reducedMotionRef,
    overviewScaleRef, selectedEdgeRef, clusterChipsRef, clusteredIdsRef, expandPrefRef,
    clusterBarLabelsRef, realmParallaxRef, realmTierKindsRef, domeRuntimeRef, neuralRampRef,
    tierRevealRef, pathEdgeIdsRef, visitedTrailRef, domeFrameNow,
  } = ctx;

  /**
   * Density gate — decides which cluster chip a click or hover point is over. It
   * projects the chip's world anchor to screen and builds the rectangle with **the
   * same** `clusterChipRect` as the draw, then runs a point-in-rect test (zero
   * coordinate drift). A hit returns the parent id.
   */
  const hitTestClusterChip = (px: number, py: number): string | null => {
    const chips = clusterChipsRef?.current;
    if (!chips || chips.length === 0) return null;
    const { width, height } = viewportRef.current;
    const camera = cameraRef.current;
    const world = worldRef.current;
    const tokens = readOntologyMapTokensOrNull();
    // Use **the same** zoom scale as the draw (`frame-draw/paint-chips.ts`) so the rectangle cannot drift.
    const scale = clusterChipScale(camera.scale.value);
    // The hit test reads **the same decision function** as the draw — when the
    // affordance changes, the drawn shape and the pressable rectangle have to change
    // together (diverging, they create a "visible but unpressable button").
    const affordance = expandPrefRef?.current.affordance ?? "pill";
    const batchSize = expandPrefRef?.current.batchSize ?? DEFAULT_EXPAND.batchSize;
    const barLabels = clusterBarLabelsRef?.current ?? undefined;
    const focusedSlug = focusedSlugRef.current;
    // 3D view — the same frame offset the draw added to the chip anchor and parent.
    const chipDomeFrame = domeFrameNow();
    for (const chip of chips) {
      // Dockability is **the same condition as the draw**: can the parent node be
      // found in the graph. A batch-reveal `+N More` chip has a synthetic parent id
      // and cannot be found, and then the shape does not disappear but stays a pill
      // (that decision is also one function).
      const parentNode = world?.nodeById.get(chip.parentId);
      const dockable = parentNode !== undefined && tokens !== null;
      const form = clusterControlForm({
        affordance,
        expanded: chip.expanded,
        // For a synthetic ego chip (`Neighbor +N`) the parent node *is* the chosen node —
        // subjecting that chip to "absent unless chosen" would close batch reveal entirely.
        focused: chip.ego === true || focusedSlug === chip.parentId,
        dockable,
      });
      if (form === "none") continue;
      let rect: ReturnType<typeof clusterChipRect>;
      if (form === "badge" || form === "bar") {
        // S10 defect 2 — the node-docked shape. Derived with **the same** rectangle function as the draw.
        if (!parentNode || !tokens) continue;
        const chipOff = chipDomeFrame?.get(parentNode.id);
        const parentScreen = worldToScreen(camera, width, height, parentNode.x + (chipOff?.dx ?? 0), parentNode.y + (chipOff?.dy ?? 0));
        const nodeScreenRadius = radiusForKind(parentNode.kind, tokens) * parentNode.magnitudeScale * camera.scale.value;
        rect =
          form === "bar"
            ? clusterBarRect(
              parentScreen.x,
              parentScreen.y,
              nodeScreenRadius,
              clusterBarLabel({
                expanded: chip.expanded,
                count: chip.count,
                batchSize,
                labels: barLabels,
              }),
              scale)
            : clusterBadgeRect(
              parentScreen.x,
              parentScreen.y,
              nodeScreenRadius,
              clusterBadgeLabel(chip.count, chip.expanded),
              scale);
      } else {
        const chipOff = chipDomeFrame?.get(chip.parentId);
        const screen = worldToScreen(camera, width, height, chip.anchor.x + (chipOff?.dx ?? 0), chip.anchor.y + (chipOff?.dy ?? 0));
        rect = clusterChipRect(screen.x, screen.y, clusterChipLabel(chip.count, chip.expanded), scale);
      }
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
        return chip.parentId;
      }
    }
    return null;
  };

  /**
   * Tier-aware hit test — only nodes currently visible at this altitude
   * (`model/visibility/tier-visibility.ts`) can be grabbed/hovered, so the pointer never
   * grabs an invisible semantic-zoom-gated capability/element.
   */
  const hitVisibleNode = (
    world: TopologyWorld,
    camera: CameraAxes,
    tokens: ReturnType<typeof readOntologyMapTokensOrNull>,
    px: number,
    py: number): string | null => {
    if (!tokens) return null;
    const dialFrame = lastDialFrame();
    if (dialFrame) return pickDial(dialFrame.picks, dialFrame.rows, px, py, HIT_TOUCH_SLACK_PX);
    // Tier hittability rides the same zoom-ratio signal as the draw pass
    // (`model/visibility/tier-visibility.ts`), NOT `farT` — so the pointer never grabs a
    // semantic-zoom-hidden capability/element even at the circuit default entry.
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const zoomRatio = computeZoomRatio(camera.scale.value, overviewEntryScale);
    // C1 A2 — focus ego tier exemption: the focused node + its 1-hop neighbors
    // are hittable even below the tier's own alpha threshold, matching the
    // draw pass's `effectiveNodeAlpha` exemption (`frame-draw/node-alpha.ts`) —
    // otherwise a capability that's now VISIBLE (ego-revealed) would still be
    // unclickable, defeating the entire "click a domain to expand it" flow.
    const focusedNodeId = focusedSlugRef.current;
    const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) : undefined;
    // S3 — nodes not drawn this frame (density-gate collapsed plus optionally hidden
    // ego neighbours) are excluded from hit testing, closing the S2 gap where a hidden
    // ego neighbour could be clicked.
    const clusteredIds = clusteredIdsRef?.current;
    // S10 defect 3 — the depth-based tier override during realm expansion (the same map as the draw).
    const realmTierKinds = realmTierKindsRef?.current ?? null;
    // S5 — with realm parallax active, apply the same band offsets to hit testing as
    // the draw. 3D view — compose the offsets and perspective factor from the **same
    // frame map** the draw rendered (so a click mid-rotation is judged in this
    // frame's coordinates).
    const parallax = realmParallaxRef?.current ?? null;
    const domeFrame = domeFrameNow();
    const renderOffsetForNode =
      parallax || domeFrame
        ? (node: { id: string; x: number; y: number; kind: "project" | "domain" | "capability" | "element" }) => {
          const pOff = parallax
            ? depthParallaxOffsetFor(parallax.depthById.get(node.id), parallax.depth2, parallax.depth3)
            : ZERO_PARALLAX;
          const dOff = domeFrame?.get(node.id);
          return { x: pOff.x + (dOff?.dx ?? 0), y: pOff.y + (dOff?.dy ?? 0) };
        }
        : undefined;
    return hitTestWorld(
      world,
      camera,
      viewportRef.current.width,
      viewportRef.current.height,
      tokens,
      px,
      py,
      (node) =>
        isNodeHittable(
          node,
          zoomRatio,
          focusedNodeId,
          neighborsOfFocused,
          tierRevealRef?.current ?? DEFAULT_TIER_REVEAL,
          clusteredIds,
          realmTierKinds,
          // The alpha the draw used this frame — every see-through channel from one source.
          lastDrawnNodeAlphas()),
      renderOffsetForNode,
      // 3D perspective factor — the same s the draw multiplied by, applied to the hit disc too.
      domeFrame ? (node) => domeFrame.get(node.id)?.s ?? 1 : undefined,
      // 3D depth — among overlapping discs the nearer (brighter, larger) node wins.
      domeFrame ? (node) => domeFrame.get(node.id)?.u ?? 0 : undefined);
  };

  /**
   * Candidate cache: rebuilt only when an input differs. The call site is every `pointermove` that
   * missed a node; with the camera still the candidates are unchanged. The key holds `world`.
   */
  let edgeCandidateCache: {
    key: string;
    world: unknown;
    clusteredIds: unknown;
    realmTierKinds: unknown;
    tierReveal: unknown;
    value: EdgeHitCandidate[];
  } | null = null;

  /** Shared by P3b/P3c — screen projections of edges whose ends are both hittable at the current tier. */
  const buildEdgeCandidates = (): EdgeHitCandidate[] => {
    const world = worldRef.current;
    const dial = lastDialFrame();
    if (!world || (dial && !dial.contextOnly)) return [];
    const tokens = readOntologyMapTokensOrNull();
    if (!tokens) return [];
    const { width, height } = viewportRef.current;
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const zoomRatio = computeZoomRatio(cameraRef.current.scale.value, overviewEntryScale);
    const focusedNodeId = focusedSlugRef.current;
    // The cache key — every input that decides the candidate list. It holds all three
    // camera axes, so a pan or zoom makes a new key every frame while a still camera
    // keeps the same one. 3D view — edge endpoints also need the same frame offsets as
    // the draw for hover and clicks to follow the drawn curve. The frame generation
    // (frameEpoch) is in the key: mid-rotation every frame has new coordinates, while a
    // still view keeps the same generation.
    const domeFrame = domeFrameNow();
    const domeEpoch = domeFrame ? (domeRuntimeRef?.current?.frameEpoch ?? 0) : -1;
    const selectedEdge = selectedEdgeRef?.current ?? null;
    const pathIds = pathEdgeIdsRef?.current ?? null;
    const visited = visitedTrailRef?.current ?? [];
    const cacheKey = [
      cameraRef.current.x.value,
      cameraRef.current.y.value,
      cameraRef.current.scale.value,
      width,
      height,
      zoomRatio,
      focusedNodeId ?? "",
      hoveredNodeIdRef.current ?? "",
      selectedEdge ? `${selectedEdge.sourceId}>${selectedEdge.targetId}` : "",
      pathIds ? [...pathIds].sort().join(",") : "",
      visited.join(","),
      dial?.contextOnly ?? false,
      domeEpoch
    ].join("|");
    // Sets and maps are compared **by reference** — comparing only sizes lets a
    // different collection of the same size through, which is the quietest kind of
    // cache error. These values are replaced with new objects rather than mutated in
    // place, so reference comparison is exact.
    const clusteredIds = clusteredIdsRef?.current;
    const realmTierKinds = realmTierKindsRef?.current ?? null;
    const tierReveal = tierRevealRef?.current ?? DEFAULT_TIER_REVEAL;
    if (edgeCandidateCache &&
      edgeCandidateCache.world === world &&
      edgeCandidateCache.key === cacheKey &&
      edgeCandidateCache.clusteredIds === clusteredIds &&
      edgeCandidateCache.realmTierKinds === realmTierKinds &&
      edgeCandidateCache.tierReveal === tierReveal) {
      return edgeCandidateCache.value;
    }
    const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) : undefined;
    const hittable = new Set(world.nodes
      .filter((n) => isNodeHittable(n, zoomRatio, focusedNodeId, neighborsOfFocused, tierReveal, clusteredIds, realmTierKinds, lastDrawnNodeAlphas()))
      .map((n) => n.id));
    // Hit-test inversion guard (panel3-S3) — the end nodes' body radius in screen px
    // is computed with **the same formula** as `hitTestWorld`
    // (radiusForKind × magnitudeScale × scale + 5) and passed through. It meshes
    // exactly with the node hit area so a click on or near a node body cannot leak to
    // a radial edge (node body > edge).
    const scale = cameraRef.current.scale.value;
    const bodyRadius = (id: string): number | undefined => {
      const node = world.nodeById.get(id);
      if (!node)
        return undefined;
      // 3D — the same perspective factor as the node hit disc (identical formula to the draw).
      const domeS = domeFrame?.get(id)?.s ?? 1;
      return radiusForKind(node.kind, tokens) * node.magnitudeScale * domeS * scale + HIT_TOUCH_SLACK_PX;
    };
    const candidates: EdgeHitCandidate[] = [];
    // The same live projected curve as paint, including assembly and orbit.
    // Averaging endpoint offsets onto the flat bow misses the visible 3D line.
    const cam = cameraRef.current;
    const ZERO = { dx: 0, dy: 0, s: 1 };
    for (const edge of world.edges) {
      if (!hittable.has(edge.sourceId) || !hittable.has(edge.targetId))
        continue;
      const offA = domeFrame?.get(edge.sourceId) ?? ZERO;
      const offB = domeFrame?.get(edge.targetId) ?? ZERO;
      const control = projectDomeEdgeControl(edge, domeFrame, domeRuntimeRef?.current?.model.arrangement ?? "ownership", scale, reducedMotionRef.current ? undefined : neuralRampRef?.current);
      candidates.push({
        edge,
        ...clipBranchRelation(dial, edge.sourceId, edge.targetId, {
          a: worldToScreen(cam, width, height, edge.ax + offA.dx, edge.ay + offA.dy),
          b: worldToScreen(cam, width, height, edge.bx + offB.dx, edge.by + offB.dy),
          control: worldToScreen(cam, width, height, control.x, control.y),
        }),
        aRadius: bodyRadius(edge.sourceId),
        bRadius: bodyRadius(edge.targetId),
      });
    }
    edgeCandidateCache = { key: cacheKey, world, clusteredIds, realmTierKinds, tierReveal, value: candidates };
    return candidates;
  };

  const hitDialAction = (x: number, y: number) => pickDialAction(lastDialFrame()?.rows ?? [], x, y);
  return { hitDialAction, hitTestClusterChip, hitVisibleNode, buildEdgeCandidates };
}
