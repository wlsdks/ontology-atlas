"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { MapNavigationSpeed } from "@/shared/lib/preferences/map-navigation-speed-preferences";
import { listenForGesturePinch } from "../../interaction/gesture-pinch";
import { computeWheelZoomFactor, createPinchWheelStream, normalizeWheelDeltaY, readPinchWheel, shouldIgnoreWheelGlide } from "../../interaction/wheel";
import { pickTreeMark } from "../../model/tree-view/tree-pick";
import type { TreeDrawList, TreeDrawMark, TreeLayout, TreeProjector } from "../../model/tree-view/tree-shapes";
import type { TreeTokens } from "../../tokens/read-tree-tokens";
import type { TreeMotion } from "./use-tree-motion";

/** A press that moves further than this (CSS px) turns the tree instead of clicking. */
const DRAG_THRESHOLD_PX = 4;
/** Pointer samples kept for the release speed; the window token decides which count. */
const RELEASE_SAMPLES = 8;

/** The release-speed window and the least flick speed, the flat map's camera tokens. */
function readFlickTokens(): { windowMs: number; minSpeedPxPerMs: number } {
  if (typeof document === "undefined") return { windowMs: 0, minSpeedPxPerMs: Infinity };
  const style = window.getComputedStyle(document.documentElement);
  const windowMs = Number.parseFloat(style.getPropertyValue("--map-camera-release-velocity-window-ms"));
  const minSpeedPxPerMs = Number.parseFloat(style.getPropertyValue("--map-camera-flick-min-speed"));
  return Number.isFinite(windowMs) && Number.isFinite(minSpeedPxPerMs) ? { windowMs, minSpeedPxPerMs } : { windowMs: 0, minSpeedPxPerMs: Infinity };
}

/** The pointer's last horizontal positions in a ring, for the speed it lets go at. */
class PointerTrail {
  private readonly x = new Float64Array(RELEASE_SAMPLES);
  private readonly t = new Float64Array(RELEASE_SAMPLES);
  private count = 0;

  private readonly flick: { windowMs: number; minSpeedPxPerMs: number };

  constructor(flick: { windowMs: number; minSpeedPxPerMs: number }) {
    this.flick = flick;
  }

  restart(x: number, nowMs: number): void {
    this.count = 0;
    this.add(x, nowMs);
  }

  add(x: number, nowMs: number): void {
    const at = this.count % RELEASE_SAMPLES;
    this.x[at] = x;
    this.t[at] = nowMs;
    this.count += 1;
  }

  /** Horizontal speed over the release window, px/ms; 0 when it is no flick. */
  flickSpeed(nowMs: number): number {
    if (this.count < 2) return 0;
    const last = (this.count - 1) % RELEASE_SAMPLES;
    let first = last;
    for (let k = 1; k < Math.min(this.count, RELEASE_SAMPLES); k += 1) {
      const at = (this.count - 1 - k) % RELEASE_SAMPLES;
      if (this.t[at]! < nowMs - this.flick.windowMs) break;
      first = at;
    }
    if (first === last) return 0;
    const speed = (this.x[last]! - this.x[first]!) / Math.max(1, this.t[last]! - this.t[first]!);
    return Math.abs(speed) < this.flick.minSpeedPxPerMs ? 0 : speed;
  }
}

/** The drawn mark of `node`, or null. O(m). */
export function treeMarkOf(list: TreeDrawList, node: number): TreeDrawMark | null {
  for (let i = 0; i < list.count; i += 1) if (list.marks[i]!.node === node) return list.marks[i]!;
  return null;
}

/** A concept's mark, or a closed mark of any node: the id-less trunk and open forks are not hoverable. */
export function treeHoverable(layout: TreeLayout, list: TreeDrawList, node: number): boolean {
  if (node < 0) return false;
  return layout.model.ids[node] != null || treeMarkOf(list, node)?.closed === true;
}

/** Least spacing between `node`'s children in world units; a lone child's is its branch length. */
function childSpacingOf(layout: TreeLayout, node: number): number {
  const pitch = layout.childPitch[node]!;
  if (pitch > 0) return pitch;
  const { position } = layout;
  const a = node * 3;
  const b = (node + 1) * 3;
  return Math.hypot(position[b]! - position[a]!, position[b + 1]! - position[a + 1]!, position[b + 2]! - position[a + 2]!);
}

export interface TreeInputSources {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  motion: TreeMotion;
  layout: TreeLayout | null;
  list: RefObject<TreeDrawList>;
  projector: RefObject<TreeProjector>;
  tokens: TreeTokens | null;
  selectedNode: number;
  navigationSpeed: MapNavigationSpeed;
  /** A concept chosen on the canvas. */
  onPick: (node: number) => void;
  onPaneClick?: () => void;
  onHover: (node: number) => void;
}

export interface TreeInputHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: () => void;
}

interface Press {
  id: number;
  x: number;
  y: number;
  dragging: boolean;
}

const local = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

/**
 * Pointer, wheel and pinch on the tree: a drag always turns it (there is no pan), a press without
 * a drag clicks, a move without a press hovers. A click on a closed mark flies in until it opens.
 */
export function useTreeInput(sources: TreeInputSources): TreeInputHandlers {
  const { canvasRef, motion, layout, list, projector, tokens, selectedNode, navigationSpeed, onPick, onPaneClick, onHover } = sources;
  const pressRef = useRef<Press | null>(null);
  const [samples] = useState(() => new PointerTrail(readFlickTokens()));
  const pinchWheelRef = useRef(createPinchWheelStream());

  const pick = (x: number, y: number) => (tokens ? pickTreeMark(list.current, x, y, tokens.detail.pickSlopPx) : -1);

  const click = (x: number, y: number) => {
    const node = pick(x, y);
    const mark = node >= 0 ? treeMarkOf(list.current, node) : null;
    if (mark?.closed && layout && tokens) {
      const leafHead = layout.model.kinds[node + 1] === "element";
      motion.openClosed(node, mark, childSpacingOf(layout, node), projector.current.unit, leafHead ? tokens.detail.leafPitchPx : tokens.detail.openPitchPx);
      return;
    }
    if (node >= 0 && layout?.model.ids[node] != null) onPick(node);
    else onPaneClick?.();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = local(e);
    pressRef.current = { id: e.pointerId, x: p.x, y: p.y, dragging: false };
    samples.restart(p.x, performance.now());
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const press = pressRef.current;
    if (press && press.id === e.pointerId) {
      const dx = p.x - press.x;
      const dy = p.y - press.y;
      if (!press.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        press.dragging = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.style.cursor = "grabbing";
        onHover(-1);
        motion.beginDrag(selectedNode);
      }
      if (press.dragging) {
        samples.add(p.x, performance.now());
        motion.dragBy(dx * navigationSpeed.drag, dy * navigationSpeed.drag);
      }
      return;
    }
    if (motion.busy || !layout) return;
    const node = pick(p.x, p.y);
    const hoverable = treeHoverable(layout, list.current, node);
    e.currentTarget.style.cursor = hoverable ? "pointer" : "grab";
    onHover(hoverable ? node : -1);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const press = pressRef.current;
    if (!press || press.id !== e.pointerId) return;
    pressRef.current = null;
    if (press.dragging) {
      e.currentTarget.style.cursor = "grab";
      motion.endDrag(samples.flickSpeed(performance.now()) * navigationSpeed.drag);
      return;
    }
    const p = local(e);
    click(p.x, p.y);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const press = pressRef.current;
    if (!press || press.id !== e.pointerId) return;
    pressRef.current = null;
    if (press.dragging) motion.endDrag(0);
  };

  const onPointerLeave = () => {
    if (!pressRef.current) onHover(-1);
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    onHover(-1);
    motion.zoomAbout(factor, clientX - r.left, clientY - r.top);
  };
  const onWheel = useEffectEvent((e: WheelEvent) => {
    e.preventDefault();
    const pixelDeltaY = normalizeWheelDeltaY(e.deltaY, e.deltaMode, canvasRef.current?.clientHeight || 800);
    if (shouldIgnoreWheelGlide(pixelDeltaY, e.ctrlKey)) return;
    const pinch = readPinchWheel(pinchWheelRef.current, e);
    zoomAt(e.clientX, e.clientY, computeWheelZoomFactor(pixelDeltaY, { pinch, speed: navigationSpeed.zoom }));
  });
  const onGesturePinch = useEffectEvent((ratio: number, clientX: number, clientY: number) => {
    zoomAt(clientX, clientY, ratio ** navigationSpeed.zoom);
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const listener = (e: WheelEvent) => onWheel(e);
    canvas.addEventListener("wheel", listener, { passive: false });
    const stopGesturePinch = listenForGesturePinch(canvas, (ratio, clientX, clientY) => onGesturePinch(ratio, clientX, clientY));
    return () => {
      canvas.removeEventListener("wheel", listener);
      stopGesturePinch();
    };
  }, [canvasRef]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave };
}
