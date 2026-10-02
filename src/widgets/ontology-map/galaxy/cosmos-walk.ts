import { worldToScreen } from "./cosmos-camera";
import type { CosmosLayout } from "./layout/cosmos-layout";
import type { CosmosCamera, CosmosRoom, GalaxyPose } from "./cosmos-types";

interface WalkNode {
  id: string;
  x: number;
  y: number;
}

export function walkCandidates(input: { layout: CosmosLayout; poses: readonly GalaxyPose[]; camera: CosmosCamera; room: CosmosRoom; dpr: number }): WalkNode[] {
  const { layout, poses, camera, room } = input;
  const out: WalkNode[] = [];
  if (layout.core.id) {
    const p = worldToScreen(camera, room, 0, 0);
    out.push({ id: layout.core.id, x: p.x, y: p.y });
  }
  layout.galaxies.forEach((g, i) => {
    const pose = poses[i];
    const p = worldToScreen(camera, room, pose?.x ?? g.x, pose?.y ?? g.y);
    out.push({ id: g.id, x: p.x, y: p.y });
  });
  return out;
}

export function walkTarget(_input: {
  key: string;
  selectedId: string | null;
  candidates: readonly WalkNode[];
  roomCentre: { x: number; y: number };
}): { id: string | null; deadEnd: boolean } {
  return { id: null, deadEnd: false };
}
