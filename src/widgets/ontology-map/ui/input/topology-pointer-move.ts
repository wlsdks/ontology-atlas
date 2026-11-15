import type { PointerEvent as ReactPointerEvent } from "react";
import { EGO_NEIGHBOR_CHIP_ID, parseClusterMoreChipId, scheduleRipple } from "../../model/visibility/focus-state";
import { computeDragTugSets } from "../../interaction/drag-tug";
import { hitTestEdges } from "./topology-edge-hit";
import { computeGrabOffsetWorld, computePinWorld } from "../../interaction/node-drag";
import { transitionPointerState } from "../../interaction/pointer-state-machine";
import { screenToWorld } from "../camera/topology-camera-math";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import type { PointerContext } from "./topology-pointer-context";
import { collectHoverAvoidRects, type PointerHitTests } from "./topology-pointer-hit-tests";
import type { TopologyPointerHandlers } from "./topology-pointer-types";

/**
 * Sim warmth topped up during a node pin-drag, in milliseconds so settling is refresh-rate invariant.
 * The release settle budget is the `--map-node-release-settle-ms` token.
 */
const NODE_DRAG_HEAT_MS = 350;

/** Prototype `startRipple()` — the +12ms/neighbor stagger has no separate token (design doc §2.4). */
const RIPPLE_PER_NEIGHBOR_DELAY_MS = 12;

export function createPointerMoveHandler(
  ctx: PointerContext,
  hits: PointerHitTests,
  handlePointerUp: TopologyPointerHandlers["handlePointerUp"],
): TopologyPointerHandlers["handlePointerMove"] {
  const {
    navigationSpeedRef, worldRef, cameraRef, cameraTargetRef, dampingRef, cameraAngularFreqRef,
    viewportRef, pointerMachineRef, dragHistoryRef, focusedSlugRef, hoveredNodeIdRef,
    rippleStartRef, simRef, heatRef, nodeDragRef, dragAffectedSetRef, dragStartPosRef,
    activeTouchesRef, pinchRef, hoveredEdgeRef, clusterChipsRef, clusteredIdsRef,
    hoveredClusterIdRef, onHoverEdge, onHoverCluster, noteUserCameraGesture,
    scaleWithinZoomBounds, currentRect, clearEdgeHover,
    clearClusterHover, releaseCameraForZoom,
  } = ctx;

  const { hitDialAction, hitTestClusterChip, hitVisibleNode, buildEdgeCandidates } = hits;

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world)
      return;
    const rect = currentRect(e.currentTarget);
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (activeTouchesRef && e.pointerType === "touch" && activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.set(e.pointerId, { x: point.x, y: point.y });
      const pinch = pinchRef?.current;
      if (pinch && pinchRef && activeTouchesRef.current.size >= 2) {
        const pts = [...activeTouchesRef.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (pinch.dist > 0 && dist > 0) {
          releaseCameraForZoom();
          const { width, height } = viewportRef.current;
          const cam = cameraRef.current;
          const spread = Math.pow(dist / pinch.dist, navigationSpeedRef.current.zoom);
          const newScale = scaleWithinZoomBounds(tokens, cam.scale.value * spread);
          const worldAtPrevMidX = (pinch.midX - width / 2) / cam.scale.value + cam.x.value;
          const worldAtPrevMidY = (pinch.midY - height / 2) / cam.scale.value + cam.y.value;
          const afterX = worldAtPrevMidX - (midX - width / 2) / newScale;
          const afterY = worldAtPrevMidY - (midY - height / 2) / newScale;
          cameraTargetRef.current = { tx: afterX, ty: afterY, tscale: newScale };
          cameraRef.current = {
            x: { value: afterX, velocity: 0 },
            y: { value: afterY, velocity: 0 },
            scale: { value: newScale, velocity: 0 },
          };
          noteUserCameraGesture();
          dampingRef.current = tokens.cameraDampingDefault;
          cameraAngularFreqRef.current = tokens.cameraSpringAngFreqInteractive;
        }
        pinchRef.current = { dist, midX, midY };
        return;
      }
    }
    // Stuck-drag guard (QA loss B fallback): a button-less move during an
    // active gesture means we missed the real `pointerup` (capture unsupported
    // or interrupted). Treat it as that pointerup — the stationary-release path
    // holds the camera exactly where it is — and let the NEXT move resume as a
    // plain hover on the now-idle machine.
    if (pointerMachineRef.current.phase !== "idle" && e.buttons === 0) {
      handlePointerUp();
      return;
    }
    const pressed = pointerMachineRef.current;
    if (pressed.phase === "pressed" && pressed.downPoint && hitDialAction(pressed.downPoint.x, pressed.downPoint.y)) {
      if (Math.hypot(point.x - pressed.downPoint.x, point.y - pressed.downPoint.y) > tokens.hysteresisPx)
        pointerMachineRef.current = transitionPointerState(pressed, { type: "pointercancel" }, tokens.hysteresisPx).next;
      e.currentTarget.style.cursor = hitDialAction(point.x, point.y) ? "pointer" : "grab";
      return;
    }
    // Capture the pressed node BEFORE the transition — the pressed→dragging
    // transition clears `pressedNodeId`, but we need it to know whether this
    // drag grabbed a node (pin-drag) or empty space (camera pan).
    const pressedNodeId = pointerMachineRef.current.pressedNodeId;
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointermove", point }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
    if (next.phase === "dragging") {
      const sim = simRef.current;
      const { width, height } = viewportRef.current;
      // Start a node pin-drag the moment we cross into dragging on a node.
      if (nodeDragRef.current === null && pressedNodeId !== null && sim?.hasNode(pressedNodeId)) {
        const grabNode = world.nodeById.get(pressedNodeId);
        if (grabNode) {
          const pw = screenToWorld(cameraRef.current, width, height, point.x, point.y);
          const offset = computeGrabOffsetWorld(grabNode.x, grabNode.y, pw.x, pw.y);
          sim.pin(pressedNodeId, grabNode.x, grabNode.y);
          nodeDragRef.current = { nodeId: pressedNodeId, offset };
          heatRef.current = NODE_DRAG_HEAT_MS;
          // C1 B1/B2 — capture the tug/settle-restriction set + start position
          // once, at grab time (not recomputed per frame).
          const tugSets = computeDragTugSets(world.neighborMap, pressedNodeId);
          dragAffectedSetRef.current = { draggedId: pressedNodeId, oneHop: tugSets.oneHop, twoHop: tugSets.twoHop };
          dragStartPosRef.current = { x: grabNode.x, y: grabNode.y };
        }
      }
      // Active node pin-drag: move the pin 1:1 in world space, keep the sim
      // warm so neighbors reflow. The camera does NOT pan (headline fix — a
      // node drag moves the NODE, not the whole viewport).
      clearEdgeHover(); // Stop a card lingering mid-drag.
      clearClusterHover();
      const drag = nodeDragRef.current;
      if (drag && sim) {
        const pw = screenToWorld(cameraRef.current, width, height, point.x, point.y);
        const pin = computePinWorld(pw.x, pw.y, drag.offset);
        sim.movePin(pin.x, pin.y);
        heatRef.current = NODE_DRAG_HEAT_MS;
        // rank4 — the "grabbing" cursor while a node is held and moved (pure CSS).
        // Releasing restores it on pointerup/cancel.
        e.currentTarget.style.cursor = "grabbing";
        return;
      }
      // `grabbing` while pushing — the same response as a node drag (the branch
      // above), so "something is in my hand right now" reads as the same word in both cases.
      e.currentTarget.style.cursor = "grabbing";
      const dragSpeed = navigationSpeedRef.current.drag;
      const previous = dragHistoryRef.current[dragHistoryRef.current.length - 1]
        ?? next.downPoint
        ?? point;
      const scale = cameraRef.current.scale.value;
      const worldDX = ((point.x - previous.x) * dragSpeed) / scale;
      const worldDY = ((point.y - previous.y) * dragSpeed) / scale;
      const nextX = cameraRef.current.x.value - worldDX;
      const nextY = cameraRef.current.y.value - worldDY;
      cameraRef.current = { ...cameraRef.current, x: { value: nextX, velocity: 0 }, y: { value: nextY, velocity: 0 } };
      cameraTargetRef.current = { ...cameraTargetRef.current, tx: nextX, ty: nextY };
      noteUserCameraGesture();
      dragHistoryRef.current.push({ x: point.x, y: point.y, t: performance.now() });
      if (dragHistoryRef.current.length > 10)
        dragHistoryRef.current.shift();
      return;
    }
    // A drag (pan or node move) already returned in the block above, so only
    // idle|pressed reaches here. Edge hover works during focus (ego) too — an edge
    // click (P3b) works during focus, so hover has to match ("if you can grab it you
    // can read it"; the root of the user report "With a node clicked, the edge hover tooltip does not appear"). The
    // candidates already reflect the focus tier's hit rules via buildEdgeCandidates.
    if (hitDialAction(point.x, point.y)) {
      e.currentTarget.style.cursor = "pointer";
      hoveredNodeIdRef.current = null;
      clearEdgeHover();
      clearClusterHover();
      return;
    }
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    // Edge proximity at a node-miss point is a hover card, firing only when the edge identity changes;
    // a node hit clears it. Computed outside the hover block because the cursor decision also uses it.
    const edgeHit = hitNodeId === null && hoveredEdgeRef && onHoverEdge
      ? hitTestEdges(buildEdgeCandidates(), point.x, point.y, 6)
      : null;
    if (hoveredEdgeRef && onHoverEdge) {
      const prev = hoveredEdgeRef.current;
      const sameEdge = edgeHit !== null &&
        prev !== null &&
        prev.sourceId === edgeHit.sourceId &&
        prev.targetId === edgeHit.targetId &&
        prev.relationType === edgeHit.relationType;
      if (!sameEdge && (edgeHit !== null || prev !== null)) {
        const payload = edgeHit
          ? {
            sourceId: edgeHit.sourceId,
            targetId: edgeHit.targetId,
            relationType: edgeHit.relationType,
            declaredBySlug: edgeHit.declaredBySlug,
          }
          : null;
        hoveredEdgeRef.current = payload;
        onHoverEdge(payload, payload
          ? {
            x: e.clientX,
            y: e.clientY,
            avoid: collectHoverAvoidRects(world, cameraRef.current, viewportRef.current.width, viewportRef.current.height, tokens, clusteredIdsRef?.current ?? null, { x: e.clientX - point.x, y: e.clientY - point.y }, point),
          }
          : null);
      }
    }
    // Cursor follows each surface's primary action: node, edge, chip use `pointer`; background `grab`.
    // Assigned outside the hover block so a consumer without edge-hover wiring still gets a cursor.
    e.currentTarget.style.cursor =
      hitNodeId !== null || edgeHit !== null ? "pointer" : "grab";
    // Density gate — cluster chip hover: cursor pointer plus a border emphasis mirror
    // (node-miss points only; the node wins). The node-click = ego-focus contract is
    // unchanged, and a chip stands in the empty space its children left, so they only
    // overlap here.
    if (hoveredClusterIdRef) {
      const chipHit = hitNodeId === null ? hitTestClusterChip(point.x, point.y) : null;
      if (hoveredClusterIdRef.current !== chipHit) {
        hoveredClusterIdRef.current = chipHit;
        // S2 part 5C — the tooltip fires only when the hover target changes (stability).
        // A chip hit clears the edge hover immediately (both live in empty space and can
        // overlap — the chip wins).
        if (onHoverCluster) {
          if (chipHit === null || chipHit === EGO_NEIGHBOR_CHIP_ID) {
            // An ego `Neighbor +N` chip has no parent title, so no tooltip is raised (cursor and border only).
            onHoverCluster(null);
          }
          else {
            clearEdgeHover();
            const chip = clusterChipsRef?.current?.find((c) => c.parentId === chipHit);
            if (chip) {
              // High-fanout batch reveal — a `+N More` chip has a synthetic id, so it
              // is resolved to the real parent for the tooltip to find the parent's
              // title and descendant count (reusing the existing collapsed-tooltip copy —
              // "Collapsed N · All Descendants M", no new i18n). expanded is already false (a
              // collapsed pill), so the collapsed wording appears.
              const realParent = parseClusterMoreChipId(chip.parentId) ?? chip.parentId;
              onHoverCluster({
                parentId: realParent,
                count: chip.count,
                // Panel3-S6 — the parent's total descendant count (the same source as the
                // node badge, `WorldNode.count` = descendantCount), looked up in the live world.
                descendantTotal: world.nodeById.get(realParent)?.count ?? chip.count,
                expanded: chip.expanded,
                position: { x: e.clientX, y: e.clientY },
              });
            }
          }
        }
      }
      if (chipHit !== null)
        e.currentTarget.style.cursor = "pointer";
    }
    if (next.phase !== "idle" || focusedSlugRef.current)
      return; // The ripple is idle plus unfocused only (existing contract).
    if (hitNodeId === hoveredNodeIdRef.current)
      return;
    hoveredNodeIdRef.current = hitNodeId;
    if (hitNodeId) {
      const neighborIds = [...(world.neighborMap.get(hitNodeId) ?? [])];
      const schedule = scheduleRipple(hitNodeId, performance.now(), neighborIds, tokens.rippleStaggerMs, RIPPLE_PER_NEIGHBOR_DELAY_MS, tokens.rippleStaggerMaxMs);
      for (const entry of schedule)
        rippleStartRef.current.set(entry.nodeId, entry.startAtMs);
    }
  };
  return handlePointerMove;
}
