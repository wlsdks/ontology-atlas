import type { DialModel, Point } from "../dial/types";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "./types";

export type OpenKind = "capability" | "element";

/** A mark of an opened star: where it stands and which open maximum it grows toward. */
export interface StarPoint extends Point { id: string; kind: OpenKind }

/**
 * A mark's room in the units its points were given: `paired`, the least distance to another mark
 * times this mark's share of that pair; `nearest`, the distance to its closest mark `nearestId`,
 * whose own radius it leaves clear; `pastFixed`, its distance to the star's fixed disc, which does
 * not grow and so leaves the mark everything past its own radius.
 */
export interface StarRoom { kind: OpenKind; paired: number; nearest: number; nearestId: string | null; pastFixed: number }

type OpenTokens = Pick<FlatGraphPaintTokens, "capOpenMaxPx" | "elementOpenMaxPx" | "openFill">;

export const openMaxPx = (kind: OpenKind, tokens: OpenTokens): number => (kind === "capability" ? tokens.capOpenMaxPx : tokens.elementOpenMaxPx);

/**
 * Each mark's room among `points`. A pair splits its distance in proportion to the two open maxima,
 * so a capability beside an element takes the larger part and two filled shares never meet.
 * Coincident marks leave each other no room. O(n²), n = the star's marks.
 */
export function starRooms(points: readonly StarPoint[], fixed: Point | null, tokens: OpenTokens): Map<string, StarRoom> {
  const rooms = new Map<string, StarRoom>();
  for (const p of points) rooms.set(p.id, { kind: p.kind, paired: Infinity, nearest: Infinity, nearestId: null, pastFixed: fixed ? Math.hypot(p.x - fixed.x, p.y - fixed.y) : Infinity });
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const aMax = openMaxPx(a.kind, tokens);
    const roomA = rooms.get(a.id)!;
    for (let j = i + 1; j < points.length; j += 1) {
      const b = points[j]!;
      const bMax = openMaxPx(b.kind, tokens);
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const roomB = rooms.get(b.id)!;
      roomA.paired = Math.min(roomA.paired, (distance * aMax) / (aMax + bMax));
      roomB.paired = Math.min(roomB.paired, (distance * bMax) / (aMax + bMax));
      if (distance < roomA.nearest) {
        roomA.nearest = distance;
        roomA.nearestId = b.id;
      }
      if (distance < roomB.nearest) {
        roomB.nearest = distance;
        roomB.nearestId = a.id;
      }
    }
  }
  return rooms;
}

/**
 * The radius a mark of an opened star is drawn at, its rooms read at `scale` beside a fixed disc
 * of `fixedPx` and its nearest mark of own radius `nearestOwnPx`: `openFill` of its room, never past
 * its open maximum, never into that mark when it keeps its own radius, and never under its own radius.
 */
export function openRadiusPx(ownPx: number, room: StarRoom, scale: number, fixedPx: number, tokens: OpenTokens, nearestOwnPx: number): number {
  const roomPx = Math.max(0, Math.min(room.paired * scale, room.pastFixed * scale - fixedPx, room.nearest * scale - nearestOwnPx / tokens.openFill));
  return Math.max(ownPx, Math.min(openMaxPx(room.kind, tokens), tokens.openFill * roomPx));
}

/**
 * The largest radius a mark of a star may draw at `scale` without reaching its pair's share, the
 * fixed disc, or its nearest mark at that mark's own radius; never under its own radius.
 */
export function roomLimitPx(ownPx: number, room: StarRoom, scale: number, fixedPx: number, nearestOwnPx: number): number {
  return Math.max(ownPx, Math.min(room.paired * scale, room.pastFixed * scale - fixedPx, room.nearest * scale - nearestOwnPx));
}

/** The concepts a selected domain's star opens: its member capabilities, then every element of the domain. */
export function domainStarIds(model: DialModel, domainId: string): { capabilities: readonly string[]; elements: readonly string[] } {
  const domain = model.domainById.get(domainId);
  if (!domain) return { capabilities: [], elements: [] };
  const elements = [...domain.directElementIds, ...domain.capabilityIds.flatMap((id) => model.capabilityById.get(id)?.elementIds ?? [])];
  return { capabilities: domain.capabilityIds, elements };
}

const domainRoomCache = new WeakMap<FlatGraphLayout, Map<string, ReadonlyMap<string, StarRoom>>>();

/** A domain star's rooms in world units, around the domain's own disc; once per layout and domain. */
export function domainStarRooms(model: DialModel, layout: FlatGraphLayout, domainId: string, tokens: OpenTokens): ReadonlyMap<string, StarRoom> {
  let byDomain = domainRoomCache.get(layout);
  if (!byDomain) domainRoomCache.set(layout, (byDomain = new Map()));
  const known = byDomain.get(domainId);
  if (known) return known;
  const { capabilities, elements } = domainStarIds(model, domainId);
  const points: StarPoint[] = [];
  const add = (id: string, kind: OpenKind) => {
    const at = layout.positions.get(id);
    if (at) points.push({ id, kind, x: at.x, y: at.y });
  };
  for (const id of capabilities) add(id, "capability");
  for (const id of elements) add(id, "element");
  const rooms = starRooms(points, layout.positions.get(domainId) ?? null, tokens);
  byDomain.set(domainId, rooms);
  return rooms;
}
