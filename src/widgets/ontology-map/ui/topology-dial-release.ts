import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { initHomeSpring, type HomeSpringState } from "../model/relayout-home";
import type { TopologyWorld } from "./topology-world";

type Point = { x: number; y: number };

export interface DialReleaseHoming {
  springs: Map<string, HomeSpringState>;
  override: Map<string, Point>;
  sim: ForceSimulation;
}

export function dialReleaseHoming(
  world: Pick<TopologyWorld, "nodes" | "edges">,
  slots: ReadonlyMap<string, Point>,
  springs: ReadonlyMap<string, HomeSpringState>,
  override: ReadonlyMap<string, Point> | null,
): DialReleaseHoming {
  const nextSprings = new Map(springs);
  const nextOverride = new Map(override ?? []);
  for (const n of world.nodes) {
    const slot = slots.get(n.id);
    if (!slot || Math.hypot(n.x - slot.x, n.y - slot.y) <= 0.5) continue;
    nextSprings.set(n.id, initHomeSpring(n.x, n.y));
    nextOverride.set(n.id, slot);
  }
  const sim = createForceSimulation(
    world.nodes.map((n) => {
      const slot = slots.get(n.id);
      return { id: n.id, x: slot?.x ?? n.x, y: slot?.y ?? n.y };
    }),
    world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
  );
  return { springs: nextSprings, override: nextOverride, sim };
}
