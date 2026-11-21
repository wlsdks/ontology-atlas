import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { Rect } from "../../interaction/hover-card-placement";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import type { CameraTween, ZoomEase } from "../../model/camera/camera-easing";
import type { SelectionSource } from "../../model/camera/flat-selection-camera";
import type { ForceSimulation } from "../../model/layout/force-layout";
import type { TierRevealConfig } from "../../model/visibility/tier-visibility";
import type { DragTugSets } from "../../interaction/drag-tug";
import type { ClusterBarLabels } from "../../render/cluster-chips/control-placement";
import type { ClusterChip } from "../../model/layout/density-gate";
import type { ExpandPreference } from "@/shared/lib/preferences/expand-preferences";
import type { MapNavigationSpeed } from "@/shared/lib/preferences/map-navigation-speed-preferences";
import type { DepthParallaxOffset } from "../../model/realm/realm-depth-parallax";
import type { DomeRuntime } from "../../model/dome-view/runtime";
import type { WorldOffset } from "../../interaction/node-drag";
import type { PointerMachineState } from "../../interaction/pointer-state-machine";
import type { PinchWheelStream } from "../../interaction/wheel";
import type { TopologyWorld, WorldEdge } from "../world/topology-world";

/** A drawn thing, in client coordinates, that a pointer-anchored card should not cover. */
export type HoverAvoidRect = Rect;

/** Active node-drag: which node is pinned + the world-space grab offset (respects where inside the node it was grabbed). */
export interface NodeDragState {
  nodeId: string;
  offset: WorldOffset;
}

interface Ref<T> {
  current: T;
}

export interface PointerHandlerRefs {
  /**
   * Who owns the wheel. `zoom` (workbench): the map is the whole screen, every wheel zooms.
   * `page-scroll` (gateway): the map is a band in a scrolling page, so a plain wheel yields to the page
   * and only an explicit pinch (`ctrlKey` wheel) zooms.
   */
  wheelIntent?: "zoom" | "page-scroll";
  navigationSpeedRef?: Ref<MapNavigationSpeed>;
  zoomEaseRef?: Ref<ZoomEase | null>;
  worldRef: Ref<TopologyWorld | null>;
  cameraRef: Ref<CameraAxes>;
  cameraTargetRef: Ref<CameraTarget>;
  /**
   * The live cubic camera transition (`model/camera/camera-easing.ts`).
   * Any interactive gesture (wheel zoom, pointer-down for pan/select) clears it
   * so the spring immediately regains control from wherever the ease left the
   * camera. Optional.
   */
  cameraTweenRef?: Ref<CameraTween | null>;
  dampingRef: Ref<number>;
  /**
   * `handleWheel` sets this to `--map-camera-spring-angfreq-interactive` on every live wheel tick so
   * zoom settles crisply. `null` means not yet set (the rAF loop's own fallback).
   */
  cameraAngularFreqRef: Ref<number | null>;
  viewportRef: Ref<{ width: number; height: number; dpr: number }>;
  pointerMachineRef: Ref<PointerMachineState>;
  dragHistoryRef: Ref<{ x: number; y: number; t: number }[]>;
  camStartAtDownRef: Ref<{
    x: number;
    y: number;
  }>;
  /**
   * Cached canvas rect, snapshotted at `pointerdown`: `getBoundingClientRect()` forces a synchronous
   * reflow, so it is not called on every `pointermove`.
   */
  canvasRectRef: Ref<{
    left: number;
    top: number;
  } | null>;
  /**
   * The canvas element itself, so `pointerup`/`pointercancel` (which
   * carry no event target of their own here) can restore the cursor after a
   * node pin-drag ends ("grabbing" → default). Optional; omitted keeps the
   * cursor unmanaged on release (the next `pointermove` still recomputes it).
   */
  canvasRef?: Ref<HTMLCanvasElement | null>;
  focusedSlugRef: Ref<string | null>;
  hoveredNodeIdRef: Ref<string | null>;
  rippleStartRef: Ref<Map<string, number>>;
  reducedMotionRef: Ref<boolean>;
  /**
   * "The camera's last mover was the user's hand" (WCAG 2.2 §2.3.3): every gesture that writes `cameraTargetRef` (wheel, pinch,
   * pan, flick) flips it true and the programmatic setters flip it back. `stepTopologyPhysics` scopes the reduced-motion camera
   * snap to app-initiated travel only, as direct manipulation is exempt. Optional so test fixtures keep working.
   */
  userDrivenCameraRef?: Ref<boolean>;
  /** Monotonic camera-gesture revision. Programmatic fits never change it. */
  cameraGestureRevisionRef?: Ref<number>;
  /** The live force simulation (`model/layout/force-layout.ts`) — pin/movePin/clearPin during node-drag. Null before the world is built. */
  simRef: Ref<ForceSimulation | null>;
  /** Frames of remaining sim warmth — the rAF loop ticks the sim while > 0 (or while a node is pinned). Bumped by node-drag. */
  heatRef: Ref<number>;
  /** Active node pin-drag, or null when the drag is a camera pan / no drag. */
  nodeDragRef: Ref<NodeDragState | null>;
  /**
   * The dragged node's own 1-hop/2-hop neighbour sets, captured once at grab time (`drag-tug.ts#computeDragTugSets`): they propagate
   * the neighbour tug and restrict the release-settle FA2 tick to this cluster (`force-layout.ts` `restrictToIds`). They persist
   * through the settle burst, cleared once its heat reaches 0 or a NEW drag starts.
   */
  dragAffectedSetRef: Ref<{ draggedId: string; oneHop: DragTugSets["oneHop"]; twoHop: DragTugSets["twoHop"] } | null>;
  /** The dragged node's world position at grab time, for computing this drag's total displacement (Δ). Null once the drag ends (post-release tug decays toward 0, no more Δ to track). */
  dragStartPosRef: Ref<{
    x: number;
    y: number;
  } | null>;
  overviewScaleRef: Ref<number>;
  /**
   * Active touch pointers (pointerId to canvas coordinates). Must be a ref the hook owns: this factory
   * re-runs every render. Omitting it disables pinch.
   */
  activeTouchesRef?: Ref<Map<number, { x: number; y: number }>>;
  /**
   * The previous frame's state of an in-flight pinch (two-finger distance
   * plus midpoint). null means no pinch. The zoom factor derives from the distance
   * ratio and the pan from the midpoint's movement.
   */
  pinchRef?: Ref<{ dist: number; midX: number; midY: number } | null>;
  pinchWheelRef?: Ref<PinchWheelStream>;
  onSelect?: (slug: string, source: SelectionSource) => void;
  /** The flat map's zoom to a node: a double-click, as Enter on the canvas. */
  onFlyToNode?: (slug: string) => void;
  /** A click at a point with no node hit that is close to an edge. */
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
  /**
   * Edge hover card: fires when an idle move lands near an edge (only on identity change) and null on
   * leaving. The draw pass's hover ink emphasis reads the same ref.
   */
  hoveredEdgeRef?: Ref<{ sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null>;
  /** Mirror of the edge-selection (pair focus) state — needed to decide ground-click deselection. */
  selectedEdgeRef?: Ref<{
    sourceId: string;
    targetId: string;
  } | null>;
  /** Density gate — this frame's cluster chips (world anchors), for chip hit testing. */
  clusterChipsRef?: Ref<readonly ClusterChip[]>;
  /** The last committed node tap, so the next one can be read as a double-click. */
  lastTapRef?: Ref<{ nodeId: string; at: number; x?: number; y?: number } | null>;
  /**
   * The set of nodes not drawn this frame
   * (density-gate collapsed plus optionally hidden ego neighbours). Node and edge hit
   * tests exclude this set so a hidden node cannot be clicked or hovered. Omitted
   * means everything is hittable.
   */
  clusteredIdsRef?: Ref<ReadonlySet<string>>;
  /** Density gate — mirror of the cluster parent id under hover (cursor plus border emphasis). */
  hoveredClusterIdRef?: Ref<string | null>;
  /**
   * Mirror of the expand preference — the hit test builds its rectangle with **the
   * same affordance as the draw**. Omitted defaults to `"pill"`.
   */
  expandPrefRef?: Ref<ExpandPreference>;
  /**
   * Mirror of the bar copy (translated) — the hit rectangle's width is **decided by
   * the text**, so the hit test has to see the same string as the draw. Diverging
   * copy diverges the rectangle, and that is how a "visible but unpressable button"
   * gets created.
   */
  clusterBarLabelsRef?: Ref<ClusterBarLabels | null>;
  /**
   * Depth parallax: the per-band render offsets plus depthById the rAF loop fills
   * while a realm is active. The hit test applies **the same** offsets to nodes to
   * avoid click misalignment. null (still, or no realm) means no offset.
   */
  realmParallaxRef?: Ref<{
    depthById: ReadonlyMap<string, number>;
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null>;
  /**
   * This frame's depth-based tier kind override during realm expansion (`topology-realm-runtime.ts#tierKindById`). The draw computes
   * tier alpha from this map, so the hit test must use the same one for depth-1 element children to be catchable; null while no realm is active.
   */
  realmTierKindsRef?: Ref<ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null>;
  /**
   * The dome runtime the loop owns (`model/dome-view/`). The hit test reads the same `frame` map the
   * draw last rendered; node vs empty-space is decided by the same `hitTestWorld` as 2D.
   */
  domeRuntimeRef?: Ref<DomeRuntime | null>;
  neuralRampRef?: Ref<number>;
  /**
   * 3D: whether the empty-space drag in flight is an orbit rotation (true) or a camera pan (false). `pointerdown` decides once and
   * it holds until the gesture ends (rule: `DOME_GRIP_MARGIN` in `model/dome-view/`).
   */
  domeGripRef?: Ref<boolean>;
  /**
   * A mirror of the tier gate config (it has
   * to be **the same** config as the draw for hit testing and pan clamping to stay in
   * lockstep with what was drawn). Omitted defaults to `DEFAULT_TIER_REVEAL`.
   */
  tierRevealRef?: Ref<TierRevealConfig>;
  pathEdgeIdsRef?: Ref<ReadonlySet<string> | null>;
  visitedTrailRef?: Ref<readonly string[]>;
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
    position: { x: number; y: number; avoid: readonly HoverAvoidRect[] } | null) => void;
  onPaneClick?: () => void;
  /** Density gate — a cluster chip click toggles the parent's expansion (a URL round trip). */
  onToggleCluster?: (parentId: string) => void;
  /**
   * The cluster chip hover tooltip. Fires only when the hover target
   * changes (an identity change) and null on leaving. HomePage builds the sentence
   * from the parent's title and count and renders it as a microcard (the same
   * contract as the edge hover card).
   */
  onHoverCluster?: (
    info: {
      parentId: string;
      /** Direct gated children collapsed (hidden) at this tier — the chip's `+N`. */
      count: number;
      /** The parent's total descendant count (the same source as the node badge). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number };
    } | null) => void;
  /** Clicking the `Neighbor +N` chip lights the next batch of neighbours (separate from the URL toggle). */
  onExpandEgoNeighbors?: () => void;
  /**
   * High-fanout batch reveal (2026-07) — clicking an expanded cluster parent's
   * `+N More` chip lights that parent's next batch (separate from the URL toggle,
   * which collapses; session-only). The argument is the **real parent** id parsed out
   * of the synthetic chip id.
   */
  onExpandClusterBatch?: (parentId: string) => void;
  /**
   * Node right-click context menu, called with the hit node's id and the event's viewport-space `clientX`/`clientY`. Omitted
   * keeps `handleContextMenu` a no-op over nodes (the browser menu is still suppressed off-node only).
   */
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
  /**
   * Right-click on empty canvas, at a point with no node; the coordinate is where a new node goes.
   * Omitted, it is a no-op and the browser's default menu appears.
   */
  onContextMenuPane?: (position: {
    x: number;
    y: number;
  }) => void;
}

export interface TopologyPointerHandlers {
  handlePointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  /**
   * The event is optional: the JSX wiring (onPointerUp) passes it so the
   * touch bookkeeping runs, while internal no-arg calls (the stuck-drag guard and the
   * like) skip that bookkeeping.
   */
  handlePointerUp: (e?: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerCancel: (e?: ReactPointerEvent<HTMLCanvasElement>) => void;
  /**
   * The pointer left the canvas, often for overlaid chrome. The edge card and cluster tooltip go with it
   * so a card does not stay up over a toolbar button.
   */
  handlePointerLeave: () => void;
  /**
   * Takes a native `WheelEvent`, not React's synthetic one: React's delegated `wheel` listener is passive, so a JSX `onWheel`
   * calling `e.preventDefault()` warns on every scroll and fails to stop the page scrolling under the canvas.
   * `use-topology-loop.ts` attaches this natively with `{ passive: false }`.
   */
  handleWheel: (e: WheelEvent) => void;
  handleGesturePinch: (ratio: number, clientX: number, clientY: number) => void;
  /**
   * The native browser context menu is suppressed only when the right-click lands on a hittable node; off-node right-clicks
   * fall through to the OS/browser menu unchanged.
   */
  handleContextMenu: (e: ReactMouseEvent<HTMLCanvasElement>) => void;
  /**
   * For instrumentation — **the edge the app would pick** at `(screenX, screenY)`, or
   * null on no hit. `__atlasMap.edgeAt()` exports this directly.
   */
  probeEdgeAt: (screenX: number, screenY: number, thresholdPx?: number) => WorldEdge | null;
  /** For instrumentation: the node a press would grab at `(screenX, screenY)`; `__atlasMap.nodeAt()`. */
  probeNodeAt: (screenX: number, screenY: number) => string | null;
}
