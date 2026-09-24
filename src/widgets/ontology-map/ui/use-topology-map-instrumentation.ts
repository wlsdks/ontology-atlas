"use client";

import { useEffect } from "react";

import type { CameraAxes, CameraTarget } from "../engine/camera";
import { measureCanvasInsets } from "../interaction/free-area";
import type { PointerMachineState } from "../interaction/pointer-state-machine";
import type { ClusterChip } from "../model/density-gate";
import { projectDomeEdgeControl } from "../model/dome-edge";
import {
  DOME_ASSEMBLE_TOTAL_MS,
  type DomeRuntime,
} from "../model/dome-view";
import { buildWalkedEdgeKeys } from "../model/footprint-steps";
import type { ForceSimulation } from "../model/force-layout";
import { isGalaxyEdgeVisible } from "../model/galaxy-layout";
import type { TopologyMapLensKind } from "../model/path-lens";
import { isPreviewEndpoint, isPreviewEndpointHidden } from "../render/preview-edge";
import type { OntologyMapProps } from "./OntologyMap";
import {
  lastDrawnLabelBoxes,
  lastDrawnNodeAlphas,
  lastDrawnRelationCaptions,
  lastLitStateCounts,
} from "./topology-frame-draw";
import type {
  NodeDragState,
  TopologyPointerHandlers,
} from "./topology-pointer-handlers";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import {
  radiusForKind,
  type TopologyWorld,
} from "./topology-world";

type SourceRef<T> = { current: T; };

export interface TopologyMapInstrumentationSources {
  scene: {
    canvasRef: SourceRef<HTMLCanvasElement | null>;
    viewportRef: SourceRef<{ width: number; height: number; dpr: number; }>;
    worldRef: SourceRef<TopologyWorld | null>;
    simRef: SourceRef<ForceSimulation | null>;
    clusteredIdsRef: SourceRef<ReadonlySet<string>>;
    clusterChipsRef: SourceRef<readonly ClusterChip[]>;
    previewEdgeHeldRef: SourceRef<OntologyMapProps["previewEdge"]>;
    domeRuntimeRef: SourceRef<DomeRuntime | null>;
    galaxyRampRef: SourceRef<number>;
    neuralRampRef: SourceRef<number>;
    reducedMotionRef: SourceRef<boolean>;
  };
  interaction: {
    handlersRef: SourceRef<TopologyPointerHandlers | null>;
    pointerMachineRef: SourceRef<PointerMachineState>;
    nodeDragRef: SourceRef<NodeDragState | null>;
    cameraRef: SourceRef<CameraAxes>;
    cameraTargetRef: SourceRef<CameraTarget>;
    hoveredNodeIdRef: SourceRef<string | null>;
    drawnHoveredNodeIdRef: SourceRef<string | null>;
    focusedSlugRef: SourceRef<string | null>;
    selectedEdgeRef: SourceRef<{
      sourceId: string;
      targetId: string;
      relationType?: string;
    } | null>;
    agentFocusNodeIdRef: SourceRef<string | null>;
  };
  activity: {
    idleDebugEnabledRef: SourceRef<boolean>;
    lastActiveCausesRef: SourceRef<{ t: number; causes: string[]; } | null>;
    heatRef: SourceRef<number>;
    lastInputMsRef: SourceRef<number>;
    lastActiveMsRef: SourceRef<number>;
  };
  lens: {
    mapLensKindRef: SourceRef<TopologyMapLensKind>;
    spotlightIdsRef: SourceRef<ReadonlySet<string> | null>;
    pathEdgeIdsRef: SourceRef<ReadonlySet<string> | null>;
    visitedTrailRef: SourceRef<readonly string[]>;
    trailLensRampRef: SourceRef<number>;
    drawnFarTRef: SourceRef<number>;
  };
}

export function useTopologyMapInstrumentation({
  scene,
  interaction,
  activity,
  lens,
}: TopologyMapInstrumentationSources): void {
  const {
    canvasRef,
    viewportRef,
    worldRef,
    simRef,
    clusteredIdsRef,
    clusterChipsRef,
    previewEdgeHeldRef,
    domeRuntimeRef,
    galaxyRampRef,
    neuralRampRef,
    reducedMotionRef,
  } = scene;
  const {
    handlersRef,
    pointerMachineRef,
    nodeDragRef,
    cameraRef,
    cameraTargetRef,
    hoveredNodeIdRef,
    drawnHoveredNodeIdRef,
    focusedSlugRef,
    selectedEdgeRef,
    agentFocusNodeIdRef,
  } = interaction;
  const {
    idleDebugEnabledRef,
    lastActiveCausesRef,
    heatRef,
    lastInputMsRef,
    lastActiveMsRef,
  } = activity;
  const {
    mapLensKindRef,
    spotlightIdsRef,
    pathEdgeIdsRef,
    visitedTrailRef,
    trailLensRampRef,
    drawnFarTRef,
  } = lens;

  /**
   * ★ Inspection hook — an automation window attached only under `?e2e=1`.
   * **Not a product API.**
   *
   * The 2026-07-31 accident: six consecutive attempts to reproduce node-drag
   * lag **only ever dragged the background**. The only way to aim at a node
   * from outside was sweeping the canvas for a `pointer` cursor, but that is a
   * **hover hit**, not **grabbable** — a grab must also pass
   * `sim.hasNode(pressedNodeId)`, and failing that it silently becomes a pan.
   * Node drag and pan then set **the same `grabbing`** cursor
   * (`topology-pointer-handlers.ts`), so even checking afterwards was
   * impossible. Every run answered "it isn't slow here", until the owner looked
   * at the screen: *"You are shaking the background, not a node."*
   *
   * > **A state you cannot distinguish from outside cannot be tested from
   * > outside.**
   *
   * So two things are exposed: a node's **screen position and whether it is
   * grabbable** (aiming), and whether the current drag is **a node or the
   * background** (confirming). Both are getters reading refs on call, so the
   * per-frame cost is zero.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("e2e")) return;
    // Enable idle-gate cause recording, only in sessions where the window is
    // attached (`lastActiveCausesRef`).
    idleDebugEnabledRef.current = true;
    const hook = {
      /**
       * The names of the activity flags that last kept a frame awake, when that
       * was, and a few of the raw values feeding the idle gate. In a "it never
       * sleeps" regression this is the only window that names **the cause —
       * which flag** — rather than the symptom (CPU per second).
       */
      idleDebug: () => ({
        lastActive: lastActiveCausesRef.current,
        heat: heatRef.current,
        lastInputMs: lastInputMsRef.current,
        lastActiveMs: lastActiveMsRef.current,
        hovered: hoveredNodeIdRef.current,
        pointerPhase: pointerMachineRef.current.phase,
      }),
      /** Nodes as drawn; coordinates are **CSS pixels**, the mouse coordinate space. */
      nodes: () => {
        const world = worldRef.current;
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!world || !camera || width <= 0) return [];
        const tokens = readOntologyMapTokensOrNull();
        const sim = simRef.current;
        const clustered = clusteredIdsRef.current;
        const preview = previewEdgeHeldRef.current;
        // In 3D the instrument reports the **drawn** coordinates. Reading
        // anything but the frame map the draw last produced would measure the
        // instrument's own imagination rather than the screen (the same
        // principle as the edge instrument below). Mid-rotation it is still
        // *this frame's* coordinates.
        const domeFrame =
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeRuntimeRef.current.frame
            : null;
        const drawnAlphas = lastDrawnNodeAlphas();
        return world.nodes.map((n) => {
          const dOff = domeFrame?.get(n.id) ?? { dx: 0, dy: 0, s: 1 };
          return {
            id: n.id,
            kind: n.kind,
            label: n.label,
            // The inverse of screenToWorld, using the same camera, so they
            // cannot disagree.
            x: (n.x + dOff.dx - camera.x.value) * camera.scale.value + width / 2,
            y: (n.y + dOff.dy - camera.y.value) * camera.scale.value + height / 2,
            /** ★ Not checking this produced six wrong answers: a node absent from the sim pans instead of dragging. */
            draggable: sim?.hasNode(n.id) ?? false,
            /** W6 agent ring — reports the same decision the draw uses
             *  (`agentFocusNodeIdRef`). e2e cannot read canvas pixels, so this
             *  typed signal is the only window onto "is the ring actually on this
             *  node". */
            agentFocus: agentFocusNodeIdRef.current === n.id,
            /** A collapsed subtree is replaced by a chip and is not on screen. */
            hidden: isPreviewEndpointHidden(clustered?.has(n.id) ?? false, preview, n.id),
            /**
             * The alpha the **tier and ego passes** left this node at. `hidden`
             * says "collapsed"; it does not say "drawn": at the overview the
             * density gate keeps capabilities at alpha 0 with `hidden` false, and
             * a spec that read `hidden` alone counted 26 invisible discs as on
             * screen (2026-09-03).
             *
             * ⚠️ It is **not** what the frame painted. The lens sink
             * (`spotlightSink`) and the growth-replay ramp are applied later, in
             * the draw itself, and never reach this number: with the path lens on,
             * every node still reports full ink while the screen plainly sinks
             * everything off the path, and a growth replay that grew from 91 to
             * 1,134 lit pixels reports one unchanging state (measured 2026-09-20,
             * three times in one day before the cause was found). Nodes are drawn
             * in more than one pass, so recording `ctx.globalAlpha` at any single
             * one of them is worse than this: a first attempt reported the darkest
             * nodes on screen (median 43 of 765) as `1.00` and the sunk ones
             * (median 195) as `0.30`.
             *
             * To ask what a person can see under a lens or a replay, sample the
             * canvas pixels — `map-path-lens-sink.spec.ts` does, and it is the
             * only method that has agreed with the screen so far.
             */
            alpha: drawnAlphas.get(n.id) ?? 1,
            previewEndpoint: isPreviewEndpoint(preview, n.id),
            /**
             * ★ For the graph-readability instrument: overlap cannot be counted
             * without radii. Uses the **same formula** as the draw
             * (`radiusForKind × magnitudeScale` in `topology-frame-draw.ts`, times
             * the camera zoom for the screen radius). Diverging formulas measure
             * the instrument's imagination, not the screen.
             */
            radius: tokens
              ? radiusForKind(n.kind, tokens) *
              n.magnitudeScale *
              camera.scale.value *
              dOff.s
              : 0,
          };
        });
      },
      /**
       * **Edges** as drawn, in the same CSS pixel space as the nodes.
       *
       * Why expose this (2026-08-03): this app's primary surface is a node-link
       * graph and **edge crossings had never once been counted**. Node specs
       * (shape, radius, parity) had gates; whether the map reads as a graph had
       * no numbers at all.
       *
       * Purchase (1997, Graph Drawing) sets the priority: **reducing edge
       * crossings matters overwhelmingly most** for human comprehension, while
       * maximising angular resolution and grid snapping were not statistically
       * significant. So only crossings and overlap are exposed.
       *
       * Edges attached to a `hidden` node are excluded — counting crossings of
       * lines nobody can see produces numbers that do not describe the screen.
       */
      edges: () => {
        const world = worldRef.current;
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!world || !camera || width <= 0) return [];
        const clustered = clusteredIdsRef.current;
        const toScreenX = (x: number) => (x - camera.x.value) * camera.scale.value + width / 2;
        const toScreenY = (y: number) => (y - camera.y.value) * camera.scale.value + height / 2;
        // The same per-endpoint frame offsets the draw uses
        // (`projectEdgePoints`).
        const domeFrame =
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeRuntimeRef.current.frame
            : null;
        const EDGE_ZERO = { dx: 0, dy: 0, s: 1 };
        const edgeOff = (nodeId: string) => domeFrame?.get(nodeId) ?? EDGE_ZERO;
        const selected = selectedEdgeRef.current;
        const pathEdges = pathEdgeIdsRef.current;
        const constellationIds =
          mapLensKindRef.current === "constellation" ? spotlightIdsRef.current : null;
        const walkedEdges = buildWalkedEdgeKeys(visitedTrailRef.current);
        const trailVisible = trailLensRampRef.current > 0.001;
        return world.edges
          .filter((e) => !clustered?.has(e.sourceId) && !clustered?.has(e.targetId))
          .map((e) => {
            const offA = edgeOff(e.sourceId);
            const offB = edgeOff(e.targetId);
            const control = projectDomeEdgeControl(e, domeFrame, domeRuntimeRef.current?.model.arrangement ?? "ownership", camera.scale.value, reducedMotionRef.current ? undefined : neuralRampRef.current);
            const walkedKey = e.sourceId < e.targetId
              ? `${e.sourceId} ${e.targetId}`
              : `${e.targetId} ${e.sourceId}`;
            const isSelected = selected !== null &&
              selected.sourceId === e.sourceId &&
              selected.targetId === e.targetId &&
              (selected.relationType === undefined || selected.relationType === e.kind);
            const visible =
              galaxyRampRef.current <= 0.001 ||
              isGalaxyEdgeVisible(e, {
                focusedNodeId: focusedSlugRef.current,
                hoveredNodeId: drawnHoveredNodeIdRef.current,
                selected: isSelected,
                path:
                  (e.id !== undefined && (pathEdges?.has(e.id) ?? false)) ||
                  (constellationIds?.has(e.sourceId) === true &&
                    constellationIds.has(e.targetId)),
                walked: trailVisible && walkedEdges.has(walkedKey),
              });
            return {
              sourceId: e.sourceId,
              targetId: e.targetId,
              kind: e.kind,
              visible,
              hidden: !visible,
              ax: toScreenX(e.ax + offA.dx),
              ay: toScreenY(e.ay + offA.dy),
              bx: toScreenX(e.bx + offB.dx),
              by: toScreenY(e.by + offB.dy),
              /**
               * ★ So the instrument measures **the curve that is drawn**, not its
               * chord. The draw path is `quadraticCurveTo(control, b)`
               * (`topology-frame-draw.ts`); joining endpoints instead counts
               * crossings that are not on screen and misses crossings that are —
               * measuring an approximation rather than the map.
               */
              controlX: toScreenX(control.x),
              controlY: toScreenY(control.y),
            };
          });
      },
      /**
       * **The edge the app would select** at `(x, y)`, or null on no hit.
       *
       * Why it has to exist (2026-08-03): nodes can be driven from outside via
       * `nodes()` coordinates, but **edges could not be**. Measured: clicking
       * 101 points along a curve's midline across 3 offsets left
       * `selection().edge` null every time (7 px threshold, excluding node
       * bodies). So **no change touching edges could be verified
       * automatically**, and an attempt to give the edge panel enter/exit
       * motion was reverted at that wall.
       *
       * It calls **the same function as the pointer handlers** rather than
       * recomputing coordinates: an instrument with its own formula measures
       * its imagination, not the screen.
       */
      edgeAt: (x: number, y: number, thresholdPx?: number) => {
        const e = handlersRef.current?.probeEdgeAt(x, y, thresholdPx);
        return e ? { sourceId: e.sourceId, targetId: e.targetId, kind: e.kind } : null;
      },
      /** What is being dragged, since a node and the background look identical on screen. */
      interaction: () => {
        const drag = nodeDragRef.current;
        if (drag) return { kind: "node" as const, nodeId: drag.nodeId };
        if (pointerMachineRef.current.phase === "dragging") return { kind: "pan" as const, nodeId: null };
        return { kind: "idle" as const, nodeId: null };
      },
      /** Canvas backing size, to confirm the interaction resolution cap actually applied. */
      backing: () => {
        const c = canvasRef.current;
        return c ? { width: c.width, height: c.height, dpr: window.devicePixelRatio } : null;
      },
      /** Where the map is looking — for verifying deep links, dives and fit-view. */
      /**
       * The altitude the last frame drew, 0 (circuit) to 1 (constellation).
       *
       * Exposed because it is the axis the galaxy rides on and the canvas has no DOM a test can
       * read it from — the same reason every other entry here exists.
       */
      altitude: () => drawnFarTRef.current,
      camera: () => {
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!camera) return null;
        return { x: camera.x.value, y: camera.y.value, scale: camera.scale.value, width, height };
      },
      /**
       * **Where the map is heading**, as opposed to where it currently is.
       *
       * The destination is set in one step when something changes the available
       * area; the position then interpolates toward it over several frames. A
       * test that samples the position has to pick a wall-clock moment and
       * therefore measures the machine as much as the product —
       * `design-gates.md` says as much: gate by call count, not milliseconds.
       * Reading the target instead makes "did the resize aim the camera at the
       * new area" answerable without timing anything.
       */
      cameraTarget: () => {
        const target = cameraTargetRef.current;
        return { x: target.tx, y: target.ty, scale: target.tscale };
      },
      /**
       * Live horizontal obstruction measured by the same product function the
       * camera consumes. This distinguishes a desktop side inspector from a
       * mobile full-width sheet without copying the classification into E2E.
       */
      obstacleInsets: () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const box = canvas.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return null;
        return measureCanvasInsets(canvas, {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        });
      },
      /**
       * Dome pose — where the dome is looking and whether it still spins by
       * itself. Canvas pixels cannot distinguish yaw, pitch or the armed state
       * from outside, so this is the window for verifying the auto-spin stop,
       * the pitch range and the selection reframe. Null in 2D (dome off), which
       * is distinguishable from the instrument being absent.
       */
      dome: () => {
        const d = domeRuntimeRef.current;
        if (d === null) return null;
        return {
          yaw: d.yaw,
          pitch: d.pitch,
          /*
           * The pose the pointer **commanded**. Its gap from `yaw` is how far
           * behind the hand the dome trails, and there is no way to see that
           * from outside the canvas — pixels show "the dome turns", never "the
           * dome turns late". Lowering the smoothing τ from 45 to 14 ms on
           * 2026-08-19 was decided by measuring this value.
           */
          yawTarget: d.yawTarget,
          pitchTarget: d.pitchTarget,
          yawVel: d.yawVel,
          pitchVel: d.pitchVel,
          orbiting: d.orbiting,
          spinArmed: d.spinArmed,
          /*
           * Tier torsion (follow-through) — **from outside the canvas this is
           * the only thing that says whether the dome reacts to its own
           * motion.** Pixels cannot tell a ring that lagged from a ring simply
           * drawn that way. Requiring this to be non-zero during a
           * programmatic pose move is what makes "a click reframe does not turn
           * as a rigid block" verifiable from outside.
           */
          lag: { ...d.lag },
          /*
           * The meaningful landing a release aimed at. From outside the canvas
           * there is no way to tell inertia that happened to stop from a stop
           * that was aimed; this value is that distinction.
           */
          yawSnap: d.yawSnap,
          poseTween: d.poseTween !== null,
          active: d.active,
          ramp: d.rampClock / DOME_ASSEMBLE_TOTAL_MS,
          /*
           * Is the entry sweep still putting the pose down? It has its **own**
           * clock, 1500 ms against the assembly's 1120 ms (`dome-view.ts`), so
           * `ramp >= 1` is not "the dome has arrived" — the last 380 ms of turning
           * happens after it. E2E had no way to see that and slept 4 seconds to
           * cover both, which asserts the machine's speed rather than the dome's
           * state; the idle gate already reads this flag for the same reason.
           */
          entryArmed: d.entryArmed,
          /*
           * Lit 3D (2026-09-25) — the fly-to in effect (the node it framed) and how many
           * drawn nodes wore each evidence light in the last frame. What the frame
           * painted, so a spec compares it with the legend's measured counts.
           */
          flight: d.flight?.slug ?? null,
          flyPending: d.flyRequest !== null,
          light: lastLitStateCounts(),
        };
      },
      /**
       * The node the map is **pointing at via hover** — the same value whether
       * the cursor is over the canvas or over a row in a side panel (chat, data
       * sheet).
       *
       * Why it exists (2026-08-17): there was **no way from outside** to check
       * the contract that hovering a panel row makes the map point at that
       * node. The canvas has no DOM, leaving only pixel comparison, and pixels
       * say "something changed" but never "that node" — pointing at the wrong
       * node would still pass green.
       */
      hover: () => drawnHoveredNodeIdRef.current,
      /** What is selected: one node, or one edge's endpoint pair. */
      selection: () => ({
        nodeId: focusedSlugRef.current,
        edge: selectedEdgeRef.current,
      }),
      /**
       * Density-gate chips — where "+24 really reveals 24" is verified. A chip
       * once claimed 24 while exactly 1 was drawn, because the tier gate did
       * not honour the chip expansion. Reporting the claim (`count`) beside the
       * reality (`shownChildren`) is what makes that mismatch catchable from
       * outside.
       */
      /**
       * The label boxes the last frame drew, in CSS pixels — the only way to see
       * label collision from outside. The canvas has no DOM, so a spec can
       * otherwise only diff pixels, which reports "something changed" and never
       * "these two names sit on top of each other". Node centres are not a
       * substitute: a frame measured **zero** disc overlaps while names visibly
       * crossed (2026-08-22). Names collide long before discs do.
       */
      labels: () => lastDrawnLabelBoxes(),
      relationCaptions: () => lastDrawnRelationCaptions(),
      chips: () => {
        const world = worldRef.current;
        const clustered = clusteredIdsRef.current;
        return clusterChipsRef.current.map((chip) => {
          // The chip claims its whole folded subtree, so reality has to be read
          // over the same span: counting the first rank alone reported 10 against
          // a claim of 18 and would have called an honest chip a liar.
          const seen = new Set<string>();
          const stack = [...(world?.childrenByParent.get(chip.parentId) ?? [])];
          let shown = 0;
          while (stack.length > 0) {
            const id = stack.pop() as string;
            if (seen.has(id)) continue;
            // Domains are exempt from folding, so they are not the chip's to show.
            if (world?.nodeById.get(id)?.kind === "domain") continue;
            seen.add(id);
            if (!clustered.has(id)) shown += 1;
            const grandChildren = world?.childrenByParent.get(id);
            if (grandChildren) stack.push(...grandChildren);
          }
          return {
            parentId: chip.parentId,
            claimedCount: chip.count,
            expanded: chip.expanded,
            /** Descendants of this parent that are not collapsed, i.e. can be drawn. */
            shownChildren: shown,
          };
        });
      },
    };
    (window as unknown as { __atlasMap?: typeof hook; }).__atlasMap = hook;
    return () => {
      delete (window as unknown as { __atlasMap?: typeof hook; }).__atlasMap;
    };
  }, [
    agentFocusNodeIdRef,
    cameraRef,
    cameraTargetRef,
    canvasRef,
    clusterChipsRef,
    clusteredIdsRef,
    domeRuntimeRef,
    drawnFarTRef,
    drawnHoveredNodeIdRef,
    focusedSlugRef,
    galaxyRampRef,
    handlersRef,
    heatRef,
    hoveredNodeIdRef,
    idleDebugEnabledRef,
    lastActiveCausesRef,
    lastActiveMsRef,
    lastInputMsRef,
    mapLensKindRef,
    neuralRampRef,
    nodeDragRef,
    pathEdgeIdsRef,
    pointerMachineRef,
    previewEdgeHeldRef,
    reducedMotionRef,
    selectedEdgeRef,
    simRef,
    spotlightIdsRef,
    trailLensRampRef,
    viewportRef,
    visitedTrailRef,
    worldRef,
  ]);
}
