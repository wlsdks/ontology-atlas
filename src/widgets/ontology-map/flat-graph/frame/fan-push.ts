import type { Point } from "../../dial/types";
import { graphDiscRadiusPx, LIT_DOT_SHARE } from "../marks";
import { DAMPED, dampedStep, FLAT_MOTION } from "../motion";
import { openRadiusPx, roomLimitPx } from "../open-star";
import type { FlatGraphLayout } from "../types";
import { screenOf, leavingFanShare, fanShare, radiusNow, roomLimit, openedRadius, closingDomainStar } from "./place";
import { near, fillNear, roomNear } from "./push-crowd";
import { ROOM_WHOLE_PX, cacheFor, MARK_STEP_MAX_MS, MARK_REST_PX, F as frameState, fanPushes, pushedDots } from "./state";

// A module-local name: see `F` in ./state.
const F = frameState;

/** The most of a push a closing fan may let show in one frame when the push takes its need at once. */
const LEAVING_PUSH_STEP_PX = 0.5;

const fanCache = new WeakMap<FlatGraphLayout, Map<string, ReadonlyMap<string, readonly string[]>>>();

/**
 * `domainId`'s capabilities and the elements the layout fans round each: an element several list
 * goes to the one laid out nearest it, and a direct element fans round no disc. Once per layout and
 * domain, O(the domain's listings).
 */
function fansOf(domainId: string): ReadonlyMap<string, readonly string[]> {
  const byDomain = cacheFor(fanCache, F.layout);
  const known = byDomain.get(domainId);
  if (known) return known;
  const { model, layout } = F;
  const domain = model.domainById.get(domainId);
  const direct = new Set(domain?.directElementIds ?? []);
  const nearest = new Map<string, { capabilityId: string; apart: number }>();
  for (const capabilityId of domain?.capabilityIds ?? []) {
    const centre = layout.positions.get(capabilityId);
    if (!centre) continue;
    for (const id of model.capabilityById.get(capabilityId)?.elementIds ?? []) {
      const at = layout.positions.get(id);
      if (!at || direct.has(id)) continue;
      const apart = Math.hypot(at.x - centre.x, at.y - centre.y);
      const known = nearest.get(id);
      if (!known || apart < known.apart) nearest.set(id, { capabilityId, apart });
    }
  }
  const fans = new Map<string, string[]>();
  for (const [id, { capabilityId }] of nearest) {
    let fan = fans.get(capabilityId);
    if (!fan) fans.set(capabilityId, (fan = []));
    fan.push(id);
  }
  byDomain.set(domainId, fans);
  return fans;
}

function homePx(id: string, out: Point): boolean {
  const home = F.input.nodeAt?.(id) ?? F.layout.positions.get(id);
  if (!home) return false;
  out.x = home.x * F.scale + F.originX;
  out.y = home.y * F.scale + F.originY;
  return true;
}

/** The radius `id` heads for this frame, or already draws at when that is larger. */
function radiusAim(id: string, target: number): number {
  return Math.max(F.drawn.get(id)?.r ?? 0, target);
}

/** The radius an element dot opens to in its own place this frame, before any push. O(stars). */
function openedDotRadius(id: string): number {
  const rest = dotRest(id);
  return Math.min(openedRadius(id, rest), roomLimit(id, rest));
}

function dotRest(id: string): number {
  return radiusNow(id) * (F.attention.lit?.has(id) === true ? LIT_DOT_SHARE : 1);
}

const fanCentre = { x: 0, y: 0 };
const fanDot = { x: 0, y: 0 };

/**
 * How far `capabilityId`'s fan must move out for each of its elements, at the radius it heads for,
 * to clear the disc the capability heads for by `ROOM_WHOLE_PX`; none when it already does, or when
 * the fan is opened round a selection. The fan of a member the reader just let go keeps its need as
 * it closes, so its dots come home already clear of the disc. `worldRooms` reads every dot at the
 * radius its world room opens it to, as it draws once its push is let go. O(the fan × stars).
 */
function fanNeed(capabilityId: string, elementIds: readonly string[], worldRooms = false): number {
  if (!homePx(capabilityId, fanCentre)) return 0;
  const own = radiusNow(capabilityId);
  const special = capabilityId === F.selectedId ? F.selectedR : capabilityId === F.leavingId ? F.leavingR : null;
  const disc = radiusAim(capabilityId, special ?? Math.min(openedRadius(capabilityId, own), roomLimit(capabilityId, own)));
  const closing = capabilityId === F.leavingId ? capabilityId : null;
  let need = 0;
  for (const id of elementIds) {
    if (fanShare(id, closing) > 0) return 0;
    // The selection draws at its own radius and no disc covers it.
    if (id === F.selectedId || id === F.leavingId || !homePx(id, fanDot)) continue;
    const apart = Math.hypot(fanDot.x - fanCentre.x, fanDot.y - fanCentre.y);
    if (apart < 1e-6) continue;
    const pushed = worldRooms ? undefined : pushedDots.get(id)?.radius;
    need = Math.max(need, disc + radiusAim(id, pushed ?? openedDotRadius(id)) + ROOM_WHOLE_PX - apart);
  }
  return need;
}

/**
 * Whether a held fan's push, at none and needed by none, may let its dots go back to their world
 * rooms: each opens there no smaller than its pushed room draws it, and still clears the disc. The
 * world room adds a term for the nearest mark's own radius; letting go while it binds would shrink a
 * dot mid-zoom, and letting go while it still needs a push would bring the push straight back.
 * Read before this frame moves the fan's dots, so a dot's room is still its world room.
 * O(the fan × stars).
 */
function pushReleases(capabilityId: string, elementIds: readonly string[]): boolean {
  if (!(fanNeed(capabilityId, elementIds, true) <= 0)) return false;
  for (const id of elementIds) {
    const dot = pushedDots.get(id);
    if (dot !== undefined && !(openedDotRadius(id) >= dot.radius - MARK_REST_PX)) return false;
  }
  return true;
}

/**
 * Moves each fan of the focused domain's star out of the disc its capability opens to, as far as its
 * innermost element needs to clear it: the free map can frame a wide star at a scale where a large
 * capability's disc covers its nearest elements, and a covered dot is not drawn. Once the star is let
 * go, the push eases back to none. A pushed fan's dots keep their pushed rooms (`roomNear`) until
 * the push is back at none and lets go (`pushReleases`), or until the star has closed, so no dot
 * changes rule on the way; one that passes a mark outside its fan fades on its room like a covered
 * dot (`crowdClear`). Decided here in O(n × stars + k × m) for a star of n marks, k of them in
 * pushed fans, m the marks within a dot's reach; the crowd test adds O(n × stars) once a frame for
 * the drawn radii and O(m) per pushed dot it draws.
 */
export function planFanPushes(focusedDomain: string | null): void {
  if (focusedDomain !== null) {
    for (const [capabilityId, elementIds] of fansOf(focusedDomain)) {
      // A need that is not a finite number, as a frame whose zoom is none asks, counts as none.
      const asked = fanNeed(capabilityId, elementIds);
      const need = asked > 0 && asked < Infinity ? asked : 0;
      let push = fanPushes.get(capabilityId);
      if (!push) {
        if (!(need > 0)) continue;
        fanPushes.set(capabilityId, (push = { domainId: focusedDomain, layout: F.layout, d: 0, perMs: 0, target: 0, need: 0, at: F.now, frame: F.frame - 1, held: 0 }));
      }
      push.need = need;
      push.held = F.frame;
    }
  }
  for (const [capabilityId, push] of fanPushes) {
    const held = push.held === F.frame && push.layout === F.layout && push.domainId === focusedDomain;
    push.target = held ? push.need : 0;
    if (push.frame !== F.frame) {
      const stepMs = Math.min(Math.max(0, F.now - push.at), MARK_STEP_MAX_MS);
      // A fan closing round a member the reader let go carries its dots to their pushed places itself
      // and shows only (1 - its share) of the push: the push takes its need at once while what shows
      // of the step stays under `LEAVING_PUSH_STEP_PX`.
      const shown = capabilityId === F.leavingId ? 1 - leavingFanShare(capabilityId) : 1;
      if (F.reducedMotion || Math.abs(push.target - push.d) <= MARK_REST_PX || shown * Math.abs(push.target - push.d) < LEAVING_PUSH_STEP_PX) {
        push.d = push.target;
        push.perMs = 0;
      } else {
        push.d = dampedStep(push.d, push.frame === F.frame - 1 ? push.perMs : 0, push.target, stepMs, FLAT_MOTION.riseMs, F.P.markPxPerMs);
        push.perMs = DAMPED.perMs;
        F.lagging = true;
      }
      if (!Number.isFinite(push.d) || !Number.isFinite(push.perMs)) {
        push.d = 0;
        push.perMs = 0;
      }
      push.at = F.now;
      push.frame = F.frame;
    }
    if (push.d !== 0 || push.domainId === closingDomainStar()) continue;
    if (!held || (push.need === 0 && pushReleases(capabilityId, fansOf(push.domainId).get(capabilityId) ?? []))) fanPushes.delete(capabilityId);
  }
  for (const [capabilityId, push] of fanPushes) {
    if (push.layout !== F.layout || !homePx(capabilityId, fanCentre)) continue;
    for (const id of fansOf(push.domainId).get(capabilityId) ?? []) {
      if (!homePx(id, fanDot)) continue;
      const apart = Math.hypot(fanDot.x - fanCentre.x, fanDot.y - fanCentre.y);
      if (apart < 1e-6) continue;
      let dot = pushedDots.get(id);
      if (!dot) pushedDots.set(id, (dot = { capabilityId, ux: 0, uy: 0, frame: 0, room: { kind: "element", paired: Infinity, nearest: Infinity, nearestId: null, pastFixed: Infinity }, radius: 0, from: 0, to: 0 }));
      dot.capabilityId = capabilityId;
      dot.ux = (fanDot.x - fanCentre.x) / apart;
      dot.uy = (fanDot.y - fanCentre.y) / apart;
      dot.frame = F.frame;
    }
  }
  for (const [id, dot] of pushedDots) if (dot.frame !== F.frame) pushedDots.delete(id);
  if (pushedDots.size === 0) return;
  fillNear();
  const fixedPx = graphDiscRadiusPx("domain", 0, F.P, F.growth);
  const reuse = near.same;
  near.roomsFrame = F.frame;
  for (const [id, dot] of pushedDots) {
    const star = near.stars.indexOf(fanPushes.get(dot.capabilityId)!.domainId);
    if (star < 0) continue;
    if (!reuse) {
      const at = screenOf(id);
      roomNear(star, id, dot, at.x, at.y);
    }
    const rest = dotRest(id);
    dot.radius = Math.min(openRadiusPx(rest, dot.room, 1, fixedPx, F.P, 0), roomLimitPx(rest, dot.room, 1, fixedPx, 0));
  }
}
