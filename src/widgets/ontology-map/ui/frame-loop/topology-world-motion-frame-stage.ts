import type { CameraAxes, CameraTarget } from "../../engine/camera";
import { lastDialFrame } from "../../dial/frame/frame";
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
} from "../../expressive/release-offsets";
import { tugFactorForHop, tugFalloffForDistance } from "../../interaction/drag-tug";
import type { CameraTween, CameraTweenAltitude } from "../../model/camera/camera-easing";
import { DOME_ASSEMBLE_TOTAL_MS } from "../../model/dome-view/frame";
import type { DomeRuntime } from "../../model/dome-view/runtime";
import { createForceSimulation, type ForceSimulation } from "../../model/layout/force-layout";
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
} from "../../model/realm/realm-transition";
import type { WardingFitState } from "../../model/realm/realm-warding-fit";
import {
  initHomeSpring,
  isHomeSpringConverged,
  stepHomeSpring,
  type HomeSpringState,
} from "../../model/layout/relayout-home";
import { holdTierAssemblyBounds, isTierAssembling, settleTierAssembly, stepTierAssembly } from "../../morph/tier-assembly";
import { relaxNodeSeparation, type SeparationNode } from "../../model/layout/separation";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeOverviewFitScale } from "../camera/topology-camera-math";
import { dialReleaseHoming } from "./topology-dial-release";
import { overviewBoundsFor } from "../camera/topology-overview-fit";
import type { NodeDragState } from "../input/topology-pointer-types";
import type { RealmRuntimeData } from "../world/topology-realm-runtime";
import { fallbackAngleFor } from "../world/topology-realm-runtime";
import {
  applyForcePositions,
  dialOverviewFit,
  radiusForKind,
  recomputeWorldGeometry,
  type TopologyWorld,
} from "../world/topology-world";

const DRAG_TUG_EASE_TAU = 0.15;
const SCOPED_FRAME_SPARSITY = 5;
const HOME_CONVERGE_EPSILON = 0.5;

/** O(N) collection; undisclosed dial nodes cannot collide with a painted mark. */
export function collectSeparationNodes(
  world: Pick<TopologyWorld, "nodes">,
  tokens: OntologyMapTokens,
  clusteredIds: ReadonlySet<string>,
  dialAlphas: ReadonlyMap<string, number> | null,
): { drawnIdx: number[]; sepNodes: SeparationNode[] } {
  const drawnIdx: number[] = [];
  const sepNodes: SeparationNode[] = [];
  for (let i = 0; i < world.nodes.length; i += 1) {
    const node = world.nodes[i];
    if (clusteredIds.has(node.id)) continue;
    if (dialAlphas !== null && (dialAlphas.get(node.id) ?? 0) <= 0) continue;
    drawnIdx.push(i);
    sepNodes.push({ id: node.id, x: node.x, y: node.y, r: radiusForKind(node.kind, tokens) * node.magnitudeScale });
  }
  return { drawnIdx, sepNodes };
}

export function collectActiveMotionIds(
  ids: readonly string[],
  clusteredIds: ReadonlySet<string>,
  dialAlphas: ReadonlyMap<string, number> | null,
  draggedId: string,
): ReadonlySet<string> {
  return new Set(ids.filter(id => id === draggedId || (!clusteredIds.has(id) && (dialAlphas === null || (dialAlphas.get(id) ?? 0) > 0))));
}

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
    cameraGestureRevisionRef: SourceRef<number>;
  cameraRef: SourceRef<CameraAxes>;
  cameraTargetRef: SourceRef<CameraTarget>;
  cameraTweenRef: SourceRef<CameraTween | null>;
  cameraAngularFreqRef: SourceRef<number | null>;
  dampingRef: SourceRef<number>;
  userDrivenCameraRef: SourceRef<boolean>;
  overviewScaleRef: SourceRef<number>;
  overviewFitRef: SourceRef<"spine" | "full">;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number, ease?: "out", altitude?: CameraTweenAltitude) => void;
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
    reducedMotionRef, overviewScaleRef, overviewFitRef,
  } = sources;

  return function runWorldMotionFrameStage(
    now: number,
    dt: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
    width: number,
    height: number): void {
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

    // A realm member released outside the warding ring homes back to its realm target; reuses the home
    // springs and target override.
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
            world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })));
        }
      }
      if (releasedId !== null && realmData === null && world.dial) {
        const homing = dialReleaseHoming(world, world.dial.scene.positions, homeSpringsRef.current, homeTargetOverrideRef.current);
        heatRef.current = 0;
        dragAffectedSetRef.current = null;
        dragTugOffsetsRef.current.clear();
        homeSpringsRef.current = homing.springs;
        homeTargetOverrideRef.current = homing.override;
        homingActiveRef.current = true;
        simRef.current = homing.sim;
      }
    }
    /*
     * An assembled dome does not run 2D physics: with full tier ramps the drawn position cancels to
     * `p.wx`, so freezing 2D coordinates moves nothing, while a 3D node drag would run FA2 over all nodes.
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
      const dialAlphas = !view3dRef.current && world.dial && realmDataRef.current === null && realmTransitionRef.current.phase === "idle"
        ? lastDialFrame()?.alphas ?? null : null;
      const restrictToIds = affected
        ? collectActiveMotionIds([affected.draggedId, ...affected.oneHop, ...affected.twoHop], clustered, dialAlphas, affected.draggedId)
        : null;
      const dialMotionIds = dialAlphas !== null ? restrictToIds : null;
      // Narrow only when the set is sparse: the neighbour tug pushes the whole 1-/2-hop set every frame,
      // so a large reach makes the index detour a net loss. Otherwise take the full path without a snapshot.
      const nodeCount = world.nodes.length;
      const scoped =
        affected !== null &&
        (dialMotionIds?.size ?? (affected.oneHop.size + affected.twoHop.size + 1)) * SCOPED_FRAME_SPARSITY < nodeCount;
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
            ...(dialMotionIds ?? [affected.draggedId, ...affected.oneHop, ...affected.twoHop]),
            ...dragTugOffsetsRef.current.keys(),
            ...sepDisplacedIdsRef.current
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
        const tugIds = new Set<string>(dialMotionIds ?? [...affected.oneHop, ...affected.twoHop]);
        tugIds.delete(affected.draggedId);
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
              seedDropOffset(dragVelRef.current.x, dragVelRef.current.y, springFor(affected.draggedId), tokens.massDropMaxPx));
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
                    const falloff = tugged && dragStart
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
                    }
                    else {
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
                    if (!prev)
                        continue;
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
                const { drawnIdx, sepNodes } = collectSeparationNodes(
                    world, tokens, clusteredIdsRef.current,
                    dialAlphas,
                );
                // Test only nodes that moved this frame: a still-still pair did not overlap last frame. With no set
                // (after a settle ends) it falls back to every node.
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
                    if (node.x !== prevX[i] || node.y !== prevY[i])
                        movedIds.add(node.id);
                }
            }
            recomputeWorldGeometry(world, tokens, movedIds);
            // Heat is a TIME budget (ms), not a frame count, so the release
            // settle lasts `--map-node-release-settle-ms` on every display.
            if (!pinned && heatRef.current > 0)
                heatRef.current = Math.max(0, heatRef.current - dt * 1000);
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
      } else {
        let allConverged = true;
        for (const node of world.nodes) {
          const spring = homeSpringsRef.current.get(node.id);
          if (!spring) continue;
          const t = homeOverride?.get(node.id);
          const targetX = t?.x ?? node.homeX;
          const targetY = t?.y ?? node.homeY;
          // Homing has its own angular frequency: a relayout is a layout correction and should end decisively,
          // unlike the cinematic camera transition spring.
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
        }
      }
    }

    if (view3dRef.current || realmTransitionRef.current.phase !== "idle") settleTierAssembly(world);
    if (isTierAssembling(world)) {
      const running = stepTierAssembly(world, now);
      recomputeWorldGeometry(world, tokens);
      holdTierAssemblyBounds(world);
      homingActiveRef.current = running || homeSpringsRef.current.size > 0;
    }

    // Realm coordinates stay exclusive during entry and exit; reduced motion settles in one frame.
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
        // Settling: snap to the targets once, reseed the sim at realm coordinates, then hand coordinate
        // ownership to the ordinary paths; overwriting every frame would fight the drag.
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
            world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })));
                    realmActiveHandedOffRef.current = true;
                    recomputeWorldGeometry(world, tokens);
                }
            }
            else if (data && rt.phase === "exiting" && !reducedMotionRef.current) {
                // Return from the captured live frame, including an interrupted entry or a dragged member.
                const elapsed = now - rt.startMs;
                for (const node of world.nodes) {
                    const target = data.insideTargets.get(node.id);
                    if (target) {
                        const home = data.returnPositions?.get(node.id) ?? data.insideFrom.get(node.id) ?? target;
                        const delay = realmExitFlipDelayFor(data.depthById.get(node.id) ?? 1);
                        const start = data.exitSnapshot?.positions.get(node.id) ?? target;
                        const p = realmInsidePosition(start, home, elapsed - delay, REALM_EXIT_FLIP_MS);
                        node.x = p.x;
                        node.y = p.y;
                    }
                    else {
                        const from = data.outsideFrom.get(node.id);
                        if (from) {
                            const p = realmOutsideReturnPosition(data.returnPositions?.get(node.id) ?? from, data.flingCenter, elapsed - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS, {
                                start: data.exitSnapshot?.positions.get(node.id),
                                duration: REALM_EXIT_OUTSIDE_RETURN_MS,
                                fallbackAngle: fallbackAngleFor(node.id),
                            });
                            node.x = p.x;
                            node.y = p.y;
                        }
                    }
                }
                recomputeWorldGeometry(world, tokens);
                // Recompute the overview anchor live on exit: frozen at the collapsed spine fit it would push the
                // scale ceiling down and the camera could not climb back to the canonical overview.
                overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current), width, height, tokens, world.nodes.length, dialOverviewFit(world));
            }
            else if (rt.phase === "idle" && realmDataRef.current !== null) {
                // A throttled frame can skip the entire exit; complete its coordinates before discarding the snapshot.
                const completed = realmDataRef.current;
                for (const node of world.nodes) {
                  const home = completed.returnPositions?.get(node.id) ?? completed.insideFrom.get(node.id) ?? completed.outsideFrom.get(node.id);
                  if (home) { node.x = home.x; node.y = home.y; }
                }
                recomputeWorldGeometry(world, tokens);
                realmDataRef.current = null;
                overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current), width, height, tokens, world.nodes.length, dialOverviewFit(world));
            }
        }
    };
}
