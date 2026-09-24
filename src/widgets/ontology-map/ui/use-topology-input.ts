"use client";

import type { ExpandPreference } from "@/shared/lib/appearance-preferences";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import {
  collectCanvasObstacles,
  computeFreeArea,
  measureCanvasInsets,
  type Rect,
} from "../interaction/free-area";
import {
  pickInitialFocus,
  pickNeighborInDirection,
  shouldAnnounceDeadEnd,
  walkDirectionForKey,
} from "../interaction/keyboard-walk";
import { keyboardZoomIntent } from "../interaction/keyboard-zoom";
import { type PointerMachineState } from "../interaction/pointer-state-machine";
import { type CameraTween } from "../model/camera-easing";
import type { ClusterChip } from "../model/density-gate";
import {
  commitDomeEntrySweep,
  type DomeRuntime
} from "../model/dome-view";
import { type ForceSimulation } from "../model/force-layout";
import {
  type DepthParallaxOffset
} from "../model/realm-depth-parallax";
import { type TierRevealConfig } from "../model/tier-visibility";
import type { ClusterBarLabels } from "../render/cluster-chips";
import { centerForInsets, computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin } from "./topology-camera-math";
import type { HoverAvoidRect, NodeDragState } from "./topology-pointer-handlers";
import { createTopologyPointerHandlers, type TopologyPointerHandlers } from "./topology-pointer-handlers";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { type TopologyWorld } from "./topology-world";

interface Dependencies {
  wheelIntent: "page-scroll" | "zoom";
  worldRef: RefObject<TopologyWorld | null>;
  cameraRef: RefObject<CameraAxes>;
  cameraTargetRef: RefObject<CameraTarget>;
  cameraTweenRef: RefObject<CameraTween | null>;
  dampingRef: RefObject<number>;
  cameraAngularFreqRef: RefObject<number | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  pointerMachineRef: RefObject<PointerMachineState>;
  dragHistoryRef: RefObject<{ x: number; y: number; t: number; }[]>;
  domeGripRef: RefObject<boolean>;
  camStartAtDownRef: RefObject<{ x: number; y: number; }>;
  canvasRectRef: RefObject<{ left: number; top: number; } | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  focusedSlugRef: RefObject<string | null>;
  hoveredNodeIdRef: RefObject<string | null>;
  rippleStartRef: RefObject<Map<string, number>>;
  reducedMotionRef: RefObject<boolean>;
  userDrivenCameraRef: RefObject<boolean>;
  cameraGestureRevisionRef: RefObject<number>;
  simRef: RefObject<ForceSimulation | null>;
  heatRef: RefObject<number>;
  nodeDragRef: RefObject<NodeDragState | null>;
  dragAffectedSetRef: RefObject<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string>; } | null>;
  dragStartPosRef: RefObject<{ x: number; y: number; } | null>;
  overviewScaleRef: RefObject<number>;
  activeTouchesRef: RefObject<Map<number, { x: number; y: number; }>>;
  pinchRef: RefObject<{ dist: number; midX: number; midY: number; } | null>;
  hoveredEdgeRef: RefObject<{ sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null>;
  selectedEdgeRef: RefObject<{ sourceId: string; targetId: string; relationType?: string; } | null>;
  clusterChipsRef: RefObject<readonly ClusterChip[]>;
  lastTapRef: RefObject<{ nodeId: string; at: number; x?: number; y?: number; } | null>;
  expandPrefRef: RefObject<ExpandPreference>;
  clusterBarLabelsRef: RefObject<ClusterBarLabels | null>;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  hoveredClusterIdRef: RefObject<string | null>;
  realmParallaxRef: RefObject<{ depthById: ReadonlyMap<string, number>; depth2: DepthParallaxOffset; depth3: DepthParallaxOffset; } | null>;
  realmTierKindsRef: RefObject<ReadonlyMap<string, "capability" | "domain" | "element" | "project"> | null>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  neuralRampRef: RefObject<number>;
  tierRevealRef: RefObject<TierRevealConfig>;
  galaxyRef: RefObject<boolean>;
  pathEdgeIdsRef: RefObject<ReadonlySet<string> | null>;
  visitedTrailRef: RefObject<readonly string[]>;
  onSelect: ((slug: string) => void) | undefined;
  onSelectEdge: ((edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; }) => void) | undefined;
  onHoverEdge: ((edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null, position: { x: number; y: number; avoid: readonly HoverAvoidRect[]; } | null) => void) | undefined;
  onPaneClick: (() => void) | undefined;
  onContextMenuNode: ((slug: string, position: { x: number; y: number; }) => void) | undefined;
  onContextMenuPane: ((position: { x: number; y: number; }) => void) | undefined;
  onToggleCluster: ((parentId: string) => void) | undefined;
  onHoverCluster: ((info: { parentId: string; count: number; descendantTotal: number; expanded: boolean; position: { x: number; y: number; }; } | null) => void) | undefined;
  egoRevealBatchesRef: RefObject<number>;
  clusterRevealBatchesRef: RefObject<Map<string, number>>;
  realmEnterButtonRef: RefObject<HTMLButtonElement | null> | undefined;
  realmEnterTargetRef: RefObject<string | null>;
  onEnterRealmRef: RefObject<((slug: string) => void) | undefined>;
  lastInputMsRef: RefObject<number>;
  lastActiveMsRef: RefObject<number>;
  onWalkDeadEnd: ((point: { x: number; y: number; } | null) => void) | null;
  runOverviewFit: () => void;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number) => void;
}

/** Bind pointer, wheel, keyboard walk, and realm-entry input; clean up native listeners. */
export function useTopologyInput({
  wheelIntent,
  worldRef,
  cameraRef,
  cameraTargetRef,
  cameraTweenRef,
  dampingRef,
  cameraAngularFreqRef,
  viewportRef,
  pointerMachineRef,
  dragHistoryRef,
  domeGripRef,
  camStartAtDownRef,
  canvasRectRef,
  canvasRef,
  focusedSlugRef,
  hoveredNodeIdRef,
  rippleStartRef,
  reducedMotionRef,
  userDrivenCameraRef,
  cameraGestureRevisionRef,
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
  lastTapRef,
  expandPrefRef,
  clusterBarLabelsRef,
  clusteredIdsRef,
  hoveredClusterIdRef,
  realmParallaxRef,
  realmTierKindsRef,
  domeRuntimeRef,
  neuralRampRef,
  tierRevealRef,
  galaxyRef,
  pathEdgeIdsRef,
  visitedTrailRef,
  onSelect,
  onSelectEdge,
  onHoverEdge,
  onPaneClick,
  onContextMenuNode,
  onContextMenuPane,
  onToggleCluster,
  onHoverCluster,
  egoRevealBatchesRef,
  clusterRevealBatchesRef,
  realmEnterButtonRef,
  realmEnterTargetRef,
  onEnterRealmRef,
  lastInputMsRef,
  lastActiveMsRef,
  onWalkDeadEnd,
  runOverviewFit,
  beginCameraTween,
}: Dependencies) {

  // refs below are only dereferenced inside the returned event-handler
  // closures (pointerdown/move/up/wheel), never synchronously during this
  // render — `createTopologyPointerHandlers` is a plain closure factory, not
  // a render-time read; the lint rule can't see into the imported function body.
  /* eslint-disable react-hooks/refs */
  const handlersRef = useRef<TopologyPointerHandlers | null>(null);

  const handlers = createTopologyPointerHandlers({
    wheelIntent,
    worldRef,
    cameraRef,
    cameraTargetRef,
    cameraTweenRef,
    dampingRef,
    cameraAngularFreqRef,
    viewportRef,
    pointerMachineRef,
    dragHistoryRef,
    domeGripRef,
    camStartAtDownRef,
    canvasRectRef,
    canvasRef,
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    reducedMotionRef,
    userDrivenCameraRef,
    cameraGestureRevisionRef,
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
    lastTapRef,
    expandPrefRef,
    clusterBarLabelsRef,
    clusteredIdsRef,
    hoveredClusterIdRef,
    realmParallaxRef,
    realmTierKindsRef,
    domeRuntimeRef,
    neuralRampRef,
    tierRevealRef,
    galaxyRef,
    pathEdgeIdsRef,
    visitedTrailRef,
    onSelect,
    onSelectEdge,
    onHoverEdge,
    onPaneClick,
    onContextMenuNode,
    onContextMenuPane,
    onToggleCluster,
    onHoverCluster,
    // A "neighbours +N" chip click lights the next neighbour batch
    // (session-only). The click gesture just kept the canvas active (inside the
    // idle grace window), so the next frame redraws with the new batch — no
    // separate wake needed.
    onExpandEgoNeighbors: () => {
      egoRevealBatchesRef.current += 1;
    },
    // A "+N more" chip click increments that parent's batch count
    // (session-only, not persisted to the URL). Same as above: the click kept
    // the canvas active, so the next frame redraws the new batch with its
    // DOI-ordered stagger.
    onExpandClusterBatch: (parentId: string) => {
      const map = clusterRevealBatchesRef.current;
      map.set(parentId, (map.get(parentId) ?? 1) + 1);
    },
  });

  /* eslint-enable react-hooks/refs */
  // Lets the inspection hook (`edgeAt`) see the latest handlers from inside an
  // effect with empty deps. Written in an effect rather than during render:
  // this repo's lint blocks ref writes during render, rightly — render must be
  // pure.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // A JSX `onWheel` prop
  // binds to React's delegated listener, which is registered `passive` by
  // default — calling `preventDefault()` inside it throws "Unable to
  // preventDefault inside passive event listener invocation" on every wheel
  // tick and doesn't actually stop the page from scrolling under the canvas.
  // Attaching the SAME handler natively with `{ passive: false }` fixes both.
  // `handleWheelRef` always points at the latest closure (refreshed every
  // render) so the effect below can stay mount-only (`[]`) without going
  // stale — `handlers` itself isn't memoized, so it isn't a safe effect dep.
  const handleWheelRef = useRef(handlers.handleWheel);

  // `noteInput` is declared further down; the mount-only listener reaches it
  // through this ref (kept in sync by the effect beside noteInput's declaration).
  const wheelNoteInputRef = useRef<() => void>(() => { });

  useEffect(() => {
    handleWheelRef.current = handlers.handleWheel;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The native listener must go through `noteInput` like every other input
    // path. It used to bind the raw handler, so wheel input never updated
    // lastInputMs — after the 30s ambient sleep, wheel-zooming without moving
    // the pointer left the ambient factor at 0 and the depends-edge comets
    // stayed frozen through the whole interaction (bug sweep 2026-09-01).
    const listener = (e: WheelEvent) => {
      wheelNoteInputRef.current();
      handleWheelRef.current(e);
    };
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, [canvasRef]);

  // Clicking the orbit enter button enters the realm of the slug currently
  // targeted. rAF updates the button's position every frame; the target slug is
  // shared through `realmEnterTargetRef`.
  useEffect(() => {
    const btn = realmEnterButtonRef?.current;
    if (!btn) return;
    const listener = (e: MouseEvent) => {
      e.stopPropagation();
      const slug = realmEnterTargetRef.current;
      if (slug) onEnterRealmRef.current?.(slug);
    };
    btn.addEventListener("click", listener);
    return () => btn.removeEventListener("click", listener);
  }, [onEnterRealmRef, realmEnterButtonRef, realmEnterTargetRef]);

  /**
   * The ambient-sleep wake signal: records when pointer or wheel input arrived.
   *
   * It wraps the returned handlers thinly because the input sites are scattered
   * through `createTopologyPointerHandlers`, and planting the call at each one
   * means a new handler silently omits it. **There is one boundary** — the
   * surface this hook hands outward.
   */
  const noteInput = useCallback(() => {
    lastInputMsRef.current = performance.now();
    // If it was asleep, drawing must resume from this frame. `idle-gate`
    // re-evaluates the refs every frame, so pushing the activity timestamp is
    // enough to guarantee it.
    lastActiveMsRef.current = lastInputMsRef.current;
  }, [lastActiveMsRef, lastInputMsRef]);

  useEffect(() => {
    wheelNoteInputRef.current = noteInput;
  }, [noteInput]);

  /**
   * Announcing a dead end — **silence was the defect.**
   *
   * Owner, using it for real: "The arrow keys work, but I cannot move between nodes freely?"
   * With no connected node in that direction it was built to do **nothing**.
   * Not wrapping around stands — jumping to the far side loses the user's
   * place — but it now says why it did not move, because a press with no
   * response cannot be told from "broken".
   *
   * **No new surface**: the app already has a toast mounted across the layout,
   * it dismisses itself (owner: "Show it briefly, then let it disappear") and assistive technology reads it. A hint
   * box on the map would need position, tokens and motion decided, which is not
   * a spec to set alone.
   *
   * ⚠️ **The wording and the toast do not belong to this widget.** Calling
   * `useTranslations` here broke five map component tests, which render without
   * a provider. This widget already **takes its wording as props**, like
   * `canvasLabel`, so only the event goes out (`onWalkDeadEnd`).
   */
  const onWalkDeadEndRef = useRef(onWalkDeadEnd);

  useEffect(() => {
    onWalkDeadEndRef.current = onWalkDeadEnd;
  });

  /** When it last announced, so holding an arrow key does not repeat itself. */
  const deadEndAtRef = useRef<number | null>(null);

  const announceDeadEnd = useCallback(() => {
    const now = performance.now();
    if (!shouldAnnounceDeadEnd(deadEndAtRef.current, now)) return;
    deadEndAtRef.current = now;
    /*
     * Send **the blocked node's screen position** along. Owner, 2026-08-10:
     * "It should appear clearly right beside the node you were moving from, and
     * then disappear."
     *
     * The screen-coordinate formula is the one the `nodes()` window and the
     * draw already share; deriving it here would be a third copy. When no
     * coordinate can be produced it sends `null` and the receiver decides not
     * to show anything.
     */
    const world = worldRef.current;
    const camera = cameraRef.current;
    const id = focusedSlugRef.current;
    const node = world && id ? world.nodeById.get(id) : null;
    const { width, height } = viewportRef.current;
    const point =
      node && camera && width > 0 && height > 0
        ? {
          x: (node.x - camera.x.value) * camera.scale.value + width / 2,
          y: (node.y - camera.y.value) * camera.scale.value + height / 2,
        }
        : null;
    onWalkDeadEndRef.current?.(point);
  }, [cameraRef, focusedSlugRef, viewportRef, worldRef]);

  /**
   * Arrow keys **walk the graph** (owner decision, 2026-08-09) — they move to a
   * neighbour rather than pushing the camera. Which neighbour is decided by
   * pure functions in `../interaction/keyboard-walk` (a ±60° wedge, projection
   * plus an orthogonal penalty); this only wires the result into canvas state.
   *
   * **Why no separate focus ring.** Separating focus from selection visually
   * needs a second indigo mark, and in this app indigo already means
   * "selected"; one colour with two meanings breaks the diagram, and that is
   * not a spec to set alone (`.claude/rules/design.md`, 「To change a spec, convene the 'System'」 — changing a spec convenes the design-systems seat). So
   * the keys **move the selection**, identical in meaning to a click, with zero
   * new visual language.
   *
   * **Collapsed nodes are not walked** — a subtree the density gate collapsed
   * has been replaced by a chip, so moving there means "I pressed a key and
   * nothing is visible".
   */
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    /*
     * 3D fly-to keys (2026-09-25) — the keyboard twin of the double-click. Enter flies to the
     * selected node; Home flies back to where the first fly-to left from (or frames the whole
     * structure); Esc flies back too when a fly-to is in effect, and still reaches whatever
     * else Esc does (the selection clears as before), so it is not consumed here.
     */
    {
      const dome = domeRuntimeRef.current;
      if (dome !== null && dome.active && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const focused = focusedSlugRef.current;
        if (e.key === "Enter" && focused !== null) {
          e.preventDefault();
          dome.flyRequest = { slug: focused };
          lastActiveMsRef.current = performance.now();
          return;
        }
        if (e.key === "Home") {
          e.preventDefault();
          dome.flyRequest = { slug: null };
          lastActiveMsRef.current = performance.now();
          return;
        }
        if (e.key === "Escape" && dome.flight !== null) {
          dome.flyRequest = { slug: null };
          lastActiveMsRef.current = performance.now();
        }
      }
    }
    /*
     * Keyboard zoom and fit (`interaction/keyboard-zoom.ts`): `+`/`-` step the
     * camera about the viewport centre on the same tween the fit uses, `0` is
     * the toolbar fit itself. Modifier combinations fall through to the browser.
     */
    const zoomIntent = keyboardZoomIntent(e);
    if (zoomIntent !== null) {
      e.preventDefault();
      if (zoomIntent.kind === "fit") {
        runOverviewFit();
        return;
      }
      const tokens = readOntologyMapTokensOrNull();
      if (!tokens) return;
      const target = cameraTargetRef.current;
      const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
      const scaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
      let scaleMin = computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin);
      const dome = domeRuntimeRef.current;
      if (dome !== null && dome.active) {
        // The 3D fit sits below the 2D floor; the wheel path lowers the floor the same way.
        if (dome.fitScale !== null) scaleMin = Math.min(scaleMin, dome.fitScale);
        dome.spinArmed = false;
        commitDomeEntrySweep(dome);
        dome.poseTween = null;
      }
      const tscale = Math.min(scaleMax, Math.max(scaleMin, target.tscale * zoomIntent.factor));
      if (Math.abs(tscale - target.tscale) < 1e-6) return;
      const next = { tx: target.tx, ty: target.ty, tscale };
      cameraTargetRef.current = next;
      userDrivenCameraRef.current = true;
      cameraGestureRevisionRef.current += 1;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      beginCameraTween(next);
      return;
    }
    const direction = walkDirectionForKey(e.key);
    if (!direction) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

    const world = worldRef.current;
    const camera = cameraRef.current;
    if (!world || !camera) return;

    const clustered = clusteredIdsRef.current;
    const visible = (id: string) => !clustered.has(id);

    const currentId = focusedSlugRef.current;
    let nextId: string | null = null;

    if (currentId === null || !world.nodeById.has(currentId)) {
      // With no focus, start from **what is being looked at**: the camera's
      // x/y are the world coordinates of the screen centre (the same formula
      // the `nodes()` window uses).
      nextId = pickInitialFocus(
        world.nodes.filter((n) => visible(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y })),
        { x: camera.x.value, y: camera.y.value },
      );
    } else {
      const from = world.nodeById.get(currentId);
      if (!from) return;
      /*
       * Reachable = **connected neighbours plus siblings**.
       *
       * ⚠️ Neighbours (edges) alone were the candidates at first, and the owner
       * hit the wall in the real thing: "At depth 1 they should be able to move among themselves — I could not move around freely at the centre?" (at
       * depth 1 they should be able to move among themselves — I could not move
       * around freely at the centre). The nine domains ringing the project at
       * the map's centre **have no edges to each other**; each attaches only to
       * the project. So stepping sideways from one to the next was impossible,
       * and on a screen where they visibly form a ring that reads as broken.
       *
       * **This does not permit arbitrary spatial jumps.** A sibling is the
       * typed relation "same parent", which is the very reason they form that
       * ring on screen. Parentless roots count as siblings of each other, for
       * vaults with more than one project.
       */
      const candidateIds = new Set<string>(world.neighborMap.get(currentId) ?? []);
      for (const node of world.nodes) {
        if (node.id === currentId) continue;
        if (node.parentId === from.parentId) candidateIds.add(node.id);
      }
      const candidates: { id: string; x: number; y: number; }[] = [];
      for (const id of candidateIds) {
        if (!visible(id)) continue;
        const node = world.nodeById.get(id);
        if (node) candidates.push({ id: node.id, x: node.x, y: node.y });
      }
      if (candidates.length === 0) {
        // A node with nowhere to go. Say why, rather than doing nothing.
        e.preventDefault();
        announceDeadEnd();
        return;
      }
      nextId = pickNeighborInDirection({ id: from.id, x: from.x, y: from.y }, candidates, direction);
    }

    // The arrow keys are ours: the page must not scroll even when there is no
    // neighbour in that direction.
    e.preventDefault();
    if (nextId === null) {
      announceDeadEnd();
      return;
    }

    const target = world.nodeById.get(nextId);
    if (!target) return;
    onSelect?.(nextId);

    /*
     * The camera only **follows**, and only when the focus is about to leave
     * the free area. Recentring on every step keeps the map sliding while you
     * walk and the user loses their place — breaking Shneiderman's
     * overview-first on our own.
     *
     * **Both the test and the target use the free area**, for the reason and
     * the measurements recorded on the focus-dive path above (owner,
     * 2026-08-10). It runs once per step, not per frame.
     */
    const { width, height } = viewportRef.current;
    const canvasEl = canvasRef.current;
    if (width > 0 && height > 0 && canvasEl) {
      const scale = camera.scale.value;
      const canvasBox = canvasEl.getBoundingClientRect();
      const canvasRect: Rect = {
        x: canvasBox.x,
        y: canvasBox.y,
        width: canvasBox.width,
        height: canvasBox.height,
      };
      const obstacles = collectCanvasObstacles(canvasEl, canvasRect);
      const free = computeFreeArea(canvasRect, obstacles);

      // Is the focus comfortably inside the free area (compared in document
      // coordinates).
      const sx = canvasBox.x + (target.x - camera.x.value) * scale + width / 2;
      const sy = canvasBox.y + (target.y - camera.y.value) * scale + height / 2;
      const margin = Math.min(free.width, free.height) * 0.18;
      const outside =
        sx < free.x + margin ||
        sx > free.x + free.width - margin ||
        sy < free.y + margin ||
        sy > free.y + free.height - margin;
      if (outside) {
        /*
         * The target comes from the camera-math formula (`centerForInsets`).
         * Writing it out here would make two copies, and with several copies
         * the default outcome is that one is missed — the focus dive was
         * exactly that missed copy.
         *
         * The free area stays only in the **"has it gone outside" test**:
         * insets give a push distance but not a containing rectangle, so that
         * test asks a question the insets cannot express.
         */
        const centered = centerForInsets(target.x, target.y, { ...measureCanvasInsets(canvasEl, canvasRect), top: 0, bottom: 0 }, scale);
        const cameraTarget = { tx: centered.tx, ty: centered.ty, tscale: scale };
        /*
         * ★ **Starting the tween alone is not enough** (the gate caught this).
         * When the tween ends the spring takes over from `cameraTargetRef`, so
         * leaving that stale **pulls the camera back to the old target** —
         * measured: the node ended up 188 px off the free area's centre, sitting
         * at the screen centre instead. This is why every other programmatic
         * path (focus dive, chip expand, fit-view) sets both.
         */
        cameraTargetRef.current = cameraTarget;
        userDrivenCameraRef.current = false;
        beginCameraTween(cameraTarget);
      }
    }
  }, [worldRef, cameraRef, clusteredIdsRef, focusedSlugRef, onSelect, viewportRef, canvasRef, cameraTargetRef, overviewScaleRef, domeRuntimeRef, lastActiveMsRef, userDrivenCameraRef, cameraGestureRevisionRef, dampingRef, cameraAngularFreqRef, beginCameraTween, runOverviewFit, announceDeadEnd]);

  const wrappedHandlers = useMemo(
    () => ({
      handleKeyDown: (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
        noteInput();
        handleKeyDown(e);
      },
      handlePointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerDown(e);
      },
      handlePointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerMove(e);
      },
      handlePointerUp: (e?: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerUp(e);
      },
      handleWheel: (e: WheelEvent) => {
        noteInput();
        handlers.handleWheel(e);
      },
    }),
    [handlers, noteInput, handleKeyDown],
  );
  return { handlersRef, handlers, wrappedHandlers };
}
