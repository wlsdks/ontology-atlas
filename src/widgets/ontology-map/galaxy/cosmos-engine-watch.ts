import { isDirectionalRelation } from "@/entities/knowledge-graph";
import type { OntologyMapEdge } from "../ui/OntologyMap";
import { worldToScreen } from "./cosmos-camera";
import type { CosmosCamera, CosmosRelation, CosmosRoom, GalaxyPose } from "./cosmos-types";
import type { CosmosLayout } from "./layout/cosmos-layout";

export class CosmosRevealClock {
  private id: string | null = null;
  private since = 0;

  revealMs(id: string | null, now: number): number {
    if (id !== this.id) {
      this.id = id;
      this.since = now;
    }
    return Math.max(0, now - this.since);
  }
}

export class CosmosCameraRestWatch {
  private last = "";
  private moving = true;

  step(camera: CosmosCamera, room: CosmosRoom, held: boolean): "moving" | "rest" | "still" {
    const key = `${camera.x},${camera.y},${camera.scale},${room.x},${room.y},${room.width},${room.height}`;
    const unchanged = key === this.last;
    this.last = key;
    if (held || !unchanged) {
      this.moving = true;
      return "moving";
    }
    if (!this.moving) return "still";
    this.moving = false;
    return "rest";
  }
}

export function galaxyCentreOn(layout: CosmosLayout, poses: readonly GalaxyPose[], camera: CosmosCamera, room: CosmosRoom, id: string): { x: number; y: number } | null {
  const pose = poses[layout.galaxyOf.get(id) ?? -1];
  return pose ? worldToScreen(camera, room, pose.x, pose.y) : null;
}

export function relationsByConcept(edges: readonly OntologyMapEdge[]): Map<string, CosmosRelation[]> {
  const out = new Map<string, CosmosRelation[]>();
  edges.forEach((e, i) => {
    if (e.kind !== "depends") return;
    const relation: CosmosRelation = { id: e.id ?? `${e.source}->${e.target}:${i}`, source: e.source, target: e.target, relationType: e.relationType, directional: isDirectionalRelation(e.relationType) };
    for (const id of [e.source, e.target]) if (!out.get(id)?.push(relation)) out.set(id, [relation]);
  });
  return out;
}
