import { pickInitialFocus, pickNeighborInDirection, walkDirectionForKey, type WalkNode } from "../interaction/keyboard-walk";
import { keyboardZoomIntent } from "../interaction/keyboard-zoom";
import { galaxyMatrix, liveBandRadius, worldToScreen } from "./cosmos-camera";
import { galaxyCentreOn } from "./cosmos-engine-watch";
import type { CosmosLayout } from "./layout/cosmos-layout";
import type { CosmosCamera, CosmosRoom, GalaxyPose } from "./cosmos-types";
import { isImeComposing } from "@/shared/lib/ime-composition";

const inRoom = (room: CosmosRoom, x: number, y: number) =>
  x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height;

export function walkCandidates(input: { layout: CosmosLayout; poses: readonly GalaxyPose[]; camera: CosmosCamera; room: CosmosRoom; dpr: number }): WalkNode[] {
  const { layout, poses, camera, room, dpr } = input;
  const out: WalkNode[] = [];
  const push = (id: string, x: number, y: number) => {
    if (inRoom(room, x, y)) out.push({ id, x, y });
  };
  const core = layout.core;
  for (let i = 0; i < core.starIds.length; i += 1) {
    const p = worldToScreen(camera, room, core.starX[i]!, core.starY[i]!);
    push(core.starIds[i]!, p.x, p.y);
  }
  const live = liveBandRadius(dpr);
  layout.galaxies.forEach((g, i) => {
    const pose = poses[i];
    if (!pose || g.radius * camera.scale <= live) {
      const p = worldToScreen(camera, room, pose?.x ?? g.x, pose?.y ?? g.y);
      push(g.id, p.x, p.y);
      return;
    }
    const m = galaxyMatrix(g, pose, camera, room);
    for (let s = 0; s < g.starIds.length; s += 1) {
      const u = g.starU[s]! * pose.condense;
      const v = g.starV[s]! * pose.condense;
      push(g.starIds[s]!, m.a * u + m.c * v + m.e, m.b * u + m.d * v + m.f);
    }
  });
  return out;
}

export function walkTarget(input: {
  key: string;
  selectedId: string | null;
  candidates: readonly WalkNode[];
  roomCentre: { x: number; y: number };
  galaxyCentreOf?: (id: string) => { x: number; y: number } | null;
}): { id: string | null; deadEnd: boolean } {
  const { key, selectedId, candidates, roomCentre, galaxyCentreOf } = input;
  const direction = walkDirectionForKey(key);
  if (!direction) return { id: null, deadEnd: false };
  if (!selectedId) {
    const id = pickInitialFocus(candidates, roomCentre);
    return { id, deadEnd: id === null };
  }
  const drawn = candidates.find((c) => c.id === selectedId);
  const at = drawn ?? galaxyCentreOf?.(selectedId) ?? null;
  if (!at) {
    const id = pickInitialFocus(candidates, roomCentre);
    return { id, deadEnd: id === null };
  }
  const id = pickNeighborInDirection({ id: selectedId, x: at.x, y: at.y }, candidates, direction);
  return id ? { id, deadEnd: false } : { id: null, deadEnd: true };
}

export type CosmosKeyAction = { kind: "zoom"; factor: number } | { kind: "fit" } | { kind: "overview" } | { kind: "pane" } | { kind: "fly"; galaxy: number } | { kind: "select"; id: string } | { kind: "deadEnd" };

export function cosmosKeyAction(
  e: KeyboardEvent,
  input: { layout: CosmosLayout; poses: readonly GalaxyPose[]; camera: CosmosCamera; room: CosmosRoom; dpr: number; selectedId: string | null; zoomSpeed: number },
): CosmosKeyAction | null {
  const { layout, poses, camera, room, selectedId } = input;
  const intent = keyboardZoomIntent(e, input.zoomSpeed);
  if (intent) e.preventDefault();
  if (intent) return intent;
  if (e.key === "Escape") return { kind: selectedId !== null ? "pane" : "overview" };
  if (e.key === "Enter") {
    if (isImeComposing(e)) return null;
    const galaxy = layout.galaxies.findIndex((g) => g.id === selectedId);
    if (galaxy >= 0) e.preventDefault();
    return { kind: "fly", galaxy };
  }
  if (!walkDirectionForKey(e.key)) return null;
  const candidates = walkCandidates(input);
  const roomCentre = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  const step = walkTarget({ key: e.key, selectedId, candidates, roomCentre, galaxyCentreOf: (id) => galaxyCentreOn(layout, poses, camera, room, id) });
  if (step.id) return { kind: "select", id: step.id };
  return step.deadEnd ? { kind: "deadEnd" } : null;
}
