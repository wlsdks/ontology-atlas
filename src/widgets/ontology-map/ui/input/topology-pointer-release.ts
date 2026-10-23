import type { PointerEvent as ReactPointerEvent } from "react";
import { applyBranchMemberAction } from "../../dial/branches/member-disclosure";
import { pickDialAction } from "../../dial/pick";
import { lastDialFrame } from "../../dial/frame/frame";
import { clampPointToPanBounds } from "../../engine/camera";
import { MOMENTUM_SPRING, MOMENTUM_TAU_MS, springAngularFrequency } from "../../model/motion-physics";
import { projectFlickLanding, sampleReleaseVelocity } from "../../engine/momentum";
import { EGO_NEIGHBOR_CHIP_ID, parseClusterMoreChipId } from "../../model/visibility/focus-state";
import { computeZoomRatio, DEFAULT_TIER_REVEAL, isSpineOnlyZoom } from "../../model/visibility/tier-visibility";
import { hitTestEdges } from "./topology-edge-hit";
import { clampOrbitReleaseVelocity, domeFacingYaws, projectOrbitLanding, snapOrbitLanding, ORBIT_PITCH_PER_PX, ORBIT_YAW_PER_PX } from "../../model/dome-view/orbit";
import { INITIAL_POINTER_MACHINE_STATE, resolveClickAction, transitionPointerState } from "../../interaction/pointer-state-machine";
import { computeUnfocusedPanBounds } from "../camera/topology-camera-math";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import type { PointerContext } from "./topology-pointer-context";
import type { PointerHitTests } from "./topology-pointer-hit-tests";
import type { TopologyPointerHandlers } from "./topology-pointer-types";

/**
 * Two taps on one node within this window are a double-click: the second tap opens or folds its
 * children and keeps the selection instead of undoing the first tap.
 */
export const DOUBLE_TAP_WINDOW_MS = 350;
/** How far apart (CSS px) two presses may land and still be one 3D double-click. */
const DOUBLE_TAP_SLOP_PX = 8;

export function createPointerReleaseHandlers(
  ctx: PointerContext,
  hits: PointerHitTests,
): Pick<TopologyPointerHandlers, "handlePointerUp" | "handlePointerCancel" | "handlePointerLeave"> {
  const {
    navigationSpeedRef, worldRef, cameraRef, cameraTargetRef, dampingRef, cameraAngularFreqRef,
    pointerMachineRef, dragHistoryRef, canvasRef, focusedSlugRef, reducedMotionRef, simRef, heatRef,
    nodeDragRef, dragStartPosRef, overviewScaleRef, activeTouchesRef, pinchRef, selectedEdgeRef,
    clusterChipsRef, lastTapRef, tierRevealRef, onSelect, onFlyToNode, onSelectEdge, onPaneClick,
    onToggleCluster, onExpandEgoNeighbors, onExpandClusterBatch, noteUserCameraGesture,
    domeInteractive, clearEdgeHover, clearClusterHover,
  } = ctx;

  const { hitTestClusterChip, buildEdgeCandidates } = hits;

  const handlePointerUp = (e?: ReactPointerEvent<HTMLCanvasElement>) => {
    // rank4 touch pinch zoom — touch release bookkeeping. A pinch up (or the leftover
    // finger of one) does not take the click/flick paths: entering a pinch already
    // cancelled the machine to idle, while an ordinary single tap is in phase
    // pressed/dragging at up time and does not hit this early return. (The internal
    // no-arg call — the stuck-drag guard — skips the bookkeeping.)
    if (e && activeTouchesRef && e.pointerType === "touch" && activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.delete(e.pointerId);
      if (pinchRef?.current && activeTouchesRef.current.size < 2)
        pinchRef.current = null;
      if (pointerMachineRef.current.phase === "idle")
        return;
    }
    const tokens = readOntologyMapTokensOrNull();
    if (!tokens)
      return;
    // P3b — snapshot of the click point (outside a drag, downPoint *is* the click coordinate).
    const clickPoint = pointerMachineRef.current.downPoint;
    const wasDragging = pointerMachineRef.current.phase === "dragging";
    const { next, commitClick } = transitionPointerState(pointerMachineRef.current, { type: "pointerup" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
    // Clearing the cursor with `""` falls back to the canvas default `grab`; the next move over a node
    // overrides it with `pointer`.
    if (canvasRef?.current)
      canvasRef.current.style.cursor = "";
    // Node pin-drag release: unpin and give the graph a settle burst so it
    // (and the dropped node) relaxes around the drop, Obsidian-style. No
    // camera flick, no click commit (the state machine already suppressed the
    // click for a drag).
    if (nodeDragRef.current !== null) {
      // 3D in-plane drag release — there is no simulation pin (none was set on grab).
      // Only `released` is marked so the spring settles onto the last target point (the
      // loop clears it once it sees the settle) — the velocity is not reset to 0 on release.
      {
        const dome = domeInteractive();
        if (dome && dome.drag !== null && dome.drag.nodeId === nodeDragRef.current.nodeId) {
          dome.drag.released = true;
          nodeDragRef.current = null;
          if (canvasRef?.current)
            canvasRef.current.style.cursor = "";
          return;
        }
      }
      simRef.current?.clearPin();
      nodeDragRef.current = null;
      heatRef.current = Math.max(heatRef.current, tokens.nodeReleaseSettleMs);
      // C1 B1: stop tracking Δ (drag ended) — `dragAffectedSetRef` stays set
      // through the settle burst above (B2), cleared once heat reaches 0
      // (`use-topology-loop.ts`'s rAF loop).
      dragStartPosRef.current = null;
      // rank4 — the drag has ended, so the "grabbing" cursor is cleared (the next
      // pointermove sets grab/pointer/"" again depending on hover).
      if (canvasRef?.current)
        canvasRef.current.style.cursor = "";
      return;
    }
    if (wasDragging) {
      const dragSpeed = navigationSpeedRef.current.drag;
      {
        const dome = domeInteractive();
        if (dome && dome.orbiting) {
          dome.orbiting = false;
          dome.yaw = dome.yawTarget;
          dome.pitch = dome.pitchTarget;
          if (!reducedMotionRef.current) {
            const release = sampleReleaseVelocity({
              history: dragHistoryRef.current,
              releaseTime: performance.now(),
              windowMs: tokens.cameraReleaseVelocityWindowMs,
              minSpeedPxPerMs: tokens.cameraFlickMinSpeed,
            });
            if (release.isFlick) {
              dome.yawVel = clampOrbitReleaseVelocity(release.vx * ORBIT_YAW_PER_PX * dragSpeed);
              dome.pitchVel = clampOrbitReleaseVelocity(release.vy * ORBIT_PITCH_PER_PX * dragSpeed);
              const landing = projectOrbitLanding(dome.yaw, dome.yawVel);
              dome.yawSnap = snapOrbitLanding(landing, domeFacingYaws(dome.model));
            }
            else {
              dome.yawSnap = null;
            }
          }
          return;
        }
      }
      const release = sampleReleaseVelocity({
        history: dragHistoryRef.current,
        releaseTime: performance.now(),
        windowMs: tokens.cameraReleaseVelocityWindowMs,
        minSpeedPxPerMs: tokens.cameraFlickMinSpeed,
      });
      if (reducedMotionRef.current || !release.isFlick) {
        cameraTargetRef.current = { tx: cameraRef.current.x.value, ty: cameraRef.current.y.value, tscale: cameraTargetRef.current.tscale };
        cameraRef.current = {
          ...cameraRef.current,
          x: { value: cameraRef.current.x.value, velocity: 0 },
          y: { value: cameraRef.current.y.value, velocity: 0 },
        };
        dampingRef.current = tokens.cameraDampingDefault;
        return;
      }
      const px = projectFlickLanding({
        velocityPxPerMs: release.vx * dragSpeed,
        cameraPosition: cameraRef.current.x.value,
        cameraScale: cameraRef.current.scale.value,
        timeConstantMs: MOMENTUM_TAU_MS,
      });
      const py = projectFlickLanding({
        velocityPxPerMs: release.vy * dragSpeed,
        cameraPosition: cameraRef.current.y.value,
        cameraScale: cameraRef.current.scale.value,
        timeConstantMs: MOMENTUM_TAU_MS,
      });
      const world = worldRef.current;
      let clampedLanding = { x: px.landingTarget, y: py.landingTarget };
      if (world) {
        const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
        const zoomRatio = computeZoomRatio(cameraRef.current.scale.value, overviewEntryScale);
        const boundsSource = isSpineOnlyZoom(zoomRatio, tierRevealRef?.current ?? DEFAULT_TIER_REVEAL) ? world.spineBounds : world.bounds;
        clampedLanding = clampPointToPanBounds(px.landingTarget, py.landingTarget, computeUnfocusedPanBounds(boundsSource, cameraRef.current.scale.value, tokens));
      }
      cameraTargetRef.current = { tx: clampedLanding.x, ty: clampedLanding.y, tscale: cameraTargetRef.current.tscale };
      noteUserCameraGesture();
      cameraRef.current = {
        ...cameraRef.current,
        x: { value: cameraRef.current.x.value, velocity: px.worldVelocity },
        y: { value: cameraRef.current.y.value, velocity: py.worldVelocity },
      };
      dampingRef.current = MOMENTUM_SPRING.damping;
      cameraAngularFreqRef.current = springAngularFrequency(MOMENTUM_SPRING);
      return;
    }
    if (commitClick && clickPoint) {
      const frame = lastDialFrame();
      const action = frame?.branchScene ? pickDialAction(frame.rows, clickPoint.x, clickPoint.y) : null;
      if (action && frame?.branchScene) {
        if (lastTapRef) lastTapRef.current = null;
        if (applyBranchMemberAction(frame.branchScene, action, performance.now())) {
          onSelect?.(action.domainId, "canvas-dblclick");
          onFlyToNode?.(action.domainId);
        }
        clearClusterHover();
        return;
      }
    }
    // A double-click on a node opens its children and keeps it selected. A second
    // quick tap on a leaf keeps the selection too: a repeated click is never an undo.
    if (commitClick !== null && commitClick.nodeId !== null && lastTapRef) {
      const now = performance.now();
      const last = lastTapRef.current;
      /*
       * 3D: a double-click belongs to the node the first click hit; a neighbour name can land under the
       * cursor, so two presses within a few pixels count as one gesture on one thing.
       */
      const sameSpot = domeInteractive() !== null &&
        last !== null &&
        clickPoint !== null &&
        last.x !== undefined &&
        last.y !== undefined &&
        Math.hypot(clickPoint.x - last.x, clickPoint.y - last.y) <= DOUBLE_TAP_SLOP_PX;
      const nodeId = sameSpot && last !== null ? last.nodeId : commitClick.nodeId;
      if (last !== null && last.nodeId === nodeId && now - last.at <= DOUBLE_TAP_WINDOW_MS) {
        lastTapRef.current = null;
        if (focusedSlugRef.current !== nodeId)
          onSelect?.(nodeId, "canvas-dblclick");
        // 3D: the double-click is the fly-to — the one gesture that moves the view to a node
        // (`DOME_FLY_MS`). The single click before it only selected.
        const flyDome = domeInteractive();
        if (flyDome !== null) {
          flyDome.flyRequest = { slug: nodeId };
          return;
        }
        const chip = lastDialFrame() ? undefined : clusterChipsRef?.current?.find((c) => c.parentId === nodeId);
        if (chip && onToggleCluster) {
          onToggleCluster(nodeId);
          clearClusterHover();
          return;
        }
        onFlyToNode?.(nodeId);
        return;
      }
      lastTapRef.current = { nodeId, at: now, x: clickPoint?.x, y: clickPoint?.y };
    }
    const action = resolveClickAction(commitClick, focusedSlugRef.current);
    if (action.type === "select") {
      onSelect?.(action.nodeId, "canvas-click");
      return;
    }
    // Density gate — an empty-space click (node miss) over a cluster chip toggles
    // expansion. It takes priority over edge selection and ground deselection (a chip is
    // explicit interactive chrome). The node-click = ego-focus contract was already
    // handled in the select branch above and does not reach here.
    if (commitClick &&
      commitClick.nodeId === null &&
      clickPoint &&
      (onToggleCluster || onExpandEgoNeighbors || onExpandClusterBatch)) {
      const chipParent = hitTestClusterChip(clickPoint.x, clickPoint.y);
      if (chipParent === EGO_NEIGHBOR_CHIP_ID) {
        // S2 part 3a — the `Neighbor +N` chip lights the next neighbour batch rather than toggling the URL.
        onExpandEgoNeighbors?.();
        clearClusterHover();
        return;
      }
      // High-fanout batch reveal — a `+N More` chip (synthetic id) lights that
      // parent's next batch rather than toggling the URL (collapse). Resolved to the
      // real parent id before dispatch.
      const moreParent = chipParent === null ? null : parseClusterMoreChipId(chipParent);
      if (moreParent !== null) {
        onExpandClusterBatch?.(moreParent);
        clearClusterHover();
        return;
      }
      if (chipParent !== null && onToggleCluster) {
        onToggleCluster(chipParent);
        // The toggle changed the state (collapsed ↔ expanded), so the tooltip closes — a re-hover gets fresh copy.
        clearClusterHover();
        return;
      }
    }
    // P3b — an empty-space click near an edge selects that edge (edges are first-class
    // objects). Candidates are limited to edges whose endpoints are both hittable at
    // the current tier, preventing the contract violation of clicking an invisible edge.
    // Only on failure does the existing deselect run.
    if (commitClick && commitClick.nodeId === null && clickPoint && onSelectEdge) {
      const hit = hitTestEdges(buildEdgeCandidates(), clickPoint.x, clickPoint.y, 7);
      if (hit) {
        onSelectEdge({
          sourceId: hit.sourceId,
          targetId: hit.targetId,
          relationType: hit.relationType,
          declaredBySlug: hit.declaredBySlug,
        });
        return;
      }
    }
    // A ground click with only an edge selected (no node focus) is a deselection too —
    // `resolveClickAction` looks only at node focus, so it is reinforced here (user
    // report: "After clicking a line,
    // clicking the ground should return things to normal").
    const emptyGroundWithEdgeSelected = commitClick !== null && commitClick.nodeId === null && (selectedEdgeRef?.current ?? null) !== null;
    if (action.type === "deselect" || emptyGroundWithEdgeSelected)
      onPaneClick?.();
  };

  const handlePointerLeave = () => {
    clearEdgeHover();
    clearClusterHover();
  };

  const handlePointerCancel = (e?: ReactPointerEvent<HTMLCanvasElement>) => {
    // rank4 touch pinch zoom — bookkeeping for a cancelled touch pointer (a browser gesture hijack and the like).
    if (e && activeTouchesRef && e.pointerType === "touch") {
      activeTouchesRef.current.delete(e.pointerId);
      if (pinchRef?.current && activeTouchesRef.current.size < 2)
        pinchRef.current = null;
    }
    clearEdgeHover();
    clearClusterHover();
    const tokens = readOntologyMapTokensOrNull();
    // 3D — cleanly end any orbit or in-plane drag in flight (the spring runs to settle).
    // There is no simulation pin, so it is not handed to the 2D pin cleanup block below
    // (keeping free heat from shaking the hidden 2D layout).
    {
      const dome = domeInteractive();
      if (dome) {
        dome.orbiting = false;
        dome.yawTarget = dome.yaw;
        dome.pitchTarget = dome.pitch;
        if (dome.drag !== null) {
          dome.drag.released = true;
          nodeDragRef.current = null;
          if (canvasRef?.current)
            canvasRef.current.style.cursor = "";
        }
      }
    }
    // Abort any in-flight node pin-drag cleanly (release the pin, let it settle).
    if (nodeDragRef.current !== null) {
      simRef.current?.clearPin();
      nodeDragRef.current = null;
      heatRef.current = Math.max(heatRef.current, tokens?.nodeReleaseSettleMs ?? 900);
      dragStartPosRef.current = null;
      // rank4 — a cancel restores the "grabbing" cursor too.
      if (canvasRef?.current)
        canvasRef.current.style.cursor = "";
    }
    if (!tokens) {
      pointerMachineRef.current = INITIAL_POINTER_MACHINE_STATE;
      return;
    }
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointercancel" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
  };
  return { handlePointerUp, handlePointerCancel, handlePointerLeave };
}
