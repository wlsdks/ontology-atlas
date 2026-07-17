/**
 * Pointer/wheel event handlers — the click-safe contract
 * (`interaction/pointer-state-machine.ts`) plus camera pan/zoom/flick
 * (`engine/momentum.ts`, prototype §9 `pointerdown`/`pointermove`/
 * `releaseDrag()`/`wheel`). Split out of `use-topology-loop.ts` to keep both
 * files under the 300-line budget — `Ref<T>` here is any mutable box the
 * hook owns (`useRef`'s `.current`), not necessarily React's own ref type.
 */

import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

import type { CameraAxes, CameraTarget } from "../engine/camera";
import { projectFlickLanding } from "../engine/momentum";
import { scheduleRipple } from "../model/focus-state";
import {
  INITIAL_POINTER_MACHINE_STATE,
  transitionPointerState,
  type PointerMachineState,
} from "../interaction/pointer-state-machine";
import { hitTestWorld } from "./topology-camera-math";
import { readTopologyV2TokensOrNull } from "./topology-read-tokens";
import type { TopologyWorld } from "./topology-world";

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
  focusedSlugRef: Ref<string | null>;
  hoveredNodeIdRef: Ref<string | null>;
  rippleStartRef: Ref<Map<string, number>>;
  reducedMotionRef: Ref<boolean>;
  onSelect?: (slug: string) => void;
  onPaneClick?: () => void;
}

export interface TopologyPointerHandlers {
  handlePointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: () => void;
  handlePointerCancel: () => void;
  handleWheel: (e: ReactWheelEvent<HTMLCanvasElement>) => void;
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
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    reducedMotionRef,
    onSelect,
    onPaneClick,
  } = refs;

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hitNodeId = hitTestWorld(world, cameraRef.current, viewportRef.current.width, viewportRef.current.height, tokens, point.x, point.y);
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointerdown", point, hitNodeId }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
    camStartAtDownRef.current = { x: cameraRef.current.x.value, y: cameraRef.current.y.value };
    dragHistoryRef.current = [{ x: point.x, y: point.y, t: performance.now() }];
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointermove", point }, tokens.hysteresisPx);
    pointerMachineRef.current = next;

    if (next.phase === "dragging") {
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
    const hitNodeId = hitTestWorld(world, cameraRef.current, viewportRef.current.width, viewportRef.current.height, tokens, point.x, point.y);
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
      cameraTargetRef.current = { tx: px.landingTarget, ty: py.landingTarget, tscale: cameraTargetRef.current.tscale };
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
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) {
      pointerMachineRef.current = INITIAL_POINTER_MACHINE_STATE;
      return;
    }
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointercancel" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
  };

  const handleWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    const { width, height } = viewportRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const camera = cameraRef.current;
    const beforeX = (sx - width / 2) / camera.scale.value + camera.x.value;
    const beforeY = (sy - height / 2) / camera.scale.value + camera.y.value;
    const factor = Math.exp(-e.deltaY * 0.0016);
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
