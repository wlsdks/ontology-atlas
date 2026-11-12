"use client";

import { useEffect } from "react";

import type { CameraAxes, CameraTarget } from "../../engine/camera";
import { measureCanvasInsets } from "../../interaction/free-area";
import type { PointerMachineState } from "../../interaction/pointer-state-machine";
import type { ClusterChip } from "../../model/layout/density-gate";
import { projectDomeEdgeControl } from "../../model/dome-view/dome-edge";
import { DOME_ASSEMBLE_TOTAL_MS } from "../../model/dome-view/frame";
import type { DomeRuntime } from "../../model/dome-view/runtime";
import type { ForceSimulation } from "../../model/layout/force-layout";
import type { TopologyMapLensKind } from "../../model/visibility/path-lens";
import { isPreviewEndpoint, isPreviewEndpointHidden } from "../../render/preview-edge";
import type { OntologyMapProps } from "../OntologyMap";
import type { StrataLodState } from "../../model/dome-view/strata-lod";
import {
  lastDrawnLabelBoxes,
  lastDrawnLod,
  lastDrawnNodeAlphas,
  lastDrawnRelationCaptions,
  lastDrawnSkyTimeMs,
  lastLitStateCounts,
  setMapComets,
} from "../frame-draw/topology-frame-draw";
import type {
  NodeDragState,
  TopologyPointerHandlers,
} from "../input/topology-pointer-types";
import { lastTierPlanes } from "../frame-loop/topology-presentation-frame-stage";
import { describeLastDialFrame, lastDialFrame } from "../../dial/frame/frame";
import type { DialProbe } from "../../dial/types";
import { requestOntologyMapFrame } from "../frame-loop/use-topology-frame-loop";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import {
  radiusForKind,
  type TopologyWorld,
} from "../world/topology-world";
import { lastFocusFrame } from "../camera/topology-camera-math";

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
    domeModelBuildRef: SourceRef<unknown>;
    domeLodRef: SourceRef<StrataLodState>;
    neuralRampRef: SourceRef<number>;
    reducedMotionRef: SourceRef<boolean>;
    appearRef: SourceRef<Map<string, number>>;
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
    homeSpringsRef: SourceRef<ReadonlyMap<string, unknown>>;
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
    domeModelBuildRef,
    domeLodRef,
    neuralRampRef,
    reducedMotionRef,
    appearRef,
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
    homeSpringsRef,
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
   * Inspection hook attached only under `?e2e=1`; not a product API. Exposes a node's screen position
   * and grabbability (aiming), and whether the drag is a node or background (confirming).
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
        homeSprings: homeSpringsRef.current.size,
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
             * The alpha the tier and ego passes left this node at. `hidden` means collapsed, not drawn.
             * It is not what the frame painted: the lens sink and growth-replay ramp apply later in the draw.
             * To see what a person sees under a lens or replay, sample the canvas pixels.
             */
            alpha: drawnAlphas.get(n.id) ?? 1,
            appear: appearRef.current.get(n.id) ?? 1,
            previewEndpoint: isPreviewEndpoint(preview, n.id),
            /**
             * ★ For the graph-readability instrument: overlap cannot be counted
             * without radii. Uses the **same formula** as the draw
             * (`radiusForKind × magnitudeScale` in `frame-draw/paint-nodes.ts`, times
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
       * Edges as drawn, in the same CSS pixel space as the nodes, for counting crossings and overlap.
       * Edges attached to a `hidden` node are excluded; invisible lines do not describe the screen.
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
                return world.edges
          .filter((e) => !clustered?.has(e.sourceId) && !clustered?.has(e.targetId))
          .map((e) => {
            const offA = edgeOff(e.sourceId);
            const offB = edgeOff(e.targetId);
            const control = projectDomeEdgeControl(e, domeFrame, domeRuntimeRef.current?.model.arrangement ?? "ownership", camera.scale.value, reducedMotionRef.current ? undefined : neuralRampRef.current);
            const visible = true;
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
                         * (`frame-draw/paint-edges.ts`); joining endpoints instead counts
                         * crossings that are not on screen and misses crossings that are —
                         * measuring an approximation rather than the map.
                         */
                        controlX: toScreenX(control.x),
                        controlY: toScreenY(control.y),
                    };
                });
            },
            /**
             * The edge the app would select at `(x, y)`, or null. Calls the same function as the pointer
             * handlers, so external instruments do not measure with their own formula.
             */
            edgeAt: (x: number, y: number, thresholdPx?: number) => {
                const e = handlersRef.current?.probeEdgeAt(x, y, thresholdPx);
                return e ? { sourceId: e.sourceId, targetId: e.targetId, kind: e.kind } : null;
            },
            /** What is being dragged, since a node and the background look identical on screen. */
            interaction: () => {
                const drag = nodeDragRef.current;
                if (drag)
                    return { kind: "node" as const, nodeId: drag.nodeId };
                if (pointerMachineRef.current.phase === "dragging")
                    return { kind: "pan" as const, nodeId: null };
                return { kind: "idle" as const, nodeId: null };
            },
            /** Canvas backing size, to confirm the interaction resolution cap actually applied. */
            backing: () => {
                const c = canvasRef.current;
                return c ? { width: c.width, height: c.height, dpr: window.devicePixelRatio } : null;
            },
            /** Where the map is looking — for verifying deep links, dives and fit-view. */
            altitude: () => drawnFarTRef.current,
            skyTime: () => lastDrawnSkyTimeMs(),
            camera: () => {
                const camera = cameraRef.current;
                const { width, height } = viewportRef.current;
                if (!camera)
                    return null;
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
            focusFrame: () => {
                const frame = lastFocusFrame();
                const camera = cameraRef.current;
                const { width, height } = viewportRef.current;
                if (!frame || !camera || width <= 0) return null;
                const toX = (x: number) => (x - camera.x.value) * camera.scale.value + width / 2;
                const toY = (y: number) => (y - camera.y.value) * camera.scale.value + height / 2;
                const centreX = (frame.bounds.minX + frame.bounds.maxX) / 2;
                const centreY = (frame.bounds.minY + frame.bounds.maxY) / 2;
                return {
                    left: toX(frame.bounds.minX), right: toX(frame.bounds.maxX), top: toY(frame.bounds.minY), bottom: toY(frame.bounds.maxY),
                    aimX: (centreX - frame.aim.tx) * frame.scale + width / 2,
                    aimY: (centreY - frame.aim.ty) * frame.scale + height / 2,
                };
            },
            /**
             * Live horizontal obstruction measured by the same product function the
             * camera consumes. This distinguishes a desktop side inspector from a
             * mobile full-width sheet without copying the classification into E2E.
             */
            obstacleInsets: () => {
                const canvas = canvasRef.current;
                if (!canvas)
                    return null;
                const box = canvas.getBoundingClientRect();
                if (box.width <= 0 || box.height <= 0)
                    return null;
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
                if (d === null)
                    return null;
                return {
                    yaw: d.yaw,
                    pitch: d.pitch,
                    /*
                     * The pose the pointer commanded; its gap from `yaw` is how far the dome trails the hand, which
                     * pixels cannot show.
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
                     * clock, 1500 ms against the assembly's 1120 ms (`dome-view/`), so
                     * `ramp >= 1` is not "the dome has arrived" — the last 380 ms of turning
                     * happens after it. E2E had no way to see that and slept 4 seconds to
                     * cover both, which asserts the machine's speed rather than the dome's
                     * state; the idle gate already reads this flag for the same reason.
                     */
                    entryArmed: d.entryArmed,
                    settling: domeModelBuildRef.current !== null,
                    /*
                     * The fly-to in effect (the node it framed) and how many drawn nodes wore each evidence light in the
                     * last frame, so a spec can compare it with the legend's counts.
                     */
                    flight: d.flight?.slug ?? null,
                    flyPending: d.flyRequest !== null,
                    light: lastLitStateCounts(),
                    lod: {
                        active: domeLodRef.current.active,
                        capability: domeLodRef.current.planeResolve.capability,
                        element: domeLodRef.current.planeResolve.element,
                        spacingPx: { ...domeLodRef.current.spacingPx },
                        gap: domeLodRef.current.index === null ? null : { ...domeLodRef.current.index.planeGap },
                        count: domeLodRef.current.index === null ? null : { ...domeLodRef.current.index.planeCount },
                        hoverSlot: domeLodRef.current.hoverSlot,
                        hoverRamp: domeLodRef.current.hoverSlot >= 0 ? domeLodRef.current.ramps[domeLodRef.current.hoverSlot] ?? 0 : 0,
                        focusSlot: domeLodRef.current.focusSlot,
                        sheets: domeLodRef.current.shapeCount,
                        dust: lastDrawnLod().dust,
                        dustStates: lastDrawnLod().dustStates,
                        evidenceRamp: domeLodRef.current.evidenceRamp,
                        chords: lastDrawnLod().chords,
                        chordEdges: lastDrawnLod().represented,
                        hiddenEdges: lastDrawnLod().hidden,
                        settling: domeLodRef.current.settling,
                    },
                };
            },
            /**
             * The node the map points at via hover, whether the cursor is over the canvas or a side-panel row.
             * The canvas has no DOM, so pixels cannot say which node.
             */
            hover: () => drawnHoveredNodeIdRef.current,
            /** What is selected: one node, or one edge's endpoint pair. */
            selection: () => ({
                nodeId: focusedSlugRef.current,
                edge: selectedEdgeRef.current,
            }),
            select: (id: string | null) => {
                focusedSlugRef.current = id;
                hoveredNodeIdRef.current = null;
                lastInputMsRef.current = performance.now();
                lastActiveMsRef.current = lastInputMsRef.current;
            },
            /**
             * Density-gate chips — where "+24 really reveals 24" is verified. A chip
             * once claimed 24 while exactly 1 was drawn, because the tier gate did
             * not honour the chip expansion. Reporting the claim (`count`) beside the
             * reality (`shownChildren`) is what makes that mismatch catchable from
             * outside.
             */
            /**
             * The label boxes the last frame drew, in CSS pixels: the only way to see label collision from
             * outside, since names collide long before discs do.
             */
            setComets: (on: boolean) => {
                setMapComets(on);
                lastActiveMsRef.current = performance.now();
            },
            wake: () => {
                lastActiveMsRef.current = performance.now();
                requestOntologyMapFrame();
            },
            labels: () => lastDrawnLabelBoxes(),
            dial: (): DialProbe | {
                owns: false;
            } => {
                const { width, height } = viewportRef.current;
                return describeLastDialFrame(width, height) ?? { owns: false };
            },
            /** Whether the drawn attention motion has landed; cheap enough to poll every frame. */
            dialMotionSettled: () => lastDialFrame()?.branchMembersAnimating !== true,
            relationCaptions: () => lastDrawnRelationCaptions(),
            /** Strata's planes as the last frame drew them — what the tier names are placed against. */
            tierPlanes: () => lastTierPlanes(),
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
                        if (seen.has(id))
                            continue;
                        // Domains are exempt from folding, so they are not the chip's to show.
                        if (world?.nodeById.get(id)?.kind === "domain")
                            continue;
                        seen.add(id);
                        if (!clustered.has(id))
                            shown += 1;
                        const grandChildren = world?.childrenByParent.get(id);
                        if (grandChildren)
                            stack.push(...grandChildren);
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
        (window as unknown as {
            __atlasMap?: typeof hook;
        }).__atlasMap = hook;
        return () => {
            delete (window as unknown as {
                __atlasMap?: typeof hook;
            }).__atlasMap;
        };
    }, [
        agentFocusNodeIdRef,
        appearRef,
        cameraRef,
        cameraTargetRef,
        canvasRef,
        clusterChipsRef,
        clusteredIdsRef,
        domeLodRef,
        domeModelBuildRef,
        domeRuntimeRef,
        drawnFarTRef,
        drawnHoveredNodeIdRef,
        focusedSlugRef,
        handlersRef,
        heatRef,
        homeSpringsRef,
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
        worldRef
    ]);
}
