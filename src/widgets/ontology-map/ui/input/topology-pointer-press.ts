import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { isInsideDomeGrip } from "../../model/dome-view/projection";
import { transitionPointerState } from "../../interaction/pointer-state-machine";
import { screenToWorld } from "../camera/topology-camera-math";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import type { PointerContext } from "./topology-pointer-context";
import type { PointerHitTests } from "./topology-pointer-hit-tests";
import type { TopologyPointerHandlers } from "./topology-pointer-types";

export function createPointerPressHandlers(
  ctx: PointerContext,
  hits: PointerHitTests,
  handlePointerCancel: TopologyPointerHandlers["handlePointerCancel"],
): Pick<TopologyPointerHandlers, "handlePointerDown" | "handleContextMenu"> {
  const {
    zoomEaseRef, worldRef, cameraRef, cameraTargetRef, cameraTweenRef, dampingRef, viewportRef,
    pointerMachineRef, dragHistoryRef, camStartAtDownRef, canvasRectRef, activeTouchesRef, pinchRef,
    domeGripRef, onContextMenuNode, onContextMenuPane, domeInteractive, currentRect,
  } = ctx;

  const { hitVisibleNode } = hits;

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // Only the primary button presses the map; the secondary button only opens the context menu
    // (`handleContextMenu`).
    if (e.button !== undefined && e.button !== 0)
      return;
    const tokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world)
      return;
    if (cameraTweenRef)
      cameraTweenRef.current = null;
    {
      const cam = cameraRef.current;
      if (zoomEaseRef.current !== null) {
        zoomEaseRef.current = null;
        cameraTargetRef.current = { tx: cam.x.value, ty: cam.y.value, tscale: cam.scale.value };
      }
      if (cam.x.velocity !== 0 || cam.y.velocity !== 0) {
        cameraRef.current = { ...cam, x: { value: cam.x.value, velocity: 0 }, y: { value: cam.y.value, velocity: 0 } };
        cameraTargetRef.current = { ...cameraTargetRef.current, tx: cam.x.value, ty: cam.y.value };
        dampingRef.current = tokens.cameraDampingDefault;
      }
    }
    // Capture the pointer for the whole gesture, else releasing outside the canvas never delivers
    // `pointerup` and the state machine sticks in `dragging`. Release on up/cancel is automatic.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    catch {
    }
    // Snapshot the rect once per gesture (see `canvasRectRef` JSDoc).
    const domRect = e.currentTarget.getBoundingClientRect();
    canvasRectRef.current = { left: domRect.left, top: domRect.top };
    const rect = canvasRectRef.current;
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // rank4 touch pinch zoom — register the touch pointer. The instant a second finger
    // lands, any single-finger gesture in flight (press or pan) is cancelled without
    // committing a click and switches to pinch (putting two fingers down must not
    // select a node). A third or further finger is ignored — pinch reads only the first
    // two pointers' coordinates (Map insertion order is preserved).
    if (activeTouchesRef && e.pointerType === "touch") {
      activeTouchesRef.current.set(e.pointerId, { x: point.x, y: point.y });
      if (activeTouchesRef.current.size === 2 && pinchRef) {
        handlePointerCancel();
        const pts = [...activeTouchesRef.current.values()];
        pinchRef.current = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2,
        };
        return; // No machine transition — this gesture is camera-only.
      }
      if (activeTouchesRef.current.size > 2)
        return;
    }
    // 3D — catch any orbit momentum in flight immediately (the same iOS contract as
    // the camera flick catch). The act of catching *is* «stop right here».
    {
      const dome = domeInteractive();
      if (dome) {
        dome.yawVel = 0;
        // Drop the landing aim too — new input and an explicit reset always win.
        dome.yawSnap = null;
        dome.pitchVel = 0;
        // A programmatic pose move in flight ("Return to Origin" or a selection reframe) is
        // dropped here too — the same contract as pointerdown dropping the camera
        // tween: the gesture takes over immediately from the current pose (④'s
        // interruptibility requirement).
        dome.poseTween = null;
        // Sync the smoothing target to the current pose, so the «stop right here» of
        // the catch does not slide on the remaining target gap.
        dome.yawTarget = dome.yaw;
        dome.pitchTarget = dome.pitch;
      }
    }
    /*
     * 3D — **whether this drag is a rotation or a move is decided once, here.**
     *
     * Deciding per move flips the gesture's identity the moment the hand grazes the
     * dome's boundary (you are rotating and suddenly the map comes along). A
     * gesture's identity is fixed at the start and unchanged until the end — the
     * convention the pointer state machine already uses. The rule and its rationale:
     * the `DOME_GRIP_MARGIN` doc-block in `model/dome-view/`.
     */
    {
      const dome = domeInteractive();
      if (dome === null) {
        domeGripRef.current = false;
      }
      else {
        const view = viewportRef.current;
        const pw = screenToWorld(cameraRef.current, view.width, view.height, point.x, point.y);
        domeGripRef.current = isInsideDomeGrip(dome.drawnBounds, pw.x, pw.y);
      }
    }
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointerdown", point, hitNodeId }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
    camStartAtDownRef.current = { x: cameraRef.current.x.value, y: cameraRef.current.y.value };
    dragHistoryRef.current = [{ x: point.x, y: point.y, t: performance.now() }];
  };

  // W2-B — right-click reuses the SAME tier-aware hit test as pointerdown
  // (`hitVisibleNode`), so the menu only opens over nodes actually hittable
  // at the current altitude/focus (never a semantic-zoom-hidden one). The
  // browser's own context menu is prevented ONLY on that hit path — an
  // off-node right-click (empty canvas) falls through untouched, so users can
  // still reach the OS/browser menu there.
  const handleContextMenu = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const tokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world || (!onContextMenuNode && !onContextMenuPane))
      return;
    const rect = currentRect(e.currentTarget);
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    if (!hitNodeId) {
      // Empty space — "Create a concept here" (create a concept here). With no consumer it is a no-op, as before.
      if (!onContextMenuPane)
        return;
      e.preventDefault();
      onContextMenuPane({ x: e.clientX, y: e.clientY });
      return;
    }
    if (!onContextMenuNode)
      return;
    e.preventDefault();
    onContextMenuNode(hitNodeId, { x: e.clientX, y: e.clientY });
  };
  return { handlePointerDown, handleContextMenu };
}
