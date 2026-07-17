/**
 * Pointer/wheel event handlers — the click-safe contract
 * (`interaction/pointer-state-machine.ts`) plus camera pan/zoom/flick
 * (`engine/momentum.ts`, prototype §9 `pointerdown`/`pointermove`/
 * `releaseDrag()`/`wheel`). Split out of `use-topology-loop.ts` to keep both
 * files under the 300-line budget — `Ref<T>` here is any mutable box the
 * hook owns (`useRef`'s `.current`), not necessarily React's own ref type.
 *
 * FIX (QA first-light pass, blocker 1 — "drag makes everything vanish"):
 * `projectFlickLanding`'s landing target grows unboundedly with flick speed
 * (its own test pins -14870 world units for a routine 0.5px/ms flick at
 * scale=1) — `handlePointerUp` now clamps that target into the world's own
 * pan bounds (`engine/camera.ts#computePanBounds`) before handing it to the
 * spring, so a fast flick still glides but can never strand the camera
 * outside the graph's content. `stepCamera`'s own per-frame elastic clamp
 * (`clampAxisToPanBounds`) alone was not enough — the spring's restoring
 * force toward a fixed, far-away target outpaces a flat 14%/frame pull-back
 * (verified manually via chrome-devtools: the camera was still lost 5+
 * seconds after release without this).
 */

import type { PointerEvent as ReactPointerEvent } from "react";

import { clampPointToPanBounds, computePanBounds, type CameraAxes, type CameraTarget } from "../engine/camera";
import { projectFlickLanding } from "../engine/momentum";
import { computeAltitudeBand, computeFarT } from "../model/altitude";
import { scheduleRipple } from "../model/focus-state";
import type { ForceSimulation } from "../model/force-layout";
import { DEFAULT_TIER_REVEAL, nodeTierAlpha } from "../model/tier-visibility";
import { computeGrabOffsetWorld, computePinWorld, type WorldOffset } from "../interaction/node-drag";
import {
  INITIAL_POINTER_MACHINE_STATE,
  transitionPointerState,
  type PointerMachineState,
} from "../interaction/pointer-state-machine";
import { normalizeWheelDeltaY } from "../interaction/wheel";
import { hitTestWorld, screenToWorld } from "./topology-camera-math";
import { readTopologyV2TokensOrNull } from "./topology-read-tokens";
import type { TopologyWorld } from "./topology-world";

/** Frames of sim warmth to top up while a node is actively pin-dragged (kept warm so neighbors keep reflowing). */
export const NODE_DRAG_HEAT_FRAMES = 20;
/** A settle burst after a node is released so the graph (and the dropped node) relaxes around the drop, Obsidian-style. */
export const NODE_RELEASE_HEAT_FRAMES = 90;
/** Minimum tier alpha for a node to be grabbable/hoverable — hidden (semantic-zoom-gated) nodes must not be hit. */
const HITTABLE_MIN_TIER_ALPHA = 0.5;

/** Active node-drag: which node is pinned + the world-space grab offset (respects where inside the node it was grabbed). */
export interface NodeDragState {
  nodeId: string;
  offset: WorldOffset;
}

/** Prototype `startRipple()` — the +12ms/neighbor stagger has no separate token (design doc §2.4). */
const RIPPLE_PER_NEIGHBOR_DELAY_MS = 12;

interface Ref<T> {
  current: T;
}

export interface PointerHandlerRefs {
  worldRef: Ref<TopologyWorld | null>;
  cameraRef: Ref<CameraAxes>;
  cameraTargetRef: Ref<CameraTarget>;
  dampingRef: Ref<number>;
  viewportRef: Ref<{ width: number; height: number; dpr: number }>;
  pointerMachineRef: Ref<PointerMachineState>;
  dragHistoryRef: Ref<{ x: number; y: number; t: number }[]>;
  camStartAtDownRef: Ref<{ x: number; y: number }>;
  /**
   * Cached canvas bounding rect. `getBoundingClientRect()` forces a synchronous
   * layout/reflow; calling it on every `pointermove` was a per-drag-frame
   * reflow (a real source of the owner-reported "pan is janky"). We snapshot it
   * once at `pointerdown` and reuse it for the whole gesture instead.
   */
  canvasRectRef: Ref<{ left: number; top: number } | null>;
  focusedSlugRef: Ref<string | null>;
  hoveredNodeIdRef: Ref<string | null>;
  rippleStartRef: Ref<Map<string, number>>;
  reducedMotionRef: Ref<boolean>;
  /** The live force simulation (`model/force-layout.ts`) — pin/movePin/clearPin during node-drag. Null before the world is built. */
  simRef: Ref<ForceSimulation | null>;
  /** Frames of remaining sim warmth — the rAF loop ticks the sim while > 0 (or while a node is pinned). Bumped by node-drag. */
  heatRef: Ref<number>;
  /** Active node pin-drag, or null when the drag is a camera pan / no drag. */
  nodeDragRef: Ref<NodeDragState | null>;
  /** The altitude band's "100%" fit scale — used to derive farT for tier-aware (visible-only) hit-testing. */
  overviewScaleRef: Ref<number>;
  onSelect?: (slug: string) => void;
  onPaneClick?: () => void;
}

export interface TopologyPointerHandlers {
  handlePointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: () => void;
  handlePointerCancel: () => void;
  /**
   * FIX (QA first-light pass — console error sweep): takes a native
   * `WheelEvent`, not React's synthetic `WheelEvent<...>`. React attaches its
   * delegated `wheel` listener as passive by default, so a JSX `onWheel`
   * prop calling `e.preventDefault()` logs "Unable to preventDefault inside
   * passive event listener invocation" on every scroll/pinch and silently
   * fails to stop the page from also scrolling underneath the canvas
   * (reproduced via chrome-devtools: 37 warnings from one zoom gesture).
   * `use-topology-loop.ts` now attaches this via a native, explicitly
   * `{ passive: false }` listener instead of the JSX prop.
   */
  handleWheel: (e: WheelEvent) => void;
}

/** Builds the five pointer/wheel handlers, closing over the hook's refs (cheap — plain closures, no hook rules to satisfy). */
export function createTopologyPointerHandlers(refs: PointerHandlerRefs): TopologyPointerHandlers {
  const {
    worldRef,
    cameraRef,
    cameraTargetRef,
    dampingRef,
    viewportRef,
    pointerMachineRef,
    dragHistoryRef,
    camStartAtDownRef,
    canvasRectRef,
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    reducedMotionRef,
    simRef,
    heatRef,
    nodeDragRef,
    overviewScaleRef,
    onSelect,
    onPaneClick,
  } = refs;

  /**
   * Tier-aware hit test — only nodes currently visible at this altitude
   * (`model/tier-visibility.ts`) can be grabbed/hovered, so the pointer never
   * grabs an invisible semantic-zoom-gated capability/element.
   */
  const hitVisibleNode = (
    world: TopologyWorld,
    camera: CameraAxes,
    tokens: ReturnType<typeof readTopologyV2TokensOrNull>,
    px: number,
    py: number,
  ): string | null => {
    if (!tokens) return null;
    const band = computeAltitudeBand(overviewScaleRef.current, tokens.altitudeFarHighRatio, tokens.altitudeFarLowRatio);
    const farT = computeFarT(camera.scale.value, band.farLow, band.farHigh);
    return hitTestWorld(
      world,
      camera,
      viewportRef.current.width,
      viewportRef.current.height,
      tokens,
      px,
      py,
      (node) => nodeTierAlpha(node.kind, node.isHub, farT, DEFAULT_TIER_REVEAL) >= HITTABLE_MIN_TIER_ALPHA,
    );
  };

  /** Reuse the cached rect during a gesture; refresh lazily if we somehow don't have one yet. */
  const currentRect = (el: HTMLCanvasElement): { left: number; top: number } => {
    const cached = canvasRectRef.current;
    if (cached) return cached;
    const rect = el.getBoundingClientRect();
    const snapshot = { left: rect.left, top: rect.top };
    canvasRectRef.current = snapshot;
    return snapshot;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
    // Snapshot the rect once per gesture (see `canvasRectRef` JSDoc).
    const domRect = e.currentTarget.getBoundingClientRect();
    canvasRectRef.current = { left: domRect.left, top: domRect.top };
    const rect = canvasRectRef.current;
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointerdown", point, hitNodeId }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
    camStartAtDownRef.current = { x: cameraRef.current.x.value, y: cameraRef.current.y.value };
    dragHistoryRef.current = [{ x: point.x, y: point.y, t: performance.now() }];
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
    const rect = currentRect(e.currentTarget);
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

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
          heatRef.current = NODE_DRAG_HEAT_FRAMES;
        }
      }

      // Active node pin-drag: move the pin 1:1 in world space, keep the sim
      // warm so neighbors reflow. The camera does NOT pan (headline fix — a
      // node drag moves the NODE, not the whole viewport).
      const drag = nodeDragRef.current;
      if (drag && sim) {
        const pw = screenToWorld(cameraRef.current, width, height, point.x, point.y);
        const pin = computePinWorld(pw.x, pw.y, drag.offset);
        sim.movePin(pin.x, pin.y);
        heatRef.current = NODE_DRAG_HEAT_FRAMES;
        return;
      }

      const anchor = next.downPoint ?? point;
      const worldDX = (point.x - anchor.x) / cameraRef.current.scale.value;
      const worldDY = (point.y - anchor.y) / cameraRef.current.scale.value;
      const nextX = camStartAtDownRef.current.x - worldDX;
      const nextY = camStartAtDownRef.current.y - worldDY;
      // 1:1 tracking, no lag — drag follows the pointer directly, the spring
      // only takes back over once the flick is released (`engine/momentum.ts`).
      cameraRef.current = { ...cameraRef.current, x: { value: nextX, velocity: 0 }, y: { value: nextY, velocity: 0 } };
      cameraTargetRef.current = { ...cameraTargetRef.current, tx: nextX, ty: nextY };
      dragHistoryRef.current.push({ x: point.x, y: point.y, t: performance.now() });
      if (dragHistoryRef.current.length > 6) dragHistoryRef.current.shift();
      return;
    }

    if (next.phase !== "idle" || focusedSlugRef.current) return; // pressed-not-dragging, or focus owns emphasis
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    if (hitNodeId === hoveredNodeIdRef.current) return;
    hoveredNodeIdRef.current = hitNodeId;
    if (hitNodeId) {
      const neighborIds = [...(world.neighborMap.get(hitNodeId) ?? [])];
      const schedule = scheduleRipple(hitNodeId, performance.now(), neighborIds, tokens.rippleStaggerMs, RIPPLE_PER_NEIGHBOR_DELAY_MS);
      for (const entry of schedule) rippleStartRef.current.set(entry.nodeId, entry.startAtMs);
    }
  };

  const handlePointerUp = () => {
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    const wasDragging = pointerMachineRef.current.phase === "dragging";
    const { next, commitClick } = transitionPointerState(pointerMachineRef.current, { type: "pointerup" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;

    // Node pin-drag release: unpin and give the graph a settle burst so it
    // (and the dropped node) relaxes around the drop, Obsidian-style. No
    // camera flick, no click commit (the state machine already suppressed the
    // click for a drag).
    if (nodeDragRef.current !== null) {
      simRef.current?.clearPin();
      nodeDragRef.current = null;
      heatRef.current = Math.max(heatRef.current, NODE_RELEASE_HEAT_FRAMES);
      return;
    }

    if (wasDragging) {
      const history = dragHistoryRef.current;
      const first = history[0];
      const last = history[history.length - 1];
      const dtMs = first && last ? Math.max(1, last.t - first.t) : 16;
      const vx = first && last ? (last.x - first.x) / dtMs : 0;
      const vy = first && last ? (last.y - first.y) / dtMs : 0;

      if (reducedMotionRef.current) {
        cameraTargetRef.current = { tx: cameraRef.current.x.value, ty: cameraRef.current.y.value, tscale: cameraTargetRef.current.tscale };
        return;
      }
      const px = projectFlickLanding({
        velocityPxPerMs: vx,
        cameraPosition: cameraRef.current.x.value,
        cameraScale: cameraRef.current.scale.value,
        decay: tokens.cameraMomentumDecay,
      });
      const py = projectFlickLanding({
        velocityPxPerMs: vy,
        cameraPosition: cameraRef.current.y.value,
        cameraScale: cameraRef.current.scale.value,
        decay: tokens.cameraMomentumDecay,
      });
      // The raw landing target can be thousands of world units past the
      // graph's own content (see file header) — clamp it into the world's
      // pan bounds before handing it to the spring so a fast flick still
      // glides but never strands the camera in blank canvas.
      const world = worldRef.current;
      const clampedLanding = world
        ? clampPointToPanBounds(px.landingTarget, py.landingTarget, computePanBounds(world.bounds))
        : { x: px.landingTarget, y: py.landingTarget };
      cameraTargetRef.current = { tx: clampedLanding.x, ty: clampedLanding.y, tscale: cameraTargetRef.current.tscale };
      cameraRef.current = {
        ...cameraRef.current,
        x: { value: cameraRef.current.x.value, velocity: px.worldVelocity },
        y: { value: cameraRef.current.y.value, velocity: py.worldVelocity },
      };
      dampingRef.current = tokens.cameraDampingFlick;
      return;
    }

    if (!commitClick) return;
    if (commitClick.nodeId === null) {
      if (focusedSlugRef.current) onPaneClick?.();
    } else if (commitClick.nodeId === focusedSlugRef.current) {
      onPaneClick?.();
    } else {
      onSelect?.(commitClick.nodeId);
    }
  };

  const handlePointerCancel = () => {
    // Abort any in-flight node pin-drag cleanly (release the pin, let it settle).
    if (nodeDragRef.current !== null) {
      simRef.current?.clearPin();
      nodeDragRef.current = null;
      heatRef.current = Math.max(heatRef.current, NODE_RELEASE_HEAT_FRAMES);
    }
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) {
      pointerMachineRef.current = INITIAL_POINTER_MACHINE_STATE;
      return;
    }
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointercancel" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    const { width, height } = viewportRef.current;
    const rect = currentRect(e.currentTarget as HTMLCanvasElement);
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const camera = cameraRef.current;
    const beforeX = (sx - width / 2) / camera.scale.value + camera.x.value;
    const beforeY = (sy - height / 2) / camera.scale.value + camera.y.value;
    // Normalize deltaMode first — a line/page-mode wheel reports a tiny raw
    // deltaY that the old `exp(-deltaY*0.0016)` turned into ~0% zoom (the
    // owner's "휠 확대 안 됨" bug). See `interaction/wheel.ts`.
    const pixelDeltaY = normalizeWheelDeltaY(e.deltaY, e.deltaMode, height);
    const factor = Math.exp(-pixelDeltaY * 0.0016);
    const newScale = Math.min(tokens.cameraScaleMax, Math.max(tokens.cameraScaleMin, camera.scale.value * factor));
    const afterX = beforeX - (sx - width / 2) / newScale;
    const afterY = beforeY - (sy - height / 2) / newScale;

    cameraTargetRef.current = { tx: afterX, ty: afterY, tscale: newScale };
    dampingRef.current = tokens.cameraDampingDefault;
    if (reducedMotionRef.current) {
      cameraRef.current = { x: { value: afterX, velocity: 0 }, y: { value: afterY, velocity: 0 }, scale: { value: newScale, velocity: 0 } };
    }
  };

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleWheel };
}
