import type { CameraAxes, CameraTarget } from "../engine/camera";
import {
  isOffsetAtRest,
  orphanedOffsetIds,
  REST_OFFSET,
  seedDropOffset,
  smoothVelocity,
  snapOffset,
  springForDegree,
  stepHomeOffset,
  stepLagOffset,
  type SpringOffset,
} from "../expressive/release-offsets";
import { tugFactorForHop, tugFalloffForDistance } from "../interaction/drag-tug";
import type { CameraTween } from "../model/camera-easing";
import { DOME_ASSEMBLE_TOTAL_MS, type DomeRuntime } from "../model/dome-view";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import {
  isRealmOutsideCulled,
  REALM_EXIT_FLIP_MS,
  REALM_EXIT_OUTSIDE_RETURN_DELAY_MS,
  REALM_EXIT_OUTSIDE_RETURN_MS,
  REALM_INSIDE_FLIP_MS,
  REALM_OUTSIDE_FLING_MS,
  realmExitFlipDelayFor,
  realmInsideFlipDelayFor,
  realmInsidePosition,
  realmOutsidePosition,
  realmOutsideReturnPosition,
  realmTransitionReducer,
  type RealmTransitionState,
} from "../model/realm-transition";
import type { WardingFitState } from "../model/realm-warding-fit";
import {
  initHomeSpring,
  isHomeSpringConverged,
  stepHomeSpring,
  type HomeSpringState,
} from "../model/relayout-home";
import { relaxNodeSeparation, type SeparationNode } from "../model/separation";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { computeOverviewFitScale } from "./topology-camera-math";
import { overviewBoundsFor } from "./topology-overview-fit";
import type { NodeDragState } from "./topology-pointer-handlers";
import type { RealmRuntimeData } from "./topology-realm-runtime";
import { fallbackAngleFor } from "./topology-realm-runtime";
import {
  applyForcePositions,
  radiusForKind,
  recomputeWorldGeometry,
  type TopologyWorld,
} from "./topology-world";

const DRAG_TUG_EASE_TAU = 0.15;
const SCOPED_FRAME_SPARSITY = 5;
const HOME_CONVERGE_EPSILON = 0.5;

function forceIterationsForDt(dt: number): number {
  return Math.min(3, Math.max(1, Math.round(dt * 60)));
}

type SourceRef<T> = { current: T; };

export interface WorldMotionFrameStageSources {
  simRef: SourceRef<ForceSimulation | null>;
  nodeDragRef: SourceRef<NodeDragState | null>;
  heatRef: SourceRef<number>;
  homingActiveRef: SourceRef<boolean>;
  dragAffectedSetRef: SourceRef<{
    draggedId: string;
    oneHop: ReadonlySet<string>;
    twoHop: ReadonlySet<string>;
  } | null>;
  dragStartPosRef: SourceRef<{ x: number; y: number; } | null>;
  dragTugOffsetsRef: SourceRef<Map<string, SpringOffset>>;
  dragVelRef: SourceRef<{ x: number; y: number; }>;
  dragPrevPosRef: SourceRef<{ x: number; y: number; } | null>;
  dropSeededRef: SourceRef<boolean>;
  geomPrevXRef: SourceRef<Float64Array | null>;
  geomPrevYRef: SourceRef<Float64Array | null>;
  sepDisplacedIdsRef: SourceRef<Set<string>>;
  homeSpringsRef: SourceRef<Map<string, HomeSpringState>>;
  homeTargetOverrideRef: SourceRef<ReadonlyMap<string, { x: number; y: number; }> | null>;
  prevPinnedNodeIdRef: SourceRef<string | null>;
  clusteredIdsRef: SourceRef<ReadonlySet<string>>;
  expandedParentsRef: SourceRef<ReadonlySet<string>>;
  view3dRef: SourceRef<boolean>;
  domeRuntimeRef: SourceRef<DomeRuntime | null>;
  realmDataRef: SourceRef<RealmRuntimeData | null>;
  realmTransitionRef: SourceRef<RealmTransitionState>;
  realmActiveHandedOffRef: SourceRef<boolean>;
  wardingFitRef: SourceRef<WardingFitState | null>;
  reducedMotionRef: SourceRef<boolean>;
  pendingFlatCameraRef: SourceRef<{
    target: CameraTarget;
    overviewScale: number;
    gestureRevision: number;
    userDriven: boolean;
  } | null>;
  galaxyLayoutHandoffRef: SourceRef<"galaxy" | "flat" | null>;
  galaxyFlatReturnPositionsRef: SourceRef<ReadonlyMap<string, { x: number; y: number; }> | null>;
  cameraGestureRevisionRef: SourceRef<number>;
  cameraRef: SourceRef<CameraAxes>;
  cameraTargetRef: SourceRef<CameraTarget>;
  cameraTweenRef: SourceRef<CameraTween | null>;
  cameraAngularFreqRef: SourceRef<number | null>;
  dampingRef: SourceRef<number>;
  userDrivenCameraRef: SourceRef<boolean>;
  overviewScaleRef: SourceRef<number>;
  overviewFitRef: SourceRef<"spine" | "full">;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number) => void;
}

export function createWorldMotionFrameStage(sources: WorldMotionFrameStageSources) {
  const {
    simRef,
    nodeDragRef,
    heatRef,
    homingActiveRef,
    dragAffectedSetRef,
    dragStartPosRef,
    dragTugOffsetsRef,
    dragVelRef,
    dragPrevPosRef,
    dropSeededRef,
    geomPrevXRef,
    geomPrevYRef,
    sepDisplacedIdsRef,
    homeSpringsRef,
    homeTargetOverrideRef,
    prevPinnedNodeIdRef,
    clusteredIdsRef,
    expandedParentsRef,
    view3dRef,
    domeRuntimeRef,
    realmDataRef,
    realmTransitionRef,
    realmActiveHandedOffRef,
    wardingFitRef,
    reducedMotionRef,
    pendingFlatCameraRef,
    galaxyLayoutHandoffRef,
    galaxyFlatReturnPositionsRef,
    cameraGestureRevisionRef,
    cameraRef,
    cameraTargetRef,
    cameraTweenRef,
    cameraAngularFreqRef,
    dampingRef,
    userDrivenCameraRef,
    overviewScaleRef,
    overviewFitRef,
    beginCameraTween,
  } = sources;

  return function runWorldMotionFrameStage(
    now: number,
    dt: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
    width: number,
    height: number,
  ): void {
    // --- force simulation: tick ONLY while a node is pin-dragged (or its
    // brief release settle). Never on load — the static default is the
    // deterministic grid, and the camera is NOT auto-reframed here (that
    // reframing only existed to chase the removed load settle). ---
    const sim = simRef.current;
    const pinned = nodeDragRef.current !== null;
    // A user grab interrupts any in-flight auto-arrange homing —
    // the drag wins, rather than the two fighting over the node's position.
    if (pinned && homingActiveRef.current) {
      homingActiveRef.current = false;
      homeSpringsRef.current.clear();
      homeTargetOverrideRef.current = null;
    }

    // --- Warding invariant (owner bug report 2026-07-23, repro path ①): a
    // realm member released **outside** the warding ring homes back to its
    // realm target, like a rubber band. The ring is a boundary: dragging the
    // root (whose target is the origin) out and dropping it there breaks the
    // world's grammar into "a root outside its own ring". Releases inside
    // keep free placement, and auto-arrange tidies whenever asked. Reuses the
    // existing home springs plus the target override — no new motion. ---
    {
      const pinnedId = nodeDragRef.current?.nodeId ?? null;
      const releasedId = prevPinnedNodeIdRef.current !== null && pinnedId === null ? prevPinnedNodeIdRef.current : null;
      prevPinnedNodeIdRef.current = pinnedId;
      const realmData = realmDataRef.current;
      if (releasedId !== null && realmData !== null && realmTransitionRef.current.phase === "active") {
        const target = realmData.insideTargets.get(releasedId);
        const released = world.nodeById.get(releasedId);
        const radius = wardingFitRef.current?.value ?? realmData.wardingRadius;
        const outside =
          released !== undefined &&
          Math.hypot(released.x - realmData.wardingCenter.x, released.y - realmData.wardingCenter.y) > radius;
        if (target && released && outside) {
          // Re-homed set = the released node plus the realm members inside
          // this drag's tug reach (1- and 2-hop). Springing only the released
          // node freezes the tugged neighbours at their displacement, because
          // the heat = 0 below cuts the path where a normal release's settle
          // eases the tug back to 0. A warding violation tidies the whole
          // disturbed group — the same grammar as a scoped relayout.
          const affected = dragAffectedSetRef.current;
          const springIds = new Set<string>([releasedId]);
          if (affected !== null && affected.draggedId === releasedId) {
            for (const id of affected.oneHop) springIds.add(id);
            for (const id of affected.twoHop) springIds.add(id);
          }
          // The home springs own the coordinates instead of the settle
          // burst, so heat and tug are folded away and the two never fight
          // over the same node — the same exclusivity contract as relayout.
          heatRef.current = 0;
          dragAffectedSetRef.current = null;
          dragTugOffsetsRef.current.clear();
          const springs = new Map(homeSpringsRef.current);
          const override = new Map(homeTargetOverrideRef.current ?? []);
          for (const id of springIds) {
            const t = realmData.insideTargets.get(id);
            const n = world.nodeById.get(id);
            if (!t || !n) continue;
            springs.set(id, initHomeSpring(n.x, n.y));
            override.set(id, t);
          }
          homeSpringsRef.current = springs;
          homeTargetOverrideRef.current = override;
          homingActiveRef.current = true;
          // Reseed the sim's own coordinates at the return targets, so the
          // next drag's `applyForcePositions` does not write back the stale
          // drop positions. With heat = 0 the sim does not tick until the
          // springs converge, which makes seeding at the targets safe.
          simRef.current = createForceSimulation(
            world.nodes.map((n) => {
              const t = override.get(n.id);
              return { id: n.id, x: t?.x ?? n.x, y: t?.y ?? n.y };
            }),
            world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
          );
        }
      }
    }
    /*
     * ★ **A fully assembled dome does not run 2D physics** (measured
     * 2026-08-19).
     *
     * `updateDomeFrame`'s offset is `dx = (p.wx − node.x) · r` and the drawn
     * coordinate is `node.x + dx`, so with the tier ramps full (r = 1) it
     * **cancels exactly to `p.wx`**: no mark on an assembled dome depends on
     * the 2D coordinates. `dome.model.coords` is rebuilt only when the
     * `world` object's *identity* changes, so freezing those coordinates for
     * a frame moves the dome by zero pixels.
     *
     * But a 3D node drag sets `nodeDragRef` (the handle for the dome's
     * in-plane drag), making `pinned` true and running **the entire 2D
     * physics pass where nothing could be seen** — FA2 plus separation over
     * all 2,000 nodes, in its worst shape, since the dome path never sets
     * `dragAffectedSetRef` and there was not even an active set. **73%** of
     * the profile's drag samples were here (resolvePair 50.9% + iterate
     * 22.6%), and 3D node-drag p95 was 52.1 ms (≈19 fps) against 2.7 ms in 2D.
     *
     * Leaving 3D finds the 2D layout exactly as it was on entry, which is the
     * better contract anyway.
     */
    const domeAssembled =
      view3dRef.current &&
      realmTransitionRef.current.phase === "idle" &&
      domeRuntimeRef.current !== null &&
      domeRuntimeRef.current.rampClock >= DOME_ASSEMBLE_TOTAL_MS;
    if (domeAssembled) {
      // Heat still drains while the pass is skipped, so leaving 3D does not
      // inherit a stale settle burst — the same time budget rule as below.
      if (!pinned && heatRef.current > 0) heatRef.current = Math.max(0, heatRef.current - dt * 1000);
    } else if (sim && (heatRef.current > 0 || pinned)) {
      // Radius-limited release settle: restrict BOTH the live-drag
      // tick and the post-release settle burst to the dragged node's own
      // cluster (itself + 1-hop + 2-hop), so far nodes never drift via FA2
      // either (matching the explicit tug's own falloff below).
      const affected = dragAffectedSetRef.current;
      // **What can move, intersected with what is drawn.**
      // Dragging a hub makes 1-hop + 2-hop most of the graph, so the hop
      // limit alone filters nothing (measured: applying the active set alone
      // went 137.6 → 137.6 ms, zero gain). A node collapsed off screen moves
      // where nobody can see it, so it is not worth computing.
      const clustered = clusteredIdsRef.current;
      const restrictToIds = affected
        ? new Set<string>(
          [affected.draggedId, ...affected.oneHop, ...affected.twoHop].filter(
            (id) => !clustered.has(id),
          ),
        )
        : null;
      // **The narrowed path wins only when the set is sparse** (measured per
      // block, 2026-07-31).
      //
      // Three things write coordinates in this frame, and one of them — the
      // neighbour tug — pushes the entire 1-/2-hop set, collapsed nodes
      // included, every frame. So "nodes that moved" is not the ~30 the audit
      // assumed but **the size of the tug's reach**: dragging the project
      // root gives 975/3000 (33%), where the index detour was a net loss
      // (geometry 0.4 → 0.6 ms), while dragging a domain gives 281/3000 (9%),
      // where the sim block fell 2.1 → 1.5 ms.
      //
      // Hence one fork: narrow when sparse, otherwise take the original full
      // path **without even taking the snapshot**. The point is to not pay
      // the cost where there is no gain.
      const nodeCount = world.nodes.length;
      const scoped =
        affected !== null &&
        (affected.oneHop.size + affected.twoHop.size + 1) * SCOPED_FRAME_SPARSITY < nodeCount;
      let prevX: Float64Array | null = null;
      let prevY: Float64Array | null = null;
      if (scoped) {
        // Snapshot the frame's starting coordinates, so the end of the frame
        // can measure what really moved and narrow the derived geometry
        // update to it.
        if (geomPrevXRef.current?.length !== nodeCount) {
          geomPrevXRef.current = new Float64Array(nodeCount);
          geomPrevYRef.current = new Float64Array(nodeCount);
        }
        prevX = geomPrevXRef.current!;
        prevY = geomPrevYRef.current!;
        for (let i = 0; i < nodeCount; i += 1) {
          prevX[i] = world.nodes[i].x;
          prevY[i] = world.nodes[i].y;
        }
      }

      sim.tick(forceIterationsForDt(dt), restrictToIds);
      // **The write-back is restricted too.** A restricted tick never
      // touches coordinates outside the subgraph, so writing those values
      // back is a pointless 3,000-element round trip. But it **must include
      // the tug neighbours and the previous frame's separation-displaced
      // nodes**: reverting their frame displacement to 0 is the existing
      // contract, and omitting them accumulates the tug offset every frame
      // until neighbours fly away.
      const applyOnly =
        scoped && affected
          ? new Set<string>([
            affected.draggedId,
            ...affected.oneHop,
            ...affected.twoHop,
            ...sepDisplacedIdsRef.current,
          ])
          : null;
      applyForcePositions(world, sim.positions(applyOnly));

      // Explicit neighbor tug: the dragged node's own per-frame
      // world-space displacement (Δ since grab) propagates to 1-hop/2-hop
      // neighbors, falling off by hop distance, eased in/out so the motion
      // reads as springy lag-then-catch-up rather than a rigid rod. Also
      // runs (easing back toward 0) during the post-release settle so the
      // offset doesn't pop away the instant the pointer lifts.
      if (affected) {
        const draggedNode = world.nodeById.get(affected.draggedId);
        const dragStart = dragStartPosRef.current;
        const factors = { oneHop: tokens.dragTug1Hop, twoHop: tokens.dragTug2Hop };
        const tugIds = new Set<string>([...affected.oneHop, ...affected.twoHop]);
        // Mass (2026-09-08, direction B): a node's release spring comes from its degree
        // (`expressive/release-offsets.ts`; the loop only owns the refs).
        const massTokens = {
          heavyDegree: tokens.massHeavyDegree,
          angFreq: tokens.massAngFreq,
          heavyZeta: tokens.massHeavyZeta,
        };
        const springFor = (id: string) => springForDegree(world.neighborMap.get(id)?.size ?? 0, massTokens);
        if (pinned && draggedNode) {
          // Remember the hand's velocity so the drop can carry it; reset the drop latch.
          const prev = dragPrevPosRef.current;
          if (prev) dragVelRef.current = smoothVelocity(dragVelRef.current, draggedNode.x - prev.x, draggedNode.y - prev.y, dt);
          dragPrevPosRef.current = { x: draggedNode.x, y: draggedNode.y };
          dropSeededRef.current = false;
        } else if (draggedNode && !dropSeededRef.current) {
          // Drop: seeded once per release. Reduced motion: the node stops where the hand left it.
          dropSeededRef.current = true;
          if (!reducedMotionRef.current) {
            dragTugOffsetsRef.current.set(
              affected.draggedId,
              seedDropOffset(dragVelRef.current.x, dragVelRef.current.y, springFor(affected.draggedId), tokens.massDropMaxPx),
            );
          }
          dragVelRef.current = { x: 0, y: 0 };
          dragPrevPosRef.current = null;
        }
        for (const id of tugIds) {
          const hop = affected.oneHop.has(id) ? 1 : 2;
          const tugged = world.nodeById.get(id);
          // Hop count says WHO may be tugged; world distance from the grab
          // point says HOW MUCH. Without the distance term a hub-and-spoke
          // vault (everything within 2 hops) drags the whole map along.
          // Measured from `dragStart`, not the dragged node's live position,
          // so the elastic neighborhood is fixed at grab time and neighbors
          // never fade in/out mid-drag.
          const falloff =
            tugged && dragStart
              ? tugFalloffForDistance(Math.hypot(tugged.x - dragStart.x, tugged.y - dragStart.y), tokens.dragTugRadius)
              : 0;
          const factor = tugFactorForHop(hop, factors) * falloff;
          let targetX = 0;
          let targetY = 0;
          if (pinned && draggedNode && dragStart) {
            targetX = (draggedNode.x - dragStart.x) * factor;
            targetY = (draggedNode.y - dragStart.y) * factor;
          }
          const prevOffset = dragTugOffsetsRef.current.get(id) ?? REST_OFFSET;
          // Reduced motion tracks the pointer 1:1; a live drag lags on the exponential as
          // before; a release springs home on this neighbour's own mass.
          const nextOffset = reducedMotionRef.current
            ? snapOffset(targetX, targetY)
            : pinned
              ? stepLagOffset(prevOffset, targetX, targetY, dt, DRAG_TUG_EASE_TAU)
              : stepHomeOffset(prevOffset, dt, springFor(id));
          dragTugOffsetsRef.current.set(id, nextOffset);
          if (tugged) {
            tugged.x += nextOffset.x;
            tugged.y += nextOffset.y;
          }
        }
        // The drop itself: step the released node's spring and add its excursion on
        // top of the sim's position, until it is at rest.
        const drop = !pinned && draggedNode ? dragTugOffsetsRef.current.get(affected.draggedId) : undefined;
        if (drop && draggedNode) {
          const next = stepHomeOffset(drop, dt, springFor(affected.draggedId));
          if (isOffsetAtRest(next)) {
            dragTugOffsetsRef.current.delete(affected.draggedId);
          } else {
            dragTugOffsetsRef.current.set(affected.draggedId, next);
            draggedNode.x += next.x;
            draggedNode.y += next.y;
          }
        }
        /*
         * Grabbing a second node replaces `dragAffectedSetRef` while the first group's
         * offsets are still in flight. Nothing above iterates them any more, so those
         * nodes stopped being offset and jumped home in a single frame — up to 21 px on
         * the sample vault, on nodes the hand never touched. They keep their own spring
         * until they are at rest (`expressive/release-offsets.ts#orphanedOffsetIds`).
         */
        const stepped = new Set<string>(tugIds);
        stepped.add(affected.draggedId);
        for (const id of orphanedOffsetIds(dragTugOffsetsRef.current, stepped)) {
          const prev = dragTugOffsetsRef.current.get(id);
          if (!prev) continue;
          const next = stepHomeOffset(prev, dt, springFor(id));
          if (isOffsetAtRest(next)) {
            dragTugOffsetsRef.current.delete(id);
            continue;
          }
          dragTugOffsetsRef.current.set(id, next);
          const orphan = world.nodeById.get(id);
          if (orphan) {
            orphan.x += next.x;
            orphan.y += next.y;
          }
        }
      }

      // Relax the overlap a drag or settle created, in the same frame. This
      // block is not reached while homing, so the first-map reveal's
      // deliberate gathering is protected.
      {
        // ★ **A node that is not drawn cannot overlap.**
        //
        // A subtree collapsed by the density gate is replaced by one chip and
        // is not on screen (measured at synth=3000: **2,820 of 3,000 (94%)
        // collapsed, 118 on screen**). Resolving overlaps among the invisible
        // is pure waste whose result appears nowhere, and because pair count
        // is N² that waste took 78% of the frame (109.3 ms).
        //
        // This is exactly what the owner asked three times: "Only 20 are on screen — why
        // compute all 3,000?" What you hold as data and what you feed into
        // per-frame computation are different things, and here they were
        // indistinguishably the same.
        const drawnIdx: number[] = [];
        const sepNodes: SeparationNode[] = [];
        for (let i = 0; i < world.nodes.length; i += 1) {
          const n = world.nodes[i];
          if (clusteredIdsRef.current.has(n.id)) continue;
          drawnIdx.push(i);
          sepNodes.push({
            id: n.id,
            x: n.x,
            y: n.y,
            r: radiusForKind(n.kind, tokens) * n.magnitudeScale,
          });
        }
        // **Only test what actually moved this frame.** A still-still pair
        // did not overlap last frame, so it cannot overlap now.
        //
        // The force sim **already received** this set
        // (`dragAffectedSetRef`); only separation did not. At 3,000 nodes,
        // 99.99% of the 9 million distance computations per frame were
        // "both still" (measured 2026-07-31: 109.3 ms, 78% of the frame).
        // With no set — after a settle ends, say — it falls back to every
        // node, identical to the previous behaviour.
        const sepActive = affected
          ? new Set<string>([affected.draggedId, ...affected.oneHop, ...affected.twoHop])
          : null;
        relaxNodeSeparation(sepNodes, {
          ratio: tokens.nodeMinSeparationRatio,
          iterations: 2,
          pinnedId: nodeDragRef.current?.nodeId ?? null,
          activeIds: sepActive,
        });
        // Record the displaced nodes here so the next frame's narrowed
        // write-back does not omit their revert (see `applyOnly` above).
        const sepDisplaced = sepDisplacedIdsRef.current;
        sepDisplaced.clear();
        for (let i = 0; i < sepNodes.length; i += 1) {
          const target = world.nodes[drawnIdx[i]];
          if (scoped && (target.x !== sepNodes[i].x || target.y !== sepNodes[i].y)) {
            sepDisplaced.add(target.id);
          }
          target.x = sepNodes[i].x;
          target.y = sepNodes[i].y;
        }
      }
      // Only the nodes whose coordinates really changed this frame. Judging
      // by result rather than by author means none of the three writers
      // (force, tug, separation) can be missed.
      let movedIds: Set<string> | null = null;
      if (prevX && prevY) {
        movedIds = new Set<string>();
        for (let i = 0; i < nodeCount; i += 1) {
          const node = world.nodes[i];
          if (node.x !== prevX[i] || node.y !== prevY[i]) movedIds.add(node.id);
        }
      }
      recomputeWorldGeometry(world, tokens, movedIds);
      // Heat is a TIME budget (ms), not a frame count, so the release
      // settle lasts `--map-node-release-settle-ms` on every display.
      if (!pinned && heatRef.current > 0) heatRef.current = Math.max(0, heatRef.current - dt * 1000);
      if (!pinned && heatRef.current <= 0) {
        // Settle burst finished — release the affected-set restriction and
        // drop any residual (by-now-decayed-near-0) tug offsets.
        dragAffectedSetRef.current = null;
        dragTugOffsetsRef.current.clear();
        dropSeededRef.current = false;
        dragPrevPosRef.current = null;
        sepDisplacedIdsRef.current.clear();
        // During a drag the bbox only ever grew, because it feeds the pan
        // clamp and erring generous is the safe direction. This one frame,
        // where the settle ends, restores the exact value so a graph that
        // gathered inward does not keep a looser clamp than before the drag.
        recomputeWorldGeometry(world, tokens);
      }
    }

    // Auto-arrange homing: springs every node back to its own
    // `homeX`/`homeY` over a short critically-damped transition, independent
    // of the FA2/tug block above (relayout resets heat/pin, so the two never
    // run in the same frame in practice).
    if (homingActiveRef.current) {
      const finishGalaxyLayoutHandoff = () => {
        const handoff = galaxyLayoutHandoffRef.current;
        if (handoff === null) return;
        // ForceSimulation owns a separate coordinate store. Reseed it at the
        // arrived mode positions so the first drag cannot snap a star back to
        // the previous view's coordinates.
        simRef.current = createForceSimulation(
          world.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
          world.edges.map((edge) => ({ source: edge.sourceId, target: edge.targetId })),
        );
        if (handoff === "flat") {
          galaxyFlatReturnPositionsRef.current = null;
          const pending = pendingFlatCameraRef.current;
          pendingFlatCameraRef.current = null;
          // A wheel/pan during coordinate return is newer intent than the
          // mode's saved camera. Otherwise restore the exact Flat view (or
          // the first-entry fit) only now that those bounds are real.
          // A 3D view chosen on the same switch has already fitted its cone
          // or strata (`domeFitPendingRef`); the Flat camera saved on the way
          // into Galaxy belongs to the view that was left. Restoring it over
          // the dome put the cone 286 px down with five nodes under the
          // viewport (Flat → Galaxy → Cone at 1512×806, measured 2026-09-19).
          if (pending && !view3dRef.current && pending.gestureRevision === cameraGestureRevisionRef.current) {
            overviewScaleRef.current = pending.overviewScale;
            cameraTargetRef.current = pending.target;
            // Preserve the authorship of the saved view. A later resize may
            // re-fit an overview, but it must not overwrite a wheel/pan view
            // merely because that view crossed a mode boundary.
            userDrivenCameraRef.current = pending.userDriven;
            dampingRef.current = tokens.cameraDampingDefault;
            cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
            if (reducedMotionRef.current) {
              cameraTweenRef.current = null;
              cameraRef.current = {
                x: { value: pending.target.tx, velocity: 0 },
                y: { value: pending.target.ty, velocity: 0 },
                scale: { value: pending.target.tscale, velocity: 0 },
              };
            } else {
              beginCameraTween(pending.target);
            }
          }
        }
        galaxyLayoutHandoffRef.current = null;
      };
      // Reduced-motion users get the relayout RESULT, not the journey.
      // Warding invariant: inside a realm the override (the realm's
      // `insideTargets`) wins as the homing target; null keeps the global
      // homeX/homeY contract.
      const homeOverride = homeTargetOverrideRef.current;
      if (reducedMotionRef.current) {
        for (const node of world.nodes) {
          if (!homeSpringsRef.current.has(node.id)) continue;
          const t = homeOverride?.get(node.id);
          node.x = t?.x ?? node.homeX;
          node.y = t?.y ?? node.homeY;
        }
        recomputeWorldGeometry(world, tokens);
        homingActiveRef.current = false;
        homeSpringsRef.current.clear();
        homeTargetOverrideRef.current = null;
        finishGalaxyLayoutHandoff();
      } else {
        let allConverged = true;
        for (const node of world.nodes) {
          const spring = homeSpringsRef.current.get(node.id);
          if (!spring) continue;
          const t = homeOverride?.get(node.id);
          const targetX = t?.x ?? node.homeX;
          const targetY = t?.y ?? node.homeY;
          // Homing has its own ω (7.5): a relayout is a layout
          // CORRECTION and should end decisively, unlike the camera's
          // cinematic transition spring (4.7) this used to borrow.
          const nextSpring = stepHomeSpring(spring, targetX, targetY, dt, tokens.nodeHomeSpringAngFreq, tokens.cameraDampingDefault);
          homeSpringsRef.current.set(node.id, nextSpring);
          node.x = nextSpring.x.value;
          node.y = nextSpring.y.value;
          if (!isHomeSpringConverged(nextSpring, targetX, targetY, HOME_CONVERGE_EPSILON)) allConverged = false;
        }
        recomputeWorldGeometry(world, tokens);
        if (allConverged) {
          homingActiveRef.current = false;
          homeSpringsRef.current.clear();
          homeTargetOverrideRef.current = null;
          finishGalaxyLayoutHandoff();
        }
      }
    }

    // --- Realm coordinate step: FLIP the inside nodes, fling the outside
    // ones away under gravity. The tick settles entering → active and
    // exiting → idle. While exiting, the homing above returns coordinates to
    // home, so this block leaves them alone. ---
    {
      const rt = realmTransitionReducer(realmTransitionRef.current, { type: "tick", now });
      realmTransitionRef.current = rt;
      const data = realmDataRef.current;
      if (data && rt.phase === "entering") {
        const elapsed = now - rt.startMs;
        const flipDur = reducedMotionRef.current ? 0 : REALM_INSIDE_FLIP_MS;
        const flingDur = reducedMotionRef.current ? 0 : REALM_OUTSIDE_FLING_MS;
        const outsideCulled = isRealmOutsideCulled(rt, now);
        for (const node of world.nodes) {
          const target = data.insideTargets.get(node.id);
          if (target) {
            const from = data.insideFrom.get(node.id) ?? target;
            // Assemble depth by depth: each member's FLIP start is stepped
            // by its depth, so the rings settle in layers from the root
            // outward. Each ring still takes 660 ms.
            const delay = realmInsideFlipDelayFor(data.depthById.get(node.id) ?? 1);
            const p = realmInsidePosition(from, target, elapsed - delay, flipDur);
            node.x = p.x;
            node.y = p.y;
          } else if (!outsideCulled) {
            const from = data.outsideFrom.get(node.id);
            if (from) {
              const p = realmOutsidePosition(from, data.flingCenter, elapsed, {
                duration: flingDur,
                fallbackAngle: fallbackAngleFor(node.id),
              });
              node.x = p.x;
              node.y = p.y;
            }
          }
        }
        recomputeWorldGeometry(world, tokens);
      } else if (data && rt.phase === "active") {
        // Settling: snap to the targets once, reseed the sim at the realm
        // coordinates, and hand coordinate ownership to the ordinary paths
        // (drag, sim, homing). Later active frames do not overwrite
        // coordinates, so dragging works. Overwriting to the targets every
        // frame fought the drag and nodes would not move (owner bug report).
        if (!realmActiveHandedOffRef.current) {
          for (const node of world.nodes) {
            const target = data.insideTargets.get(node.id);
            if (target) {
              node.x = target.x;
              node.y = target.y;
            }
          }
          // Reseed the sim at the current realm coordinates; otherwise the
          // first drag tick's `applyForcePositions` writes back the global
          // coordinates from build time and the members jump.
          simRef.current = createForceSimulation(
            world.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
            world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
          );
          realmActiveHandedOffRef.current = true;
          recomputeWorldGeometry(world, tokens);
        }
      } else if (data && rt.phase === "exiting" && !reducedMotionRef.current) {
        // Exit reverse-playback: inside nodes reverse-FLIP (deepest layer
        // first, target → home) and outside nodes return against gravity
        // (fling position → home) — the deterministic inverse of the entry
        // step. Reduced-motion never reaches here: the exit effect above
        // already snapped home and went idle with duration 0.
        const elapsed = now - rt.startMs;
        for (const node of world.nodes) {
          const target = data.insideTargets.get(node.id);
          if (target) {
            const home = data.insideFrom.get(node.id) ?? target;
            const delay = realmExitFlipDelayFor(data.depthById.get(node.id) ?? 1);
            const p = realmInsidePosition(target, home, elapsed - delay, REALM_EXIT_FLIP_MS);
            node.x = p.x;
            node.y = p.y;
          } else {
            const from = data.outsideFrom.get(node.id);
            if (from) {
              const p = realmOutsideReturnPosition(from, data.flingCenter, elapsed - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS, {
                duration: REALM_EXIT_OUTSIDE_RETURN_MS,
                fallbackAngle: fallbackAngleFor(node.id),
              });
              node.x = p.x;
              node.y = p.y;
            }
          }
        }
        recomputeWorldGeometry(world, tokens);
        // Exit framing defect (node audit 2026-07-24): in the collapsed
        // realm layout at entry, `overviewScaleRef` froze at the collapsed
        // spine fit (≈0.24), which pushed stepCamera's scale ceiling
        // (overviewEntryScale × maxZoomRatio) down to ≈0.73 after exit. The
        // camera then could not climb back to the canonical overview (≈1.14)
        // and stuck in a shrunken frame. Reverse playback restores
        // spineBounds a little more each frame as nodes return home, so the
        // ceiling anchor is recomputed live and cannot suppress the target at
        // the tween → spring handover — equivalent to the fresh and deselect
        // paths.
        overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current), width, height, tokens, world.nodes.length);
      } else if (rt.phase === "idle" && realmDataRef.current !== null) {
        // Exit complete: reverse playback returned everything home, so drop
        // the realm data and settle the overview anchor against the home
        // spineBounds — the close of the recomputation above.
        realmDataRef.current = null;
        overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current), width, height, tokens, world.nodes.length);
      }
    }

    /*
     * ★ **A focus cannot stand on a name this graph does not have**
     * (2026-08-17).
     *
     * Owner report: "open in map" on a project document made the map look as
     * if it had vanished. **Everything had been dimmed** — measured, the
     * brightest node sat at 1.40:1 against the background (3:1 is the minimum
     * for a shape), and the 125-node sample vault produced zero bright pixels.
     *
     * The cause was a naming mismatch (project slug `project` vs node id
     * `project:project`), fixed in `HomePage`. But the hazard is not that one
     * path — it is **the rule translating "selected a node that does not
     * exist" into "dim everything"**, which the next path would hit again.
     *
     * So a focus id absent from this frame's node list counts as **nothing
     * selected**: a screen with no selection always beats a selection that
     * shows nothing. Costs one `world.nodeById` lookup.
     * Gate: `tests/e2e/map-focus-dangling.spec.ts`.
     */

  };
}
