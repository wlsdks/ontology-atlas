"use client";

import {
  useEffect,
  useRef,
  type RefObject
} from "react";
import {
  type SpringOffset,
} from "../expressive/release-offsets";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { type GalaxyLayout } from "../model/galaxy-layout";
import {
  type RealmTransitionState
} from "../model/realm-transition";
import { initHomeSpring, type HomeSpringState } from "../model/relayout-home";
import type { NodeDragState } from "./topology-pointer-handlers";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { type RealmRuntimeData } from "./topology-realm-runtime";
import { prepareRevealHome } from "./topology-reveal-home";
import { type TopologyWorld } from "./topology-world";

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
  galaxyRef: RefObject<boolean>;
  galaxyLayoutRef: RefObject<GalaxyLayout | null>;
  galaxyLayoutHandoffRef: RefObject<"flat" | "galaxy" | null>;
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
  galaxyRef,
  galaxyLayoutRef,
  galaxyLayoutHandoffRef,
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

    // Warding invariant (owner bug report 2026-07-23, repro path ②): inside a
    // realm, auto-arrange means "tidy *this* world", so the homing targets are
    // the **realm layout coordinates** (`insideTargets`), not the global
    // `homeX`/`homeY`. Sending them home globally left the warding ring at the
    // realm origin while every member flew off to spine coordinates — the root
    // ended up outside its own ring. Nodes outside are hard-culled, so they get
    // no spring. A relayout while exiting takes the global path: the reverse
    // playback's destination is global home, so realm-target homing must not
    // pull nodes back into a world that is closing.
    const realmData = realmDataRef.current;
    const realmPhase = realmTransitionRef.current.phase;
    if (realmData !== null && (realmPhase === "entering" || realmPhase === "active")) {
      simRef.current = createForceSimulation(
        world.nodes.map((n) => {
          const t = realmData.insideTargets.get(n.id);
          return { id: n.id, x: t?.x ?? n.x, y: t?.y ?? n.y };
        }),
        world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      );
      const springs = new Map<string, HomeSpringState>();
      for (const node of world.nodes) {
        if (realmData.insideTargets.has(node.id)) springs.set(node.id, initHomeSpring(node.x, node.y));
      }
      homeSpringsRef.current = springs;
      homeTargetOverrideRef.current = realmData.insideTargets;
      homingActiveRef.current = true;
      return;
    }

    // Galaxy has its own canonical arrangement. Auto-arrange returns the real
    // stars to that stable three-arm layout rather than sending them to Flat's
    // containment fan. Re-seed the simulation at the same targets so a drag
    // after the spring settles begins exactly where the star was painted.
    if (galaxyRef.current && galaxyLayoutRef.current !== null) {
      const targets = galaxyLayoutRef.current.points;
      simRef.current = createForceSimulation(
        world.nodes.map((node) => {
          const target = targets.get(node.id);
          return { id: node.id, x: target?.x ?? node.x, y: target?.y ?? node.y };
        }),
        world.edges.map((edge) => ({ source: edge.sourceId, target: edge.targetId })),
      );
      const springs = new Map<string, HomeSpringState>();
      for (const node of world.nodes) {
        if (targets.has(node.id)) springs.set(node.id, initHomeSpring(node.x, node.y));
      }
      homeSpringsRef.current = springs;
      homeTargetOverrideRef.current = targets;
      galaxyLayoutHandoffRef.current = "galaxy";
      homingActiveRef.current = springs.size > 0;
      return;
    }

    simRef.current = createForceSimulation(
      world.nodes.map((n) => ({ id: n.id, x: n.homeX, y: n.homeY })),
      world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
    );

    const springs = new Map<string, HomeSpringState>();
    for (const node of world.nodes) {
      springs.set(node.id, initHomeSpring(node.x, node.y));
    }
    homeSpringsRef.current = springs;
    homeTargetOverrideRef.current = null;
    homingActiveRef.current = true;
  }, [dragAffectedSetRef, dragStartPosRef, dragTugOffsetsRef, galaxyLayoutHandoffRef, galaxyLayoutRef, galaxyRef, heatRef, homeSpringsRef, homeTargetOverrideRef, homingActiveRef, initialRelayoutTokenRef, nodeDragRef, realmDataRef, realmTransitionRef, relayoutToken, simRef, worldRef]);

  // --- First-map reveal: right after bootstrap, every node gathers out of the
  // spine centre and settles home. It rides the existing homing springs
  // (including their reduced-motion snap), so there is no new motion contract.
  //
  // Initialising to 0 is the point: an empty vault never mounts the canvas, so
  // bootstrap completion (the token bump) happens BEFORE mount. Initialising
  // from the current prop would let the first mount swallow that bump and the
  // reveal would never fire.
  const lastRevealTokenRef = useRef(0);

  useEffect(() => {
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
    const reveal = prepareRevealHome(world, tokens, { x: cx, y: cy });
    worldRef.current = reveal.world;
    homeSpringsRef.current = reveal.springs;
    homingActiveRef.current = true;
  }, [homeSpringsRef, homingActiveRef, revealToken, worldRef]);

}
