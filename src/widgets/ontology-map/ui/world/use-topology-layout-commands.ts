"use client";

import {
  useEffect,
  useRef,
  type RefObject
} from "react";
import {
  type SpringOffset,
} from "../../expressive/release-offsets";
import { createForceSimulation, type ForceSimulation } from "../../model/layout/force-layout";
import {
  type RealmTransitionState
} from "../../model/realm/realm-transition";
import { createHomeSpring, type HomeSpringState } from "../../model/layout/relayout-home";
import type { NodeDragState } from "../input/topology-pointer-types";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { type RealmRuntimeData } from "./topology-realm-runtime";
import { prepareRevealHome } from "./topology-reveal-home";
import { type TopologyWorld } from "./topology-world";
import { isWorldBuilding, onWorldSwap } from "./world-swap";

interface Dependencies {
  relayoutToken: number;
  initialRelayoutTokenRef: RefObject<number>;
  worldRef: RefObject<TopologyWorld | null>;
  nodeDragRef: RefObject<NodeDragState | null>;
  heatRef: RefObject<number>;
  dragAffectedSetRef: RefObject<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string>; } | null>;
  dragStartPosRef: RefObject<{ x: number; y: number; } | null>;
  dragTugOffsetsRef: RefObject<Map<string, SpringOffset>>;
  realmDataRef: RefObject<RealmRuntimeData | null>;
  realmTransitionRef: RefObject<RealmTransitionState>;
  simRef: RefObject<ForceSimulation | null>;
  homeSpringsRef: RefObject<Map<string, HomeSpringState>>;
  homeTargetOverrideRef: RefObject<ReadonlyMap<string, { x: number; y: number; }> | null>;
  homingActiveRef: RefObject<boolean>;
    revealToken: number;
}

/** Apply explicit relayout and reveal commands without rebuilding the graph. */
export function useTopologyLayoutCommands({
  relayoutToken,
  initialRelayoutTokenRef,
  worldRef,
  nodeDragRef,
  heatRef,
  dragAffectedSetRef,
  dragStartPosRef,
  dragTugOffsetsRef,
  realmDataRef,
  realmTransitionRef,
  simRef,
  homeSpringsRef,
  homeTargetOverrideRef,
  homingActiveRef,
  revealToken,
}: Dependencies) {

  // --- relayoutToken ONLY (not fitViewToken) — also restores every node's
  // position to its canonical (`homeX`/`homeY`) layout coordinate over a
  // short critically-damped spring transition. Fit-view intentionally does NOT
  // do this — it only recentres the camera. They are different user actions:
  // auto-arrange is the button that implies "put the nodes back", per
  // `HomePage.tsx`'s `onRelayout`. ---
  useEffect(() => {
    if (relayoutToken === initialRelayoutTokenRef.current) return;
    const world = worldRef.current;
    if (!world) return;

    // Relayout is a clean slate: drop any in-flight drag/tug/settle state so
    // the homing transition below isn't fighting stale sim pins or tug offsets,
    // and reseed the sim's OWN internal graph at the home coordinates too — it
    // doesn't automatically track `world.nodes` mutations, so without this a
    // drag right after a relayout would start from the sim's stale pre-relayout
    // positions and jump.
    nodeDragRef.current = null;
    heatRef.current = 0;
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();

    // Inside a realm, auto-arrange homes to the realm layout coordinates (`insideTargets`), not global
    // `homeX`/`homeY`, or the root lands outside its ring. Outside nodes are culled and get no spring. A
    // relayout while exiting takes the global path, since reverse playback ends at global home.
    const realmData = realmDataRef.current;
    const realmPhase = realmTransitionRef.current.phase;
    if (realmData !== null && (realmPhase === "entering" || realmPhase === "active")) {
      simRef.current = createForceSimulation(
        world.nodes.map((n) => {
          const t = realmData.insideTargets.get(n.id);
          return { id: n.id, x: t?.x ?? n.x, y: t?.y ?? n.y };
        }),
        world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })));
      const springs = new Map<string, HomeSpringState>();
      for (const node of world.nodes) {
        if (realmData.insideTargets.has(node.id)) springs.set(node.id, createHomeSpring(node.x, node.y));
      }
      homeSpringsRef.current = springs;
      homeTargetOverrideRef.current = realmData.insideTargets;
      homingActiveRef.current = true;
      return;
    }
        simRef.current = createForceSimulation(
      world.nodes.map((n) => ({ id: n.id, x: n.homeX, y: n.homeY })),
      world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })));

    const springs = new Map<string, HomeSpringState>();
    for (const node of world.nodes) {
      springs.set(node.id, createHomeSpring(node.x, node.y));
    }
    homeSpringsRef.current = springs;
    homeTargetOverrideRef.current = null;
    homingActiveRef.current = true;
  }, [dragAffectedSetRef, dragStartPosRef, dragTugOffsetsRef, heatRef, homeSpringsRef, homeTargetOverrideRef, homingActiveRef, initialRelayoutTokenRef, nodeDragRef, realmDataRef, realmTransitionRef, relayoutToken, simRef, worldRef]);

  // First-map reveal: right after bootstrap every node gathers out of the spine centre and settles home on the existing homing springs (reduced-motion snap included).
  // Initialising to 0 is the point: an empty vault never mounts the canvas, so the bootstrap bump happens BEFORE mount, and initialising from the current prop would swallow it.
  const lastRevealTokenRef = useRef(0);

  useEffect(() => {
    const reveal = () => {
      if (revealToken === lastRevealTokenRef.current) return;
      lastRevealTokenRef.current = revealToken;
      const world = worldRef.current;
      if (!world || world.nodes.length === 0) return;
      // Origin = the project node's home, falling back to the spine bbox centre.
      const projectNode = world.nodes.find((n) => n.kind === "project");
      const cx = projectNode?.homeX ?? (world.spineBounds.minX + world.spineBounds.maxX) / 2;
      const cy = projectNode?.homeY ?? (world.spineBounds.minY + world.spineBounds.maxY) / 2;
      const tokens = readOntologyMapTokensOrNull();
      if (!tokens) return;
      const revealed = prepareRevealHome(world, tokens, { x: cx, y: cy });
      worldRef.current = revealed.world;
      homeSpringsRef.current = revealed.springs;
      homingActiveRef.current = true;
    };
    if (revealToken === lastRevealTokenRef.current) return;
    // A world still building would replace the revealed one, so the token waits for that swap.
    if (!worldRef.current || isWorldBuilding(worldRef)) return onWorldSwap(worldRef, reveal);
    reveal();
    return undefined;
  }, [homeSpringsRef, homingActiveRef, revealToken, worldRef]);

}
