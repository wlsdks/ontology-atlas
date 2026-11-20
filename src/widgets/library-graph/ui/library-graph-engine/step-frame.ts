import { libraryGraphStaleEdges } from "../../model/library-graph-card";
import {
  isIslandFieldMoving,
  settleIslandField,
  stepIslandField,
} from "../../model/library-islands-physics";
import {
  hasPinnedNode,
  isLibrarySimulationRunning,
  settleLibrarySimulation,
  stepLibrarySimulation,
} from "../../model/library-force-simulation";

import type { LibraryGraphEngineScope } from "./engine-scope";
import { hasActivityTrail } from "./activity-marks";
import { placeIslandBodies } from "./picture-geometry";

export function stepLibraryGraphFrame(
  {
    autoFitRef, dimRef, flowRef, frameRef, ghostsRef, graphRef, islandFieldRef, islandOffsetsRef,
    islandsRef, motionRef, paint, pendingBoxRef, pictureRef, pointerRef, publishAspect, pulseRef,
    runningRef, simRef, stateRef, stepRef, travelRef, wasSettlingRef,
  }: Pick<
    LibraryGraphEngineScope,
    "autoFitRef" | "dimRef" | "flowRef" | "frameRef" | "ghostsRef" | "graphRef" | "islandFieldRef" |
    "islandOffsetsRef" | "islandsRef" | "motionRef" | "paint" | "pendingBoxRef" | "pictureRef" |
    "pointerRef" | "publishAspect" | "pulseRef" | "runningRef" | "simRef" | "stateRef" | "stepRef" |
    "travelRef" | "wasSettlingRef"
  >,
  now: number,
) {
  const sim = simRef.current;
  if (!sim || !stateRef.current.visible || document.hidden) {
    runningRef.current = false;
    return;
  }
  const reduced = stateRef.current.reducedMotion;
  // The islands' own physics: one fixed step a frame while anything moves, then still.
  const field = pictureRef.current === "islands" ? islandFieldRef.current : null;
  if (field && isIslandFieldMoving(field)) {
    if (reduced && pointerRef.current.islandDrag === null) settleIslandField(field);
    else stepIslandField(field);
    placeIslandBodies(sim, field, islandsRef.current, islandOffsetsRef.current);
  }
  const busy = isLibrarySimulationRunning(sim) || hasPinnedNode(sim) || (field !== null && isIslandFieldMoving(field));
  /*
   * Forces run only under the force picture: laid marks stand closer than the collision
   * reach, so stepping would blow packed dots into a cloud. A laid picture still advances
   * fade-in arrivals at the simulation's rate.
   */
  if (pictureRef.current !== "force") for (const node of sim.nodes) if (node.entered < 1) node.entered = Math.min(1, node.entered + 0.08);
  if (busy && pictureRef.current === "force") {
    /*
     * Reduced motion settles here too: `usePrefersReducedMotion` reads false on the first
     * render (hydration), so the preference arrives after creation, and a later reheat
     * would otherwise loop forever. A held mark still steps: the person's own hand
     * (WCAG 2.2 §2.3.3).
     */
    if (!reduced) stepLibrarySimulation(sim);
    else if (hasPinnedNode(sim)) stepLibrarySimulation(sim);
    else settleLibrarySimulation(sim);
  }
  const settling =
    busy ||
    travelRef.current !== null ||
    dimRef.current.value !== dimRef.current.target ||
    ghostsRef.current.size > 0 ||
    (autoFitRef.current.on && !autoFitRef.current.converged) ||
    pendingBoxRef.current !== null ||
    sim.nodes.some((node) => node.entered < 1) ||
    hasActivityTrail(
      stateRef.current.activity,
      graphRef.current,
      Date.now(),
      motionRef.current.base + motionRef.current.settle,
      motionRef.current.activityCycle,
      reduced,
    ) ||
    /*
     * The only unprompted frames, each bounded: the drift while a card is open, and the
     * home's one stale breath, which clears itself. Reduced motion takes neither.
     */
    (!reduced &&
      ((stateRef.current.cardId !== null && flowRef.current.edges.size > 0) ||
        pulseRef.current.homeAt !== null));

  /*
   * A picture with nowhere left to go paints its last frame and stops the loop rather
   * than idling; every later change comes back through `wake()`.
   */
  if (settling) {
    wasSettlingRef.current = true;
    paint(now, true);
  } else {
    // The aspect is published once the picture stops, or it reports the seed spiral's shape.
    paint(now, false);
    if (wasSettlingRef.current) {
      wasSettlingRef.current = false;
      publishAspect();
      /*
       * One breath for the stale citations once the home settles, not on mount, since a
       * pulse on travelling marks is a flicker; `homeAt` clears itself, so never a loop.
       */
      if (
        !reduced &&
        pulseRef.current.armed &&
        pulseRef.current.homeAt === null &&
        stateRef.current.cardId === null &&
        libraryGraphStaleEdges(graphRef.current).size > 0
      ) {
        pulseRef.current = { homeAt: now, armed: false };
        frameRef.current = requestAnimationFrame((next) => stepRef.current(next));
        return;
      }
    }
    runningRef.current = false;
    return;
  }
  frameRef.current = requestAnimationFrame((next) => stepRef.current(next));
}
