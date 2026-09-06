/**
 * Pointer/wheel event handlers — the click-safe contract
 * (`interaction/pointer-state-machine.ts`) plus camera pan/zoom/flick
 * (`engine/momentum.ts`, prototype §9 `pointerdown`/`pointermove`/
 * `releaseDrag()`/`wheel`). Split out of `use-topology-loop.ts` to keep both
 * files under the 300-line budget — `Ref<T>` here is any mutable box the
 * hook owns (`useRef`'s `.current`), not necessarily React's own ref type.
 *
 * FIX (owner + QA — flick proportionality): `projectFlickLanding` now projects
 * a landing PROPORTIONAL to release velocity (iOS deceleration, ~−249 world
 * units for a 0.5px/ms flick at scale 1), so a small flick glides a small
 * distance and a big flick a big distance. `handlePointerUp` still clamps the
 * projected target into the world's pan bounds
 * (`engine/camera.ts#computePanBounds`) — but now that only engages when the
 * projection genuinely EXCEEDS the bounds, so within-bounds flicks glide freely
 * and only edge-exceeding flicks rubber-band (the seeded velocity overshoots the
 * clamped bound, then `stepCamera`'s per-frame `clampAxisToPanBounds` elastically
 * returns it — INTERACTION-DESIGN §1 "Boundaries rubber-band" —
 * the boundary rubber-bands). The old port inflated
 * the projection ~60× so EVERY flick slammed to the same edge (the reported
 * snap); see `engine/momentum.ts`.
 */

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

import { lastDrawnNodeAlphas } from "./topology-frame-draw";
import { clampPointToPanBounds, type CameraAxes, type CameraTarget } from "../engine/camera";
import type { CameraTween } from "../model/camera-easing";
import { projectFlickLanding, sampleReleaseVelocity } from "../engine/momentum";
import { EGO_NEIGHBOR_CHIP_ID, parseClusterMoreChipId, scheduleRipple } from "../model/focus-state";
import type { ForceSimulation } from "../model/force-layout";
import { computeZoomRatio, DEFAULT_TIER_REVEAL, isNodeHittable, isSpineOnlyZoom, type TierRevealConfig } from "../model/tier-visibility";
import { computeDragTugSets, type DragTugSets } from "../interaction/drag-tug";
import { hitTestEdges, type EdgeHitCandidate } from "./topology-edge-hit";
import { clusterBadgeLabel, clusterBadgeRect, clusterBarLabel, clusterBarRect, clusterChipLabel, clusterChipRect, clusterChipScale, clusterControlForm, type ClusterBarLabels } from "../render/cluster-chips";
import type { ClusterChip } from "../model/density-gate";
import { DEFAULT_EXPAND, type ExpandPreference } from "@/shared/lib/appearance-preferences";
import { depthParallaxOffsetFor, ZERO_PARALLAX, type DepthParallaxOffset } from "../model/realm-depth-parallax";
import {
  commitDomeEntrySweep,
  clampOrbitReleaseVelocity,
  domeFacingYaws,
  isInsideDomeGrip,
  projectOrbitLanding,
  snapOrbitLanding,
  ORBIT_PITCH_PER_PX,
  ORBIT_YAW_PER_PX,
  resistDomePitch,
  solveDomePlanePoint,
  type DomeNodeFrame,
  type DomeRuntime,
} from "../model/dome-view";
import { computeGrabOffsetWorld, computePinWorld, type WorldOffset } from "../interaction/node-drag";
import {
  INITIAL_POINTER_MACHINE_STATE,
  resolveClickAction,
  transitionPointerState,
  type PointerMachineState,
} from "../interaction/pointer-state-machine";
import { computeWheelZoomFactor, normalizeWheelDeltaY, shouldIgnoreWheelGlide } from "../interaction/wheel";
import { computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin, computeUnfocusedPanBounds, HIT_TOUCH_SLACK_PX, hitTestWorld, screenToWorld, worldToScreen } from "./topology-camera-math";
import { readTopologyV2TokensOrNull } from "./topology-read-tokens";
import { radiusForKind, type TopologyWorld, type WorldEdge } from "./topology-world";

/**
 * Sim warmth topped up while a node is actively pin-dragged, in MILLISECONDS
 * (kept warm so neighbors keep reflowing). A4: heat used to be a frame count,
 * which made the same gesture settle twice as fast on a 120Hz display as on a
 * 60Hz one — time budgets are refresh-rate invariant. 350ms ≈ the old
 * 20-frame top-up at 60Hz. The release settle budget is the
 * `--topology-v2-node-release-settle-ms` token (900).
 */
const NODE_DRAG_HEAT_MS = 350;

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
   * `--topology-v2-camera-spring-angfreq-interactive` on every live wheel
   * tick, so the scale axis (and pan while wheel-zooming) settles crisp
   * instead of at the slower cinematic rate programmatic camera moves use.
   * `null` is a valid "not yet set" state (the rAF loop's own fallback).
   */
  cameraAngularFreqRef: Ref<number | null>;
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
  dragStartPosRef: Ref<{ x: number; y: number } | null>;
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
  selectedEdgeRef?: Ref<{ sourceId: string; targetId: string } | null>;
  /** Density gate — this frame's cluster chips (world anchors), for chip hit testing. */
  clusterChipsRef?: Ref<readonly ClusterChip[]>;
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
   * 3D view (2026-08-18) — the dome runtime the loop owns (`model/dome-view.ts`). The
   * hit test reads the **same frame map** (`frame`) the draw last rendered, so clicks
   * follow the drawn positions even mid-rotation. The state for both orbit dragging
   * (empty space) and in-plane node dragging passes through this one box — the node
   * vs empty-space decision is made by the same `hitTestWorld` as 2D (no second
   * source of truth).
   */
  domeRuntimeRef?: Ref<DomeRuntime | null>;
  /**
   * 3D — whether the empty-space drag in flight is **an orbit rotation** (true) or
   * **a camera pan** (false). `pointerdown` decides once and it does not change until
   * that gesture ends — deciding per move flips the gesture's identity whenever the
   * hand grazes the dome's boundary. The rule is `DOME_GRIP_MARGIN` in
   * `model/dome-view.ts`.
   */
  domeGripRef?: Ref<boolean>;
  /**
   * Slice C (the dev/non-dev mode toggle) — a mirror of the tier gate config (it has
   * to be **the same** config as the draw for hit testing and pan clamping to stay in
   * lockstep with what was drawn). Omitted defaults to `DEFAULT_TIER_REVEAL`.
   */
  tierRevealRef?: Ref<TierRevealConfig>;
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
    position: { x: number; y: number } | null,
  ) => void;
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
    } | null,
  ) => void;
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
  onContextMenuPane?: (position: { x: number; y: number }) => void;
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

/** Builds the five pointer/wheel handlers, closing over the hook's refs (cheap — plain closures, no hook rules to satisfy). */
export function createTopologyPointerHandlers(refs: PointerHandlerRefs): TopologyPointerHandlers {
  const {
    wheelIntent = "zoom",
    worldRef,
    cameraRef,
    cameraTargetRef,
    cameraTweenRef,
    dampingRef,
    cameraAngularFreqRef,
    viewportRef,
    pointerMachineRef,
    dragHistoryRef,
    camStartAtDownRef,
    canvasRectRef,
    canvasRef,
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    reducedMotionRef,
    userDrivenCameraRef,
    simRef,
    heatRef,
    nodeDragRef,
    dragAffectedSetRef,
    dragStartPosRef,
    overviewScaleRef,
    activeTouchesRef,
    pinchRef,
    hoveredEdgeRef,
    selectedEdgeRef,
    clusterChipsRef,
    clusteredIdsRef,
    hoveredClusterIdRef,
    expandPrefRef,
    clusterBarLabelsRef,
    realmParallaxRef,
    realmTierKindsRef,
    domeRuntimeRef,
    domeGripRef = { current: false },
    tierRevealRef,
    onSelect,
    onSelectEdge,
    onHoverEdge,
    onPaneClick,
    onContextMenuNode,
    onContextMenuPane,
    onToggleCluster,
    onHoverCluster,
    onExpandEgoNeighbors,
    onExpandClusterBatch,
  } = refs;

  /**
   * 3D view — this frame's dome delivery map (only while the ramp is > 0). Hit
   * testing, candidate building and chip decisions all read this one thing — the map
   * the draw last rendered.
   */
  const domeFrameNow = (): ReadonlyMap<string, DomeNodeFrame> | null => {
    const runtime = domeRuntimeRef?.current ?? null;
    return runtime && runtime.frame.size > 0 && runtime.rampClock > 0 ? runtime.frame : null;
  };
  /** The branch condition for 3D orbit vs in-plane drag — the target is on and no realm is active. */
  const domeInteractive = (): DomeRuntime | null => {
    const runtime = domeRuntimeRef?.current ?? null;
    return runtime && runtime.active ? runtime : null;
  };
  /**
   * 3D — overrides the camera's minimum zoom. When the dome's fit zoom is below the
   * 2D anchor-based minimum, it drops that far (see the `DomeRuntime.fitScale` JSDoc:
   * without it the fit target is unreachable and the wheel anchor computes against a
   * fictional zoom). The wheel, the pinch and the spring must all see the same value
   * so their three clamps cannot diverge.
   */
  const effectiveScaleMinWithDome = (base: number): number => {
    const runtime = domeRuntimeRef?.current ?? null;
    const fit = runtime !== null && runtime.rampClock > 0 ? runtime.fitScale : null;
    return fit !== null ? Math.min(base, fit) : base;
  };

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
    const tokens = readTopologyV2TokensOrNull();
    // Use **the same** zoom scale as the draw (`topology-frame-draw.ts`) so the rectangle cannot drift.
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
                scale,
              )
            : clusterBadgeRect(
                parentScreen.x,
                parentScreen.y,
                nodeScreenRadius,
                clusterBadgeLabel(chip.count, chip.expanded),
                scale,
              );
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
    // Tier hittability rides the same zoom-ratio signal as the draw pass
    // (`model/tier-visibility.ts`), NOT `farT` — so the pointer never grabs a
    // semantic-zoom-hidden capability/element even at the circuit default entry.
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const zoomRatio = computeZoomRatio(camera.scale.value, overviewEntryScale);
    // C1 A2 — focus ego tier exemption: the focused node + its 1-hop neighbors
    // are hittable even below the tier's own alpha threshold, matching the
    // draw pass's `effectiveNodeAlpha` exemption (`topology-frame-draw.ts`) —
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
          lastDrawnNodeAlphas(),
        ),
      renderOffsetForNode,
          // 3D perspective factor — the same s the draw multiplied by, applied to the hit disc too.
      domeFrame ? (node) => domeFrame.get(node.id)?.s ?? 1 : undefined,
          // 3D depth — among overlapping discs the nearer (brighter, larger) node wins.
      domeFrame ? (node) => domeFrame.get(node.id)?.u ?? 0 : undefined,
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

  /**
   * The candidate cache — **the same input is never rebuilt** (code review fix,
   * 2026-07-28).
   *
   * This function filters every node (O(N)), projects every edge (O(E), three
   * coordinate transforms and two Map lookups per edge) and allocates whole arrays.
   * And its call site is **every `pointermove` that missed a node** — up to ~125Hz.
   * Simply moving the mouse over the background walks the entire graph and allocates
   * new arrays every frame. The 97-node dogfood does not show it, but this engine is
   * designed for 2–3k nodes.
   *
   * Yet most of those frames have **the same input** — with the camera still, the
   * candidates are unchanged. So it rebuilds only when at least one input differs.
   * During a pan or zoom the camera values differ every frame, so it naturally
   * recomputes each time (accuracy first there), and hovering while still is all
   * cache hits after the first frame.
   *
   * The key holds the `world` reference, so a changed graph invalidates immediately.
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
    if (!world) return [];
    const tokens = readTopologyV2TokensOrNull();
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
    const cacheKey = [
      cameraRef.current.x.value,
      cameraRef.current.y.value,
      cameraRef.current.scale.value,
      width,
      height,
      zoomRatio,
      focusedNodeId ?? "",
      domeEpoch,
    ].join("|");
    // Sets and maps are compared **by reference** — comparing only sizes lets a
    // different collection of the same size through, which is the quietest kind of
    // cache error. These values are replaced with new objects rather than mutated in
    // place, so reference comparison is exact.
    const clusteredIds = clusteredIdsRef?.current;
    const realmTierKinds = realmTierKindsRef?.current ?? null;
    const tierReveal = tierRevealRef?.current ?? DEFAULT_TIER_REVEAL;
    if (
      edgeCandidateCache &&
      edgeCandidateCache.world === world &&
      edgeCandidateCache.key === cacheKey &&
      edgeCandidateCache.clusteredIds === clusteredIds &&
      edgeCandidateCache.realmTierKinds === realmTierKinds &&
      edgeCandidateCache.tierReveal === tierReveal
    ) {
      return edgeCandidateCache.value;
    }

    const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) : undefined;
    const hittable = new Set(
      world.nodes
        .filter((n) =>
          isNodeHittable(
            n,
            zoomRatio,
            focusedNodeId,
            neighborsOfFocused,
            tierReveal,
            clusteredIds,
            realmTierKinds,
            lastDrawnNodeAlphas(),
          ),
        )
        .map((n) => n.id),
    );
    // Hit-test inversion guard (panel3-S3) — the end nodes' body radius in screen px
    // is computed with **the same formula** as `hitTestWorld`
    // (radiusForKind × magnitudeScale × scale + 5) and passed through. It meshes
    // exactly with the node hit area so a click on or near a node body cannot leak to
    // a radial edge (node body > edge).
    const scale = cameraRef.current.scale.value;
    const bodyRadius = (id: string): number | undefined => {
      const node = world.nodeById.get(id);
      if (!node) return undefined;
    // 3D — the same perspective factor as the node hit disc (identical formula to the draw).
      const domeS = domeFrame?.get(id)?.s ?? 1;
      return radiusForKind(node.kind, tokens) * node.magnitudeScale * domeS * scale + HIT_TOUCH_SLACK_PX;
    };
    const candidates: EdgeHitCandidate[] = [];
    // 3D offsets — the same formula as the draw
    // (`topology-frame-draw.ts#projectEdgePoints`): each endpoint takes its own end
    // node's frame offset and the control point takes the average of the two.
    const cam = cameraRef.current;
    const ZERO = { dx: 0, dy: 0, s: 1 };
    for (const edge of world.edges) {
      if (!hittable.has(edge.sourceId) || !hittable.has(edge.targetId)) continue;
      const offA = domeFrame?.get(edge.sourceId) ?? ZERO;
      const offB = domeFrame?.get(edge.targetId) ?? ZERO;
      candidates.push({
        edge,
        a: worldToScreen(cam, width, height, edge.ax + offA.dx, edge.ay + offA.dy),
        b: worldToScreen(cam, width, height, edge.bx + offB.dx, edge.by + offB.dy),
        control: worldToScreen(cam, width, height, edge.controlX + (offA.dx + offB.dx) / 2, edge.controlY + (offA.dy + offB.dy) / 2),
        aRadius: bodyRadius(edge.sourceId),
        bRadius: bodyRadius(edge.targetId),
      });
    }
    edgeCandidateCache = { key: cacheKey, world, clusteredIds, realmTierKinds, tierReveal, value: candidates };
    return candidates;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
    // S3 — any pointer interaction (pan / select) abandons a live camera tween
    // so the spring takes over from wherever the ease currently sits. A click
    // that ends up selecting a node begins a fresh tween in the focus effect.
    if (cameraTweenRef) cameraTweenRef.current = null;
    // R4 momentum-glide interruption — a new pointerdown catches an in-flight flick
    // deceleration immediately (the iOS scroll catch). It zeroes the camera velocity
    // and pins the spring target to the current position so it stops right here; the
    // pan or selection that follows sets its own new target (pan: pointermove;
    // selection: the focus effect's tween). With the velocity already 0 it is at rest,
    // so the target is left alone (avoiding a needless state change).
    {
      const cam = cameraRef.current;
      if (cam.x.velocity !== 0 || cam.y.velocity !== 0) {
        cameraRef.current = { ...cam, x: { value: cam.x.value, velocity: 0 }, y: { value: cam.y.value, velocity: 0 } };
        cameraTargetRef.current = { ...cameraTargetRef.current, tx: cam.x.value, ty: cam.y.value };
        dampingRef.current = tokens.cameraDampingDefault;
      }
    }
    // Capture the pointer for the whole gesture — without this, releasing over
    // the analysis rail / outside the window never delivers `pointerup` to the
    // canvas, the state machine sticks in `dragging`, and the camera then
    // follows a button-less mouse until it strands off-graph (owner's
    // "Dragging makes the canvas disappear";
    // QA loss B). Implicit release on pointerup/cancel is per-spec automatic.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // jsdom / test envs may not implement pointer capture — the buttons===0
      // guard in `handlePointerMove` covers the fallback.
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
      if (activeTouchesRef.current.size > 2) return;
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
     * the `DOME_GRIP_MARGIN` doc-block in `model/dome-view.ts`.
     */
    {
      const dome = domeInteractive();
      if (dome === null) {
        domeGripRef.current = false;
      } else {
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

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
    const rect = currentRect(e.currentTarget);
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    // rank4 touch pinch zoom — two-finger movement into camera zoom plus pan. The
    // maths is the same contract as `handleWheel`: composed against the camera TARGET
    // (independent of spring lag), clamped to the effective min/max, on the interactive
    // spring. Solving tx/ty so the world point under the previous midpoint lands under
    // the new one makes the zoom anchor and the two-finger pan fall out of one
    // equation: tx' = worldAtPrevMid − (mid' − c)/scale'.
    if (activeTouchesRef && e.pointerType === "touch" && activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.set(e.pointerId, { x: point.x, y: point.y });
      const pinch = pinchRef?.current;
      if (pinch && pinchRef && activeTouchesRef.current.size >= 2) {
        const pts = [...activeTouchesRef.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (pinch.dist > 0 && dist > 0) {
          // Camera motion starting — hover cards demote immediately (the same rule as the wheel).
          clearEdgeHover();
          clearClusterHover();
          if (cameraTweenRef) cameraTweenRef.current = null;
          // 3D — a pinch zoom is intervention too (the same contract as the wheel:
          // ① release the attention spin, ④ stop the pose move).
          {
            const dome = domeInteractive();
            if (dome) {
              dome.spinArmed = false;
          commitDomeEntrySweep(dome);
              dome.poseTween = null;
            }
          }
          const { width, height } = viewportRef.current;
          const target = cameraTargetRef.current;
          const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
          const effectiveScaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
          const effectiveScaleMin = effectiveScaleMinWithDome(computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin));
          const newScale = Math.min(effectiveScaleMax, Math.max(effectiveScaleMin, target.tscale * (dist / pinch.dist)));
          const worldAtPrevMidX = (pinch.midX - width / 2) / target.tscale + target.tx;
          const worldAtPrevMidY = (pinch.midY - height / 2) / target.tscale + target.ty;
          const afterX = worldAtPrevMidX - (midX - width / 2) / newScale;
          const afterY = worldAtPrevMidY - (midY - height / 2) / newScale;
          cameraTargetRef.current = { tx: afterX, ty: afterY, tscale: newScale };
          if (userDrivenCameraRef) userDrivenCameraRef.current = true;
          dampingRef.current = tokens.cameraDampingDefault;
          cameraAngularFreqRef.current = tokens.cameraSpringAngFreqInteractive;
          // Block residual flick velocity (as the wheel does) — a pinch is target driven.
          const cam = cameraRef.current;
          if (cam.x.velocity !== 0 || cam.y.velocity !== 0) {
            cameraRef.current = { ...cam, x: { value: cam.x.value, velocity: 0 }, y: { value: cam.y.value, velocity: 0 } };
          }
          // WCAG 2.3.3 — a pinch is **user-initiated** magnification. The camera used
          // to snap to its destination here, which teleports the whole viewport in one
          // frame for a reduced-motion user (measured 2026-07-28: diff 0.00 forever
          // after one frame) — worse for the vestibular system than the movement it was
          // replacing, and it also removes any cue for reading "where did I go".
          // Direct manipulation is an extension of the hand, so it keeps its time.
        }
        pinchRef.current = { dist, midX, midY };
        return; // Mid-pinch, the single-pointer paths (pan/hover/drag) are not taken.
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

    // Capture the pressed node BEFORE the transition — the pressed→dragging
    // transition clears `pressedNodeId`, but we need it to know whether this
    // drag grabbed a node (pin-drag) or empty space (camera pan).
    const pressedNodeId = pointerMachineRef.current.pressedNodeId;
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointermove", point }, tokens.hysteresisPx);
    pointerMachineRef.current = next;

    if (next.phase === "dragging") {
      const sim = simRef.current;
      const { width, height } = viewportRef.current;
      const dome = domeInteractive();

      // 3D in-plane node drag — the node vs empty-space decision (pressedNodeId) was
      // already made by the same hit test as 2D. One screen point corresponds to
      // infinitely many depths, so a node moves **only within its own kind plane**
      // (`solveDomePlanePoint`) — preserving z's typed fact (the kind tier). The force
      // simulation belongs to the 2D layout and is untouched here (only the dome
      // coordinates move — session only, the 2D arrangement is unchanged).
      if (dome && nodeDragRef.current === null && pressedNodeId !== null && sim?.hasNode(pressedNodeId)) {
        const grabNode = world.nodeById.get(pressedNodeId);
        const coord = dome.model.coords.get(pressedNodeId);
        if (grabNode && coord) {
          const grabFrame = dome.frame.get(pressedNodeId);
          const renderedX = grabNode.x + (grabFrame?.dx ?? 0);
          const renderedY = grabNode.y + (grabFrame?.dy ?? 0);
          const pw = screenToWorld(cameraRef.current, width, height, point.x, point.y);
          const offset = computeGrabOffsetWorld(renderedX, renderedY, pw.x, pw.y);
          // Grabbing a node is intervention — release the attention spin (①).
          dome.spinArmed = false;
          commitDomeEntrySweep(dome);
          nodeDragRef.current = { nodeId: pressedNodeId, offset };
          dome.drag = {
            nodeId: pressedNodeId,
            spring: { px: coord.px, pz: coord.pz, vx: 0, vz: 0 },
            targetPx: coord.px,
            targetPz: coord.pz,
          };
        }
      }

      if (dome && nodeDragRef.current !== null && dome.drag !== null) {
        clearEdgeHover();
        clearClusterHover();
        const pw = screenToWorld(cameraRef.current, width, height, point.x, point.y);
        const pin = computePinWorld(pw.x, pw.y, nodeDragRef.current.offset);
        const coord = dome.model.coords.get(dome.drag.nodeId);
        if (coord) {
          const solved = solveDomePlanePoint(dome.model, coord.py, pin.x, pin.y, dome.yaw + dome.lag[world.nodeById.get(dome.drag.nodeId)?.kind ?? "element"], dome.pitch);
          if (solved) {
            dome.drag.targetPx = solved.px;
            dome.drag.targetPz = solved.pz;
          }
        }
        e.currentTarget.style.cursor = "grabbing";
        return;
      }

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

      // 3D orbit — an empty-space drag rotates the dome rather than panning the
      // camera. Horizontal = yaw (hero sensitivity 0.006/px), vertical = pitch (with a
      // rubber-band limit). Deeper tiers lag slightly with a twist and spring back —
      // follow-through. A drag begun outside the dome is **a camera pan**, exactly as
      // in 2D (it falls through to the default path below). Only a drag begun inside
      // orbits.
      if (dome && domeGripRef.current) {
        const history = dragHistoryRef.current;
        const last = history[history.length - 1];
        const dx = last ? point.x - last.x : 0;
        const dy = last ? point.y - last.y : 0;
        // The event pushes **the target only** — the actual yaw/pitch follow that
        // target each frame at `ORBIT_SMOOTH_TAU_MS` (removing the stepping when the
        // event rate exceeds the frame rate; the loop also charges the tier twist from
        // the real per-frame movement). The total is still 1:1 with the pointer.
        dome.yawTarget += dx * ORBIT_YAW_PER_PX;
        dome.pitchTarget = resistDomePitch(dome.pitchTarget + dy * ORBIT_PITCH_PER_PX);
        dome.orbiting = true;
        // Orbiting is intervention — the attention spin goes down here and does not
        // come back (①; it returns via "Auto-arrange" or re-entering 3D — see the
        // `DomeRuntime.spinArmed` JSDoc).
        dome.spinArmed = false;
          commitDomeEntrySweep(dome);
        dragHistoryRef.current.push({ x: point.x, y: point.y, t: performance.now() });
        if (dragHistoryRef.current.length > 10) dragHistoryRef.current.shift();
        return;
      }

      /*
       * Incremental, not gesture-total (bug sweep 2026-09-01). The old math
       * divided the WHOLE gesture's screen delta from downPoint by the CURRENT
       * scale — wheel-zooming while a background drag was held retroactively
       * rescaled the accumulated delta, so the next 1px pointermove jumped the
       * camera by up to half the drag distance. Only the delta since the last
       * sample (the history's tail — seeded with the down point) is converted
       * at the current scale, so a mid-drag zoom changes nothing already panned.
       */
      const previous = dragHistoryRef.current[dragHistoryRef.current.length - 1]
        ?? next.downPoint
        ?? point;
      const scale = cameraRef.current.scale.value;
      const worldDX = (point.x - previous.x) / scale;
      const worldDY = (point.y - previous.y) / scale;
      const nextX = cameraRef.current.x.value - worldDX;
      const nextY = cameraRef.current.y.value - worldDY;
      // 1:1 tracking, no lag — drag follows the pointer directly, the spring
      // only takes back over once the flick is released (`engine/momentum.ts`).
      cameraRef.current = { ...cameraRef.current, x: { value: nextX, velocity: 0 }, y: { value: nextY, velocity: 0 } };
      cameraTargetRef.current = { ...cameraTargetRef.current, tx: nextX, ty: nextY };
      if (userDrivenCameraRef) userDrivenCameraRef.current = true;
      dragHistoryRef.current.push({ x: point.x, y: point.y, t: performance.now() });
      // Keep ~10 samples (~160ms at 60fps) so the release-velocity window
      // (`--topology-v2-camera-release-velocity-window-ms`) is always covered,
      // even on lower-frame-rate devices. The sampler filters by timestamp, so
      // extra old samples are harmless.
      if (dragHistoryRef.current.length > 10) dragHistoryRef.current.shift();
      return;
    }

    // A drag (pan or node move) already returned in the block above, so only
    // idle|pressed reaches here. Edge hover works during focus (ego) too — an edge
    // click (P3b) works during focus, so hover has to match ("if you can grab it you
    // can read it"; the root of the user report "With a node clicked, the edge hover tooltip does not appear"). The
    // candidates already reflect the focus tier's hit rules via buildEdgeCandidates.
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);

    // P3c — proximity to an edge at a node-miss point is a hover microcard. It fires
    // only when the identity changes (moving along the same edge does not re-fire, so
    // the card is stable). Moving onto a node clears the edge hover immediately (the
    // node wins).
    // The edge hit is also used for the cursor decision, so it is computed **outside**
    // the hover block below — if the cursor affordance rode on the edge-hover wiring
    // (`hoveredEdgeRef && onHoverEdge`), a consumer without that wiring would get no
    // cursor at all (2026-07-28: it really was inside that guard).
    const edgeHit =
      hitNodeId === null && hoveredEdgeRef && onHoverEdge
        ? hitTestEdges(buildEdgeCandidates(), point.x, point.y, 6)
        : null;

    if (hoveredEdgeRef && onHoverEdge) {
      const prev = hoveredEdgeRef.current;
      const sameEdge =
        edgeHit !== null &&
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
        onHoverEdge(payload, payload ? { x: e.clientX, y: e.clientY } : null);
      }
    }

    // Cursor affordance — **each surface shows its own primary action** (design
   // council "Interaction" prescription plus a measured correction, 2026-07-28).
   //
   // Before: node = `grab`, edge = `pointer`, **background = nothing**. The node's
   // `grab` was not a lie (it really does pin-drag). The real defect was the
   // background — **it is pannable and offered no affordance at all** (measured: the
   // background hover cursor was `auto`). So nobody was told "you can push this map",
   // while the grabbing hand appeared only over nodes, which cannot be pushed.
   //
   // Now it splits by primary action:
   // - node, edge, chip → `pointer` (press and it opens — the action the hint bar names)
   // - background → `grab` (push and the map follows), `grabbing` while pushing
   // Node dragging still works and still answers with `grabbing` — as an enhancement
   // it yields the affordance in the primary position (the council's ruling being that
   // it belongs to the class where drag-only discovery is acceptable).
   //
   // That this assignment sits **outside** the hover block above is also contractual —
   // inside it, a consumer with no edge-hover wiring would get no cursor at all.
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
          } else {
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
      if (chipHit !== null) e.currentTarget.style.cursor = "pointer";
      /*
       * 3D — over empty space **the cursor names two zones.** The rule differs by
       * position (inside the dome = rotate, outside = move), and with nothing on
       * screen saying so, that rule may as well not exist. A feature you can only
       * discover by dragging is the «drag-only discovery» this repository forbids.
       *
       * `grab` = grab and rotate (over the dome) · `move` = grab and move (outside).
       * Over a node or chip their own cursors have already won, so those are untouched.
       */
      if (chipHit === null && hitNodeId === null) {
        const dome = domeInteractive();
        if (dome !== null) {
          const view = viewportRef.current;
          const pw = screenToWorld(cameraRef.current, view.width, view.height, point.x, point.y);
          e.currentTarget.style.cursor = isInsideDomeGrip(dome.drawnBounds, pw.x, pw.y) ? "grab" : "move";
        }
      }
    }

    if (next.phase !== "idle" || focusedSlugRef.current) return; // The ripple is idle plus unfocused only (existing contract).
    if (hitNodeId === hoveredNodeIdRef.current) return;
    hoveredNodeIdRef.current = hitNodeId;
    if (hitNodeId) {
      const neighborIds = [...(world.neighborMap.get(hitNodeId) ?? [])];
      const schedule = scheduleRipple(hitNodeId, performance.now(), neighborIds, tokens.rippleStaggerMs, RIPPLE_PER_NEIGHBOR_DELAY_MS, tokens.rippleStaggerMaxMs);
      for (const entry of schedule) rippleStartRef.current.set(entry.nodeId, entry.startAtMs);
      // The hover pulse was retired on an owner report (*"Flying grains of rice effect — remove it,
      // it looks wrong"* — the flying grains of rice effect: remove it, it looks wrong;
      // 2026-07-23). Only the permanent comets remain — ripple and cursor are enough
      // of a hover response.
    }
  };

  const handlePointerUp = (e?: ReactPointerEvent<HTMLCanvasElement>) => {
    // rank4 touch pinch zoom — touch release bookkeeping. A pinch up (or the leftover
    // finger of one) does not take the click/flick paths: entering a pinch already
    // cancelled the machine to idle, while an ordinary single tap is in phase
    // pressed/dragging at up time and does not hit this early return. (The internal
    // no-arg call — the stuck-drag guard — skips the bookkeeping.)
    if (e && activeTouchesRef && e.pointerType === "touch" && activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.delete(e.pointerId);
      if (pinchRef?.current && activeTouchesRef.current.size < 2) pinchRef.current = null;
      if (pointerMachineRef.current.phase === "idle") return;
    }
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    // P3b — snapshot of the click point (outside a drag, downPoint *is* the click coordinate).
    const clickPoint = pointerMachineRef.current.downPoint;
    const wasDragging = pointerMachineRef.current.phase === "dragging";
    const { next, commitClick } = transitionPointerState(pointerMachineRef.current, { type: "pointerup" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;

    // Let go of the grabbing shape once the hand lets go (2026-07-28). It used to be
    // restored **only in the node-drag branch**, so pushing the background and then
    // leaving the mouse still left the cursor as `grabbing` — released, while the
    // screen still said it was held. Clearing it with `""` falls back to the canvas's
    // default `grab` (a true signal that it is pannable), and the next pointermove over
    // a node overrides it with `pointer`.
    if (canvasRef?.current) canvasRef.current.style.cursor = "";

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
          if (canvasRef?.current) canvasRef.current.style.cursor = "";
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
      if (canvasRef?.current) canvasRef.current.style.cursor = "";
      return;
    }

    if (wasDragging) {
      // 3D orbit release — yaw/pitch momentum instead of a camera flick. The measured
      // velocity of the release window is passed into angular velocity at the same
      // sensitivity as the drag (velocity continuous at release). reduced-motion gets
      // zero momentum — the user-initiated **drag itself** already finished 1:1, and the
      // glide that follows is motion the app makes, so it is not exempt.
      {
        const dome = domeInteractive();
        if (dome && dome.orbiting) {
          dome.orbiting = false;
          // The remaining target gap (≤ velocity × τ) is dropped and momentum takes over
          // — target-following and momentum both pushing the pose after release would
          // integrate twice.
          dome.yawTarget = dome.yaw;
          dome.pitchTarget = dome.pitch;
          if (!reducedMotionRef.current) {
            const release = sampleReleaseVelocity({
              history: dragHistoryRef.current,
              releaseTime: performance.now(),
              windowMs: tokens.cameraReleaseVelocityWindowMs,
              minSpeedPxPerMs: tokens.cameraFlickMinSpeed,
            });
            if (release.isFlick) {
              // Capped so the coast never exceeds half a turn (`ORBIT_COAST_MAX_RAD`).
              dome.yawVel = clampOrbitReleaseVelocity(release.vx * ORBIT_YAW_PER_PX);
              dome.pitchVel = clampOrbitReleaseVelocity(release.vy * ORBIT_PITCH_PER_PX);
              /*
               * **A meaningful landing** — left to momentum alone, the dome stops at an
               * arbitrary angle. The natural landing point is computed from the release
               * velocity first, and if that spot is near a domain meridian the
               * deceleration's target is re-aimed there (the same two steps as
               * UIScrollView paging — see the `ORBIT_SNAP_WINDOW_RAD` doc-block).
               * Outside the window it is `null`, leaving the previous momentum as is.
               */
              const landing = projectOrbitLanding(dome.yaw, dome.yawVel);
              dome.yawSnap = snapOrbitLanding(landing, domeFacingYaws(dome.model));
            } else {
              dome.yawSnap = null;
            }
          }
          return;
        }
      }
      // Stationary release gate (owner spec: *"After dragging, stopping should stop it right there"* — after
      // dragging, stopping should stop it right there) — sample the last ~80ms of
      // pointer motion; a stationary release yields isFlick=false and the camera holds
      // exactly here (no momentum glide). Only a release WITH motion (a flick) projects
      // a landing target.
      const release = sampleReleaseVelocity({
        history: dragHistoryRef.current,
        releaseTime: performance.now(),
        windowMs: tokens.cameraReleaseVelocityWindowMs,
        minSpeedPxPerMs: tokens.cameraFlickMinSpeed,
      });

      if (reducedMotionRef.current || !release.isFlick) {
        // Hold in place: pin the spring target to the current camera position and
        // clear any residual velocity so it comes to rest exactly here.
        cameraTargetRef.current = { tx: cameraRef.current.x.value, ty: cameraRef.current.y.value, tscale: cameraTargetRef.current.tscale };
        cameraRef.current = {
          ...cameraRef.current,
          x: { value: cameraRef.current.x.value, velocity: 0 },
          y: { value: cameraRef.current.y.value, velocity: 0 },
        };
        dampingRef.current = tokens.cameraDampingDefault;
        return;
      }
      const vx = release.vx;
      const vy = release.vy;
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
      // The projected landing is proportional to velocity (see file header) and
      // usually within the graph's pan bounds — clamp it only so a landing that
      // WOULD exceed the bounds rubber-bands at the edge instead of overshooting
      // into blank canvas. Within-bounds flicks are unaffected by this clamp.
      // The clamp source is the VISIBLE tier's bounds: at spine-only zoom the
      // full 295-node bounds cover a huge legal-but-empty fan region (only ~8
      // spine nodes draw), so a strong flick could land the camera on nothing
      // (owner's "The canvas disappeared" — QA loss A). Once
      // capabilities start revealing, the full bounds become honest again.
      const world = worldRef.current;
      let clampedLanding = { x: px.landingTarget, y: py.landingTarget };
      if (world) {
        const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
        const zoomRatio = computeZoomRatio(cameraRef.current.scale.value, overviewEntryScale);
        const boundsSource = isSpineOnlyZoom(zoomRatio, tierRevealRef?.current ?? DEFAULT_TIER_REVEAL) ? world.spineBounds : world.bounds;
        // On a surface with the leash on (the gateway), the landing point uses the same
        // envelope — otherwise a flick lands outside the leash and the spring pulls it
        // back, moving twice.
        clampedLanding = clampPointToPanBounds(
          px.landingTarget,
          py.landingTarget,
          computeUnfocusedPanBounds(boundsSource, cameraRef.current.scale.value, tokens),
        );
      }
      cameraTargetRef.current = { tx: clampedLanding.x, ty: clampedLanding.y, tscale: cameraTargetRef.current.tscale };
      if (userDrivenCameraRef) userDrivenCameraRef.current = true;
      cameraRef.current = {
        ...cameraRef.current,
        x: { value: cameraRef.current.x.value, velocity: px.worldVelocity },
        y: { value: cameraRef.current.y.value, velocity: py.worldVelocity },
      };
      dampingRef.current = tokens.cameraDampingFlick;
      return;
    }

    const action = resolveClickAction(commitClick, focusedSlugRef.current);
    if (action.type === "select") {
      onSelect?.(action.nodeId);
      return;
    }
    // 3D dome — re-clicking a selected node is **re-selection, not deselection**
    // (2026-08-18, second pass): in the dome the panel's X leaves the selection intact
    // and only collapses the panel (HomePage `handleDatasheetClose`), so the natural
    // gesture for reopening a collapsed panel is re-clicking that node. Keeping the
    // re-click = deselect toggle would remove that route — deselection stays the job of
    // an empty-background click or Escape. 2D keeps the previous toggle.
    if (action.type === "deselect" && commitClick !== null && commitClick.nodeId !== null && domeInteractive() !== null) {
      onSelect?.(commitClick.nodeId);
      return;
    }
    // Density gate — an empty-space click (node miss) over a cluster chip toggles
    // expansion. It takes priority over edge selection and ground deselection (a chip is
    // explicit interactive chrome). The node-click = ego-focus contract was already
    // handled in the select branch above and does not reach here.
    if (
      commitClick &&
      commitClick.nodeId === null &&
      clickPoint &&
      (onToggleCluster || onExpandEgoNeighbors || onExpandClusterBatch)
    ) {
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
    const emptyGroundWithEdgeSelected =
      commitClick !== null && commitClick.nodeId === null && (selectedEdgeRef?.current ?? null) !== null;
    if (action.type === "deselect" || emptyGroundWithEdgeSelected) onPaneClick?.();
  };

  const clearEdgeHover = () => {
    if (hoveredEdgeRef && hoveredEdgeRef.current !== null) {
      hoveredEdgeRef.current = null;
      onHoverEdge?.(null, null);
    }
  };

  /** S2 part 5C — clear the cluster chip hover tooltip (on drag, cancel or toggle). */
  const clearClusterHover = () => {
    if (hoveredClusterIdRef && hoveredClusterIdRef.current !== null) {
      hoveredClusterIdRef.current = null;
      onHoverCluster?.(null);
    }
  };

  const handlePointerCancel = (e?: ReactPointerEvent<HTMLCanvasElement>) => {
    // rank4 touch pinch zoom — bookkeeping for a cancelled touch pointer (a browser gesture hijack and the like).
    if (e && activeTouchesRef && e.pointerType === "touch") {
      activeTouchesRef.current.delete(e.pointerId);
      if (pinchRef?.current && activeTouchesRef.current.size < 2) pinchRef.current = null;
    }
    clearEdgeHover();
    clearClusterHover();
    const tokens = readTopologyV2TokensOrNull();
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
          if (canvasRef?.current) canvasRef.current.style.cursor = "";
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
      if (canvasRef?.current) canvasRef.current.style.cursor = "";
    }
    if (!tokens) {
      pointerMachineRef.current = INITIAL_POINTER_MACHINE_STATE;
      return;
    }
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointercancel" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
  };

  const handleWheel = (e: WheelEvent) => {
    // Gateway contract — a plain wheel belongs to the page. The point is **not** calling
    // `preventDefault` here, so it exits before any guard.
    if (wheelIntent === "page-scroll" && !e.ctrlKey) return;
    e.preventDefault();
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    // Trackpad glide guard (owner report, 2026-07-23) — the |delta| < 4px micro-wheel
    // noise that leaks out while fingers rest on the pad is not composed into zoom. That
    // noise was the entry route for "just hovering an edge makes the screen move and
    // shake". A pinch (ctrlKey wheel) and deliberate notches or scrolls pass through
    // unchanged. `preventDefault` stays (stopping page-scroll leakage), and the hover
    // cards stay too (there is no motion).
    const { height: vpH } = viewportRef.current;
    const glideDeltaY = normalizeWheelDeltaY(e.deltaY, e.deltaMode, vpH);
    if (shouldIgnoreWheelGlide(glideDeltaY, e.ctrlKey)) return;
    // Edge and cluster hover cards lingering (panel2/3) — the moment a wheel or camera
    // motion starts, the card must disappear. A card anchors to an idle hover only, so
    // while zoom made the coordinates flow it lingered with no pointermove and survived
    // right through a three-tier zoom. Dismissing on motion's first tick keeps the card
    // from floating over the map.
    clearEdgeHover();
    clearClusterHover();
    // S3 — a live wheel zoom is interactive input; abandon any programmatic
    // camera tween so the crisp interactive spring owns this gesture.
    if (cameraTweenRef) cameraTweenRef.current = null;
    // 3D — zoom is intervention too: release the attention spin (①) and hand any pose
    // move in flight to the gesture (the same interruption contract as the camera tween, ④).
    {
      const dome = domeInteractive();
      if (dome) {
        dome.spinArmed = false;
          commitDomeEntrySweep(dome);
        dome.poseTween = null;
      }
    }
    const { width, height } = viewportRef.current;
    const rect = currentRect(e.currentTarget as HTMLCanvasElement);
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // C1 A1 follow-up (owner feedback — rapid wheel notches felt "dead" even
    // after the ceiling fix): compound off the camera's TARGET
    // (`cameraTargetRef`), not its live/spring-animated value (`cameraRef`).
    // A burst of wheel events arrives faster than the critically-damped
    // spring can visually catch up (~0.34s time constant) — basing each new
    // target on the live (still-lagging) scale meant a rapid flurry of
    // notches barely compounded past the FIRST one's effect, since each
    // subsequent notch's "current scale" was nearly identical to the one
    // before it (measured live: 10 real notches at 30-80ms spacing only
    // reached zoomRatio ~1.05-1.2, nowhere near the capability/element
    // bands). Basing it on the TARGET instead lets intent compound correctly
    // regardless of how fast the events arrive; the spring still smoothly
    // interpolates the VISIBLE camera toward wherever that target ends up. In
    // the steady state (no animation in flight) `cameraTargetRef` already
    // equals `cameraRef`, so a single isolated wheel tick is unaffected.
    const target = cameraTargetRef.current;
    const beforeX = (sx - width / 2) / target.tscale + target.tx;
    const beforeY = (sy - height / 2) / target.tscale + target.ty;
    // Normalize deltaMode first — a line/page-mode wheel reports a tiny raw
    // deltaY that the old `exp(-deltaY*0.0016)` turned into ~0% zoom (the
    // owner's "Wheel zoom not working" bug). See `interaction/wheel.ts`.
    const pixelDeltaY = normalizeWheelDeltaY(e.deltaY, e.deltaMode, height);
    // C1 owner feedback ("Zoom in/out is slow") — sensitivity upped 0.0016 → 0.0020,
    // see `interaction/wheel.ts#WHEEL_ZOOM_SENSITIVITY`'s JSDoc.
    const factor = computeWheelZoomFactor(pixelDeltaY);
    // C1 A1 — wheel/pinch zoom-in must reach the ratio-based effective max
    // (`topology-camera-math.ts#computeEffectiveCameraScaleMax`), not the
    // absolute `cameraScaleMax` token — same fix as the spring clamp in
    // `topology-physics-step.ts`.
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const effectiveScaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
    const effectiveScaleMin = effectiveScaleMinWithDome(computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin));
    const newScale = Math.min(effectiveScaleMax, Math.max(effectiveScaleMin, target.tscale * factor));
    const afterX = beforeX - (sx - width / 2) / newScale;
    const afterY = beforeY - (sy - height / 2) / newScale;

    cameraTargetRef.current = { tx: afterX, ty: afterY, tscale: newScale };
    if (userDrivenCameraRef) userDrivenCameraRef.current = true;
    dampingRef.current = tokens.cameraDampingDefault;
    // R4 momentum-glide interruption — when a wheel zoom starts, the residual x/y
    // velocity of an in-flight flick deceleration is zeroed so it does not leak (zoom is
    // target driven, so the scale axis is unaffected).
    if (cameraRef.current.x.velocity !== 0 || cameraRef.current.y.velocity !== 0) {
      cameraRef.current = {
        ...cameraRef.current,
        x: { ...cameraRef.current.x, velocity: 0 },
        y: { ...cameraRef.current.y, velocity: 0 },
      };
    }
    // Dive-zoom fix — a live wheel gesture uses the crisp interactive spring
    // for the scale axis (and pan, since point-to-zoom moves both together)
    // until the NEXT programmatic camera move resets it back to transition.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqInteractive;
    // WCAG 2.3.3 — a wheel zoom is user-initiated too, so it does not snap, for the same
    // reason as the pinch above. What a reduced-motion user loses is only the movement
    // the app **takes them on** (ego dive, fit, arrange —
    // `topology-physics-step.ts#userDrivenCamera`).
  };

  // W2-B — right-click reuses the SAME tier-aware hit test as pointerdown
  // (`hitVisibleNode`), so the menu only opens over nodes actually hittable
  // at the current altitude/focus (never a semantic-zoom-hidden one). The
  // browser's own context menu is prevented ONLY on that hit path — an
  // off-node right-click (empty canvas) falls through untouched, so users can
  // still reach the OS/browser menu there.
  const handleContextMenu = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world || (!onContextMenuNode && !onContextMenuPane)) return;
    const rect = currentRect(e.currentTarget);
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    if (!hitNodeId) {
      // Empty space — "Create a concept here" (create a concept here). With no consumer it is a no-op, as before.
      if (!onContextMenuPane) return;
      e.preventDefault();
      onContextMenuPane({ x: e.clientX, y: e.clientY });
      return;
    }
    if (!onContextMenuNode) return;
    e.preventDefault();
    onContextMenuNode(hitNodeId, { x: e.clientX, y: e.clientY });
  };

  /**
   * ★ **Expose the app's own edge decision verbatim** (2026-08-03).
   *
   * Why: nodes can be driven from outside through `__atlasMap.nodes()`, which gives
   * coordinates and `draggable`, but **edges could not be.** Measured — clicking 101
   * points along a curve's midline across 3 offsets still left `selection().edge`
   * null. The threshold is 7px and the inside of a node body is excluded, so from
   * outside there is no way to guess "where do I have to press".
   *
   * The result was that **no change involving edges could be verified automatically** —
   * attaching entry and exit to the edge panel hit that wall and was reverted
   * (2026-08-03).
   *
   * It does not recompute the coordinates but calls **the same functions**
   * (`buildEdgeCandidates` plus `hitTestEdges`). An instrument using a different
   * formula from the app measures its own imagination rather than the screen.
   */
  const probeEdgeAt = (screenX: number, screenY: number, thresholdPx = 7) =>
    hitTestEdges(buildEdgeCandidates(), screenX, screenY, thresholdPx);

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleWheel, handleContextMenu, probeEdgeAt };
}
