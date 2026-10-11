import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { Rect } from "../../interaction/hover-card-placement";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import type { CameraTween, ZoomEase } from "../../model/camera-easing";
import type { ForceSimulation } from "../../model/force-layout";
import type { TierRevealConfig } from "../../model/tier-visibility";
import type { DragTugSets } from "../../interaction/drag-tug";
import type { ClusterBarLabels } from "../../render/cluster-chips";
import type { ClusterChip } from "../../model/density-gate";
import type { ExpandPreference, MapNavigationSpeed } from "@/shared/lib/preferences/appearance-preferences";
import type { DepthParallaxOffset } from "../../model/realm-depth-parallax";
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
   * Who owns the wheel — **it differs per surface** (measured by the motion seat,
   * 2026-07-28).
   *
   * `'zoom'` (default, the workbench): the map is the whole screen and there is no
   * page to scroll, so every wheel is zoom and `preventDefault` rightly stops it
   * leaking to the page.
   *
   * `'page-scroll'` (the gateway): the map is **a band inside a scrolling
   * document**, and the same line inverts into a trap here — measured: `/download`'s
   * canvas is **62.1%** of the viewport and swallowed the wheel unconditionally, so
   * the first thing a visitor landing on the gateway does (scroll) did nothing and
   * only zoomed the map. The entire sales argument sits below the fold and was
   * unreachable. In this mode a plain wheel yields to the page and zoom responds
   * only to an **explicit pinch** (`ctrlKey` wheel).
   *
   * A decision made for one surface leaked into a surface where its premise does not
   * hold, so it is raised from a constant to a contract.
   */
  wheelIntent?: "zoom" | "page-scroll";
  navigationSpeedRef?: Ref<MapNavigationSpeed>;
  zoomEaseRef?: Ref<ZoomEase | null>;
  worldRef: Ref<TopologyWorld | null>;
  cameraRef: Ref<CameraAxes>;
  cameraTargetRef: Ref<CameraTarget>;
  /**
   * S3 finishing polish — the live cubic camera transition (`model/camera-easing.ts`).
   * Any interactive gesture (wheel zoom, pointer-down for pan/select) clears it
   * so the spring immediately regains control from wherever the ease left the
   * camera. Optional — omitted keeps the pre-tween behavior.
   */
  cameraTweenRef?: Ref<CameraTween | null>;
  dampingRef: Ref<number>;
  /**
   * Dive-zoom fix (owner: *"Zoom in/out is slow"*) — `handleWheel` sets this to
   * `--map-camera-spring-angfreq-interactive` on every live wheel
   * tick, so the scale axis (and pan while wheel-zooming) settles crisp
   * instead of at the slower cinematic rate programmatic camera moves use.
   * `null` is a valid "not yet set" state (the rAF loop's own fallback).
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
   * Cached canvas bounding rect. `getBoundingClientRect()` forces a synchronous
   * layout/reflow; calling it on every `pointermove` was a per-drag-frame
   * reflow (a real source of the owner-reported "pan is janky"). We snapshot it
   * once at `pointerdown` and reuse it for the whole gesture instead.
   */
  canvasRectRef: Ref<{
    left: number;
    top: number;
  } | null>;
  /**
   * rank4 — the canvas element itself, so `pointerup`/`pointercancel` (which
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
   * WCAG 2.2 §2.3.3 — "the camera's last mover was the user's hand."
   * Every gesture that writes `cameraTargetRef` (wheel · pinch · pan · flick)
   * flips this true; the programmatic setters in `use-topology-loop.ts` flip it
   * back. `stepTopologyPhysics` reads it to scope the reduced-motion camera snap
   * to **app-initiated** travel only — direct manipulation is the hand's
   * extension, not vestibular motion, and the standard exempts it explicitly.
   * Optional so existing test fixtures keep working.
   */
  userDrivenCameraRef?: Ref<boolean>;
  /** Monotonic camera-gesture revision. Programmatic fits never change it. */
  cameraGestureRevisionRef?: Ref<number>;
  /** The live force simulation (`model/force-layout.ts`) — pin/movePin/clearPin during node-drag. Null before the world is built. */
  simRef: Ref<ForceSimulation | null>;
  /** Frames of remaining sim warmth — the rAF loop ticks the sim while > 0 (or while a node is pinned). Bumped by node-drag. */
  heatRef: Ref<number>;
  /** Active node pin-drag, or null when the drag is a camera pan / no drag. */
  nodeDragRef: Ref<NodeDragState | null>;
  /**
   * C1 B1/B2 — the dragged node's own 1-hop/2-hop neighbor sets, captured
   * once at grab time (`interaction/drag-tug.ts#computeDragTugSets`). Consumed
   * both to propagate the explicit neighbor tug (B1) and to restrict the
   * release-settle FA2 tick to this local cluster (B2, `model/force-layout.ts`
   * `tick`'s `restrictToIds`). Persists through the post-release settle burst —
   * only cleared once that burst's heat reaches 0 (`use-topology-loop.ts`) or a
   * NEW drag starts.
   */
  dragAffectedSetRef: Ref<{ draggedId: string; oneHop: DragTugSets["oneHop"]; twoHop: DragTugSets["twoHop"] } | null>;
  /** C1 B1 — the dragged node's world position at grab time, for computing this drag's total displacement (Δ). Null once the drag ends (post-release tug decays toward 0, no more Δ to track). */
  dragStartPosRef: Ref<{
    x: number;
    y: number;
  } | null>;
  /** The altitude band's "100%" fit scale — used to derive farT for tier-aware (visible-only) hit-testing. */
  overviewScaleRef: Ref<number>;
  /**
   * Touch pinch zoom (responsive audit rank4, 2026-07-23) — the active touch
   * pointers (pointerId → canvas coordinates). It has to be a ref the hook owns:
   * this factory is re-invoked on every render, so factory-local state evaporates on
   * a re-render mid-gesture. Omitting it disables pinch (backwards compatible — no
   * existing test or call site changes).
   */
  activeTouchesRef?: Ref<Map<number, { x: number; y: number }>>;
  /**
   * rank4 — the previous frame's state of an in-flight pinch (two-finger distance
   * plus midpoint). null means no pinch. The zoom factor derives from the distance
   * ratio and the pan from the midpoint's movement.
   */
  pinchRef?: Ref<{ dist: number; midX: number; midY: number } | null>;
  pinchWheelRef?: Ref<PinchWheelStream>;
  onSelect?: (slug: string) => void;
  /** P3b — a click at a point with no node hit that is close to an edge. */
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
  /**
   * P3c — the edge hover microcard. Fires when an idle move lands on a
   * node-miss point close to an edge (only when the identity changes) and null on
   * leaving. The draw pass's hover ink emphasis reads the same ref. A light meaning
   * preview separate from the click (P3b detail) — gated open after confirming usage
   * signals (owner request).
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
   * S3 finishing polish (an S2 known gap) — the set of nodes not drawn this frame
   * (density-gate collapsed plus optionally hidden ego neighbours). Node and edge hit
   * tests exclude this set so a hidden node cannot be clicked or hovered. Omitted
   * means everything is hittable.
   */
  clusteredIdsRef?: Ref<ReadonlySet<string>>;
  /** Density gate — mirror of the cluster parent id under hover (cursor plus border emphasis). */
  hoveredClusterIdRef?: Ref<string | null>;
  /**
   * Mirror of the expand preference — the hit test builds its rectangle with **the
   * same affordance as the draw**. Omitted defaults to `"pill"` (the previous behaviour).
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
   * S5 depth parallax — the per-band render offsets plus depthById the rAF loop fills
   * while a realm is active. The hit test applies **the same** offsets to nodes to
   * avoid click misalignment. null (still, or no realm) means no offset.
   */
  realmParallaxRef?: Ref<{
    depthById: ReadonlyMap<string, number>;
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null>;
  /**
   * S10 defect 3 — this frame's depth-based **tier kind** override during realm
   * expansion (`topology-realm-runtime.ts#tierKindById`). The draw computes tier alpha
   * from this map, so the hit test must use the same map for depth-1 element children
   * to be catchable. The loop fills it with **the same gate** as the draw every frame
   * (null while no realm is active).
   */
  realmTierKindsRef?: Ref<ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null>;
  /**
   * 3D view (2026-08-18) — the dome runtime the loop owns (`model/dome-view/`). The
   * hit test reads the **same frame map** (`frame`) the draw last rendered, so clicks
   * follow the drawn positions even mid-rotation. The state for both orbit dragging
   * (empty space) and in-plane node dragging passes through this one box — the node
   * vs empty-space decision is made by the same `hitTestWorld` as 2D (no second
   * source of truth).
   */
  domeRuntimeRef?: Ref<DomeRuntime | null>;
  neuralRampRef?: Ref<number>;
  /**
   * 3D — whether the empty-space drag in flight is **an orbit rotation** (true) or
   * **a camera pan** (false). `pointerdown` decides once and it does not change until
   * that gesture ends — deciding per move flips the gesture's identity whenever the
   * hand grazes the dome's boundary. The rule is `DOME_GRIP_MARGIN` in
   * `model/dome-view/`.
   */
  domeGripRef?: Ref<boolean>;
  /**
   * Slice C (the dev/non-dev mode toggle) — a mirror of the tier gate config (it has
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
   * S2 part 5C — the cluster chip hover tooltip. Fires only when the hover target
   * changes (an identity change) and null on leaving. HomePage builds the sentence
   * from the parent's title and count and renders it as a microcard (the same
   * contract as the edge hover card).
   */
  onHoverCluster?: (
    info: {
      parentId: string;
      /** Direct gated children collapsed (hidden) at this tier — the chip's `+N`. */
      count: number;
      /** Panel3-S6 number contract — the parent's total descendant count (the same source as the node badge). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number };
    } | null) => void;
  /** S2 part 3a — clicking the `Neighbor +N` chip lights the next batch of neighbours (separate from the URL toggle). */
  onExpandEgoNeighbors?: () => void;
  /**
   * High-fanout batch reveal (2026-07) — clicking an expanded cluster parent's
   * `+N More` chip lights that parent's next batch (separate from the URL toggle,
   * which collapses; session-only). The argument is the **real parent** id parsed out
   * of the synthetic chip id.
   */
  onExpandClusterBatch?: (parentId: string) => void;
  /**
   * W2-B node right-click context menu. Called with the hit node's id and the
   * event's viewport-space coordinates (`clientX`/`clientY`, matching the
   * cursor-anchored menu position contract). Omitted keeps `handleContextMenu`
   * a no-op over nodes too (browser default menu still suppressed off-node
   * only — see that handler's own doc).
   */
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
  /**
   * **Right-click on empty canvas** — called at a point with no node (2026-08-03).
   *
   * This position used to be simply ignored (`if (!hitNodeId) return;`). But a
   * right-click on empty canvas is the idiom for «create something here» in every
   * tool, and above all **the clicked coordinate is where the new node goes**, which
   * is more definite than a button in the top chrome.
   *
   * Omitted, it is a no-op as before, and the browser's default menu still appears.
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
   * rank4 — the event is optional: the JSX wiring (onPointerUp) passes it so the
   * touch bookkeeping runs, while internal no-arg calls (the stuck-drag guard and the
   * like) skip that bookkeeping.
   */
  handlePointerUp: (e?: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerCancel: (e?: ReactPointerEvent<HTMLCanvasElement>) => void;
  /**
   * The pointer left the canvas, most often for chrome drawn over it (the tool row, a
   * panel). The edge card and the cluster tooltip explain what is under the pointer, so
   * they go with it: they used to wait for the next move *on the canvas*, and a card
   * hovered from a line straight onto a toolbar button stayed up over that button.
   */
  handlePointerLeave: () => void;
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
  handleGesturePinch: (ratio: number, clientX: number, clientY: number) => void;
  /**
   * W2-B — native browser context menu is suppressed ONLY when the
   * right-click lands on a hittable node (design gate
   * "Suppress canvas default browser context menu only over a node" — suppress the
   * canvas default browser context menu only over a node). Off-node right-clicks fall through
   * to the OS/browser menu unchanged — panning/empty-canvas right-click
   * behavior is untouched.
   */
  handleContextMenu: (e: ReactMouseEvent<HTMLCanvasElement>) => void;
  /**
   * For instrumentation — **the edge the app would pick** at `(screenX, screenY)`, or
   * null on no hit. `__atlasMap.edgeAt()` exports this directly.
   */
  probeEdgeAt: (screenX: number, screenY: number, thresholdPx?: number) => WorldEdge | null;
}
