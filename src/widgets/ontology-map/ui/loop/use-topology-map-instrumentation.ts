"use client";

import { useEffect } from "react";

import type { CameraAxes, CameraTarget } from "../../engine/camera";
import { measureCanvasInsets } from "../../interaction/free-area";
import type { PointerMachineState } from "../../interaction/pointer-state-machine";
import type { ClusterChip } from "../../model/layout/density-gate";
import type { ForceSimulation } from "../../model/layout/force-layout";
import type { TopologyMapLensKind } from "../../model/visibility/path-lens";
import { isPreviewEndpoint, isPreviewEndpointHidden } from "../../render/preview-edge";
import type { OntologyMapProps } from "../OntologyMap";
import {
  lastDrawnLabelBoxes,
  lastDrawnNodeAlphas,
  lastDrawnRelationCaptions,
  lastDrawnSkyTimeMs,
  setMapComets,
} from "../frame-draw/topology-frame-draw";
import type {
  NodeDragState,
  TopologyPointerHandlers,
} from "../input/topology-pointer-types";
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
        const drawnAlphas = lastDrawnNodeAlphas();
        return world.nodes.map((n) => {
          return {
            id: n.id,
            kind: n.kind,
            label: n.label,
            // The inverse of screenToWorld, using the same camera, so they
            // cannot disagree.
            x: (n.x - camera.x.value) * camera.scale.value + width / 2,
            y: (n.y - camera.y.value) * camera.scale.value + height / 2,
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
              camera.scale.value
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
                return world.edges
          .filter((e) => !clustered?.has(e.sourceId) && !clustered?.has(e.targetId))
          .map((e) => {
            const visible = true;
                    return {
                        sourceId: e.sourceId,
                        targetId: e.targetId,
                        kind: e.kind,
                        visible,
                        hidden: !visible,
                        ax: toScreenX(e.ax),
                        ay: toScreenY(e.ay),
                        bx: toScreenX(e.bx),
                        by: toScreenY(e.by),
                        /**
                         * ★ So the instrument measures **the curve that is drawn**, not its
                         * chord. The draw path is `quadraticCurveTo(control, b)`
                         * (`frame-draw/paint-edges.ts`); joining endpoints instead counts
                         * crossings that are not on screen and misses crossings that are —
                         * measuring an approximation rather than the map.
                         */
                        controlX: toScreenX(e.controlX),
                        controlY: toScreenY(e.controlY),
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
            /** The node a press at `(x, y)` would grab, from the press's own hit test. */
            nodeAt: (x: number, y: number) => handlersRef.current?.probeNodeAt(x, y) ?? null,
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
        nodeDragRef,
        pathEdgeIdsRef,
        pointerMachineRef,
        previewEdgeHeldRef,
        selectedEdgeRef,
        simRef,
        spotlightIdsRef,
        trailLensRampRef,
        viewportRef,
        visitedTrailRef,
        worldRef
    ]);
}
