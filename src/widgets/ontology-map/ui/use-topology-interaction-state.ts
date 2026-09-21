"use client";
import type { HoverAvoidRect } from "./topology-pointer-handlers";

import {
  useRef
} from "react";
import { INITIAL_POINTER_MACHINE_STATE, type PointerMachineState } from "../interaction/pointer-state-machine";
import { type FocusLeashPx } from "./topology-camera-math";

interface Dependencies {
  focusedSlug: string | null;
  emphasizedNeighborSlug: string | null;
  onHoverEdge: ((edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null, position: { x: number; y: number; avoid: readonly HoverAvoidRect[]; } | null) => void) | undefined;
  selectedEdge: { sourceId: string; targetId: string; relationType?: string; } | null;
}

/** Own pointer gestures, focus, hover, and hit-test interaction state. */
export function useTopologyInteractionState({
  focusedSlug,
  emphasizedNeighborSlug,
  onHoverEdge,
  selectedEdge,
}: Dependencies) {

  const pointerMachineRef = useRef<PointerMachineState>(INITIAL_POINTER_MACHINE_STATE);

  const dragHistoryRef = useRef<{ x: number; y: number; t: number; }[]>([]);

  /**
   * What an empty-space drag means in 3D: starting inside the dome's grip
   * orbits it, starting outside pans the camera as in 2D. `pointerdown` decides
   * once, using `DOME_GRIP_MARGIN`.
   */
  const domeGripRef = useRef(false);

  const camStartAtDownRef = useRef({ x: 0, y: 0 });

  const canvasRectRef = useRef<{ left: number; top: number; } | null>(null);

  const focusedSlugRef = useRef<string | null>(focusedSlug);

  const lastFocusedSlugRef = useRef<string | null>(focusedSlug);

  const panelEmphasisNodeIdRef = useRef<string | null>(emphasizedNeighborSlug);

  const hoveredNodeIdRef = useRef<string | null>(null);

  /** The edge under hover — shared by the draw's ink emphasis and the micro-card. */
  const hoveredEdgeRef = useRef<{ sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null>(null);

  const onHoverEdgeRef = useRef(onHoverEdge);

  /** Edge-selection (pair focus) prop mirror, for the rAF closure. */
  const selectedEdgeRef = useRef<{ sourceId: string; targetId: string; relationType?: string; } | null>(selectedEdge);

  /**
   * The node this frame **actually treated as hovered** — a mirror kept solely
   * for the `__atlasMap.hover()` instrument. The canvas has no DOM, so from
   * outside, "is the map pointing at that node" could only be answered by
   * comparing pixels, and pixels never say what changed or why. This copies the
   * value the frame wrote, so it cannot disagree with the screen.
   */
  const drawnHoveredNodeIdRef = useRef<string | null>(null);

  /** The focus leash in screen pixels, set at the selection dive (`focusLeashPx`). */
  const focusLeashPxRef = useRef<FocusLeashPx | null>(null);

  const lastTapRef = useRef<{ nodeId: string; at: number; } | null>(null);
  return {
    pointerMachineRef, dragHistoryRef, domeGripRef, camStartAtDownRef, canvasRectRef, focusedSlugRef,
    lastFocusedSlugRef, panelEmphasisNodeIdRef, hoveredNodeIdRef, hoveredEdgeRef, onHoverEdgeRef,
    selectedEdgeRef, drawnHoveredNodeIdRef, focusLeashPxRef, lastTapRef,
  };
}
