import type { Point } from "../../dial/dial-shapes";
import { openMaxPx } from "../open-star";
import type { FlatGraphPaintTokens } from "../flat-graph-shapes";
import { screenOf, discRadius, dotRadius } from "./place";
import { CULL_PX, ROOM_WHOLE_PX, F as frameState, fanPushes, type PushedDot, pushedDots } from "./state";

// A module-local name: see `F` in ./state.
const F = frameState;

/**
 * The marks of each star a push holds, where they draw this frame, hashed into square cells as wide
 * as a pushed dot's room can reach (`reach`), so each dot meets only the marks near it. Filled once a
 * frame in O(n) for n marks; the arrays grow with the largest star and are reused. `fans` holds the
 * capability whose push moves each mark. The room walk lists, for each pushed dot, the marks outside
 * its fan within `reach` (`outside`) and how far each stands (`apart`), so its crowd test reads them
 * instead of walking again. `radii` holds each mark's drawn radius, 0 off screen, and `starRadii`
 * each star's domain disc, read on the first crowd test of the frame.
 */
export const near = {
  reach: 1,
  count: 0,
  stars: [] as string[],
  starRadii: [] as number[],
  ids: [] as string[],
  fans: [] as (string | null)[],
  star: new Int32Array(0),
  capability: new Uint8Array(0),
  x: new Float64Array(0),
  y: new Float64Array(0),
  radii: new Float64Array(0),
  radiiRead: false,
  widest: 0,
  next: new Int32Array(0),
  heads: new Int32Array(0),
  seen: new Int32Array(0),
  stamp: 0,
  hits: new Int32Array(0),
  listed: 0,
  outside: new Int32Array(0),
  apart: new Float64Array(0),
  /** The frame whose rooms the pushed dots hold, and whether this frame's marks stand as that frame's did, moved together. */
  roomsFrame: -1,
  same: false,
  was: { tokens: null as FlatGraphPaintTokens | null, count: 0, x: new Float64Array(0), y: new Float64Array(0), ids: [] as string[], fans: [] as (string | null)[], stars: [] as string[], centres: new Float64Array(0) },
};

/** How far apart, px, two frames' marks may move unlike one another and still count as moved together. */
const SAME_PLACE_PX = 1e-6;

/**
 * Whether every hashed mark and each star's domain stands where the frame before put it, all shifted
 * by one offset, every mark keeps its fan and the tokens are the same: a pan at one zoom moves no mark
 * relative to another, so no pushed dot's room changes. O(n).
 */
function sameNearGeometry(): boolean {
  const was = near.was;
  if (was.tokens !== F.P || near.count !== was.count || near.stars.length !== was.stars.length || near.count === 0) return false;
  const ox = near.x[0]! - was.x[0]!;
  const oy = near.y[0]! - was.y[0]!;
  for (let j = 0; j < near.count; j += 1) {
    if (near.ids[j] !== was.ids[j] || near.fans[j] !== was.fans[j]) return false;
    if (!(Math.abs(near.x[j]! - was.x[j]! - ox) <= SAME_PLACE_PX && Math.abs(near.y[j]! - was.y[j]! - oy) <= SAME_PLACE_PX)) return false;
  }
  for (let star = 0; star < near.stars.length; star += 1) {
    if (near.stars[star] !== was.stars[star]) return false;
    const centre = screenOf(near.stars[star]!);
    if (!(Math.abs(centre.x - was.centres[star * 2]! - ox) <= SAME_PLACE_PX && Math.abs(centre.y - was.centres[star * 2 + 1]! - oy) <= SAME_PLACE_PX)) return false;
  }
  return true;
}

/** Keeps this frame's marks for the next frame's `sameNearGeometry`. O(n). */
function keepNearGeometry(): void {
  const was = near.was;
  was.tokens = F.P;
  if (was.x.length < near.count) {
    was.x = new Float64Array(near.x.length);
    was.y = new Float64Array(near.x.length);
  }
  was.x.set(near.x.subarray(0, near.count));
  was.y.set(near.y.subarray(0, near.count));
  was.count = near.count;
  was.ids.length = near.count;
  was.fans.length = near.count;
  for (let j = 0; j < near.count; j += 1) {
    was.ids[j] = near.ids[j]!;
    was.fans[j] = near.fans[j]!;
  }
  was.stars.length = near.stars.length;
  if (was.centres.length < near.stars.length * 2) was.centres = new Float64Array(near.stars.length * 4);
  for (let star = 0; star < near.stars.length; star += 1) {
    was.stars[star] = near.stars[star]!;
    const centre = screenOf(near.stars[star]!);
    was.centres[star * 2] = centre.x;
    was.centres[star * 2 + 1] = centre.y;
  }
}

function growNear(size: number): void {
  const grow = <T extends Int32Array | Uint8Array | Float64Array>(a: T, make: (n: number) => T): T => {
    const b = make(size);
    b.set(a);
    return b;
  };
  near.star = grow(near.star, (n) => new Int32Array(n));
  near.capability = grow(near.capability, (n) => new Uint8Array(n));
  near.x = grow(near.x, (n) => new Float64Array(n));
  near.y = grow(near.y, (n) => new Float64Array(n));
  near.radii = new Float64Array(size);
  near.next = new Int32Array(size);
  near.seen = new Int32Array(size);
  near.stamp = 0;
  near.hits = new Int32Array(size);
}

function addNear(id: string, star: number, capability: boolean): void {
  const i = near.count;
  if (i === near.x.length) growNear(Math.max(64, i * 2));
  const at = screenOf(id);
  near.ids[i] = id;
  near.fans[i] = pushedDots.get(id)?.capabilityId ?? null;
  near.star[i] = star;
  near.capability[i] = capability ? 1 : 0;
  near.x[i] = at.x;
  near.y[i] = at.y;
  near.count = i + 1;
}

function nearCell(v: number): number {
  return Math.floor(v / near.reach);
}

function nearBucket(cx: number, cy: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & (near.heads.length - 1);
}

/** Hashes every mark of each star a push of this layout holds, once the pushed dots are known. O(n). */
export function fillNear(): void {
  const { model, P } = F;
  near.count = 0;
  near.stars.length = 0;
  near.radiiRead = false;
  // A pair farther apart than this leaves a pushed dot a share no smaller than its open maximum over `openFill`, which changes no radius.
  near.reach = (P.elementOpenMaxPx + Math.max(P.capOpenMaxPx, P.elementOpenMaxPx)) / P.openFill;
  for (const push of fanPushes.values()) {
    if (push.layout !== F.layout || near.stars.includes(push.domainId)) continue;
    const domain = model.domainById.get(push.domainId);
    if (!domain) continue;
    const star = near.stars.push(push.domainId) - 1;
    for (const capabilityId of domain.capabilityIds) {
      addNear(capabilityId, star, true);
      for (const elementId of model.capabilityById.get(capabilityId)?.elementIds ?? []) addNear(elementId, star, false);
    }
    for (const elementId of domain.directElementIds) addNear(elementId, star, false);
  }
  let size = Math.max(16, near.heads.length);
  while (size < near.count * 2) size *= 2;
  if (size !== near.heads.length) near.heads = new Int32Array(size);
  near.heads.fill(-1);
  for (let i = 0; i < near.count; i += 1) {
    const bucket = nearBucket(nearCell(near.x[i]!), nearCell(near.y[i]!));
    near.next[i] = near.heads[bucket]!;
    near.heads[bucket] = i;
  }
  // The frame before's rooms and the marks each listed outside its fan hold while the marks only moved together.
  near.same = near.roomsFrame === F.frame - 1 && sameNearGeometry();
  if (!near.same) near.listed = 0;
  keepNearGeometry();
}

/**
 * Collects in `near.hits` each hashed mark within `reach` of (`x`, `y`) and some beyond it, each
 * once, and returns how many. A reach wider than the star, or a place no cell holds, collects every
 * mark. O(the marks in the cells it covers).
 */
function gatherNear(x: number, y: number, reach: number): number {
  const cx0 = nearCell(x - reach);
  const cx1 = nearCell(x + reach);
  const cy0 = nearCell(y - reach);
  const cy1 = nearCell(y + reach);
  let hits = 0;
  if (!((cx1 - cx0 + 1) * (cy1 - cy0 + 1) <= near.count)) {
    for (let j = 0; j < near.count; j += 1) near.hits[hits++] = j;
    return hits;
  }
  if (near.stamp >= 0x3fffffff) {
    near.seen.fill(0);
    near.stamp = 0;
  }
  near.stamp += 1;
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let j = near.heads[nearBucket(cx, cy)]!; j >= 0; j = near.next[j]!) {
        if (near.seen[j] === near.stamp) continue;
        near.seen[j] = near.stamp;
        near.hits[hits++] = j;
      }
    }
  }
  return hits;
}

function listOutside(j: number, apart: number): void {
  const k = near.listed;
  if (k === near.outside.length) {
    const size = Math.max(256, k * 2);
    const outside = new Int32Array(size);
    outside.set(near.outside);
    near.outside = outside;
    const aparts = new Float64Array(size);
    aparts.set(near.apart);
    near.apart = aparts;
  }
  near.outside[k] = j;
  near.apart[k] = apart;
  near.listed = k + 1;
}

/**
 * A pushed element's room in px in star `star` at (`x`, `y`), the others where they draw: its share
 * of each pair and its distance from the domain's centre. It leaves out the world rooms' term for
 * the nearest mark's own radius, which switches between two marks at nearly one distance as a dot
 * moves; the push itself clears the capability's disc. Its own fan and capability only part from it
 * as the star opens. Only the marks within `near.reach` can change its radius; it lists those
 * outside its fan for its crowd test. O(the marks near it).
 */
export function roomNear(star: number, id: string, dot: PushedDot, x: number, y: number): void {
  const own = openMaxPx("element", F.P);
  const capability = openMaxPx("capability", F.P);
  const fixed = screenOf(near.stars[star]!);
  const room = dot.room;
  room.kind = "element";
  room.paired = Infinity;
  room.nearest = Infinity;
  room.nearestId = null;
  room.pastFixed = Math.hypot(x - fixed.x, y - fixed.y);
  dot.from = near.listed;
  const reach2 = near.reach * near.reach;
  const hits = gatherNear(x, y, near.reach);
  for (let h = 0; h < hits; h += 1) {
    const j = near.hits[h]!;
    const dx = x - near.x[j]!;
    const dy = y - near.y[j]!;
    const apart2 = dx * dx + dy * dy;
    if (!(apart2 < reach2) || near.star[j] !== star) continue;
    const other = near.ids[j]!;
    if (other === id) continue;
    const apart = Math.sqrt(apart2);
    const isCapability = near.capability[j] === 1;
    const paired = (apart * own) / (own + (isCapability ? capability : own));
    if (paired < room.paired) room.paired = paired;
    if (isCapability ? other !== dot.capabilityId : near.fans[j] !== dot.capabilityId) listOutside(j, apart);
  }
  dot.to = near.listed;
}

/** Each hashed mark's and each star's domain disc's drawn radius this frame, 0 for a mark off screen, and the widest mark's. O(n × stars), once a frame. */
function readNearRadii(): void {
  near.radiiRead = true;
  near.widest = 0;
  for (let j = 0; j < near.count; j += 1) {
    const x = near.x[j]!;
    const y = near.y[j]!;
    const id = near.ids[j]!;
    const shown = x > -CULL_PX && y > -CULL_PX && x < F.W + CULL_PX && y < F.H + CULL_PX;
    const r = !shown ? 0 : near.capability[j] === 1 ? discRadius(id) : dotRadius(id);
    near.radii[j] = r;
    if (r > near.widest) near.widest = r;
  }
  near.starRadii.length = near.stars.length;
  for (let star = 0; star < near.stars.length; star += 1) near.starRadii[star] = discRadius(near.stars[star]!);
}

/**
 * How clear a pushed dot of radius `r` at `at` stands of the drawn marks outside its fan: the
 * domain's disc, the other capabilities' discs and the other fans' dots. Its own capability's disc
 * is the cover rule's. A mark farther than `ROOM_WHOLE_PX` past both radii changes nothing the
 * cover rule draws, so it reads the marks its room walk listed while they reach that far, and walks
 * the cells again only for a mark wider than that. O(the marks near it).
 */
export function crowdClear(id: string, r: number, at: Point): number {
  const dot = pushedDots.get(id)!;
  const star = near.stars.indexOf(fanPushes.get(dot.capabilityId)!.domainId);
  if (star < 0) return ROOM_WHOLE_PX;
  if (!near.radiiRead) readNearRadii();
  const centre = screenOf(near.stars[star]!);
  let clear = Math.hypot(at.x - centre.x, at.y - centre.y) - near.starRadii[star]! - r;
  const reach = r + near.widest + ROOM_WHOLE_PX;
  if (reach <= near.reach) {
    for (let k = dot.from; k < dot.to; k += 1) {
      const otherR = near.radii[near.outside[k]!]!;
      if (!(otherR > 0)) continue;
      const gap = near.apart[k]! - otherR - r;
      if (gap < clear) clear = gap;
    }
    return clear;
  }
  const hits = gatherNear(at.x, at.y, reach);
  for (let h = 0; h < hits; h += 1) {
    const j = near.hits[h]!;
    const dx = at.x - near.x[j]!;
    const dy = at.y - near.y[j]!;
    const apart2 = dx * dx + dy * dy;
    const otherR = near.radii[j]!;
    if (!(apart2 < reach * reach) || !(otherR > 0) || near.star[j] !== star) continue;
    const other = near.ids[j]!;
    if (other === id || (near.capability[j] === 1 ? other === dot.capabilityId : near.fans[j] === dot.capabilityId)) continue;
    const gap = Math.sqrt(apart2) - otherR - r;
    if (gap < clear) clear = gap;
  }
  return clear;
}
