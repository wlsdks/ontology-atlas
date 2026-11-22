import type { Box, Point } from "../../dial/dial-shapes";
import { inkUnder } from "../attention";
import { FLAT_MOTION } from "../motion";
import { nameBlockDraws } from "../names";
import { type PlacedName } from "../names/placed-name";
import { FLAT_TIER_TIMING, tierNameAlpha } from "../../morph/tier-assembly";
import { grownMarks, nameClear, onGrownDot, CAPTION_ROWS } from "./name-room";
import { loadInk, screenAt, discRadius, dotRadius } from "./place";
import { DRAWN_INK, names, L, type DrawnName, MARK_STEP_MAX_MS, NAME_REST_PX, F as frameState, scratch } from "./state";

// A module-local name: see `F` in ./state.
const F = frameState;

/** The step a name that starts to arrive takes in its first frame: one 60 Hz frame. */
const NAME_FIRST_STEP_MS = 1000 / 60;

/** A name waits for its mark: it fades in once the first open has nearly set its concept down. */
function nameLanded(id: string): number {
  return tierNameAlpha(F.input.appearOf(id), FLAT_TIER_TIMING.riseMs);
}

function loadNameInk(n: PlacedName): void {
  if (n.role === "project" || n.role === "domain" || n.role === "units" || n.role === "orphans" || n.role === "reach") {
    loadInk(n.id);
    const landed = nameLanded(n.id);
    scratch[0] = scratch[0]! * (n.role === "units" || n.role === "orphans" ? F.P.restHue * landed : landed);
    return;
  }
  const input = F.input;
  const attention = F.attention;
  const focus = F.settled ? inkUnder(attention, n.id, 0) : F.motion.ink(n.id, 0, 1);
  const brightened = attention.selected && n.id === input.hoveredNodeId ? 1 : focus;
  const lens = F.contextMode ? input.contextInkAlphas?.get(n.id) ?? 1 : 1;
  const elementShare = n.role === "element" && attention.lit?.has(n.id) !== true ? F.dotAlpha : 1;
  scratch[0] = brightened * lens * elementShare * nameLanded(n.id);
}

/** One admitted name, when its concept draws, its box reaches the viewport and its ink shows. */
/**
 * The record of `n`'s drawn ink in this world, one per side of its mark: a name that changes side
 * fades out where it stood and in where it goes, and one that moves along its side glides. O(rows
 * of its concept).
 */
function drawnNameOf(n: PlacedName, wasFocus: boolean): DrawnName {
  let rows = F.names.names.get(n.id);
  if (!rows) F.names.names.set(n.id, (rows = []));
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (row.name.role === n.role && row.wasFocus === wasFocus && sideOf(row.name) === sideOf(n)) return row;
  }
  const row: DrawnName = { name: n, wasFocus, alpha: 0, dx: n.dx, dy: n.dy, at: F.now, frame: -1, admitted: -1, offScreen: -1, stepped: -1, glided: -1, glidedAt: F.now };
  rows.push(row);
  return row;
}

/** Which side of its mark a name stands on: right, left, above or below; two names on different sides never overlap. */
export function sideOf(n: PlacedName): number {
  return n.align === "left" ? 0 : n.align === "right" ? 1 : n.dy < 0 ? 2 : 3;
}

/**
 * Moves a name's drawn offset from its mark toward the offset its admission placed it at, at most a
 * `FLAT_MOTION.riseMs` share of the way per ms, so a name moving along its side glides. Once a frame.
 */
function glideName(row: DrawnName): void {
  if (row.glided === F.frame) return;
  const continuing = row.glided === F.frame - 1;
  const stepMs = Math.min(Math.max(0, F.now - row.glidedAt), MARK_STEP_MAX_MS);
  row.glided = F.frame;
  row.glidedAt = F.now;
  const n = row.name;
  // An offset a frame with no finite scale left behind never nears its place: the name takes it at once.
  if (!continuing || F.reducedMotion || !Number.isFinite(row.dx) || !Number.isFinite(row.dy)) {
    row.dx = n.dx;
    row.dy = n.dy;
    return;
  }
  const share = Math.min(1, stepMs / FLAT_MOTION.riseMs);
  row.dx = Math.abs(n.dx - row.dx) < NAME_REST_PX ? n.dx : row.dx + (n.dx - row.dx) * share;
  row.dy = Math.abs(n.dy - row.dy) < NAME_REST_PX ? n.dy : row.dy + (n.dy - row.dy) * share;
  if (row.dx !== n.dx || row.dy !== n.dy) F.lagging = true;
}

/**
 * The ink a name draws this frame: its target approached from what the frame before drew, at most
 * full ink per `FLAT_MOTION.riseMs` arriving and per `exitMs` leaving. A name the frame before did
 * not draw starts from nothing, unless it was admitted off screen then (a pan brought it on
 * screen); reduced motion and the map's first frame take the target at once.
 */
function drawnNameInk(row: DrawnName, target: number): number {
  // A name planned twice in one frame draws the ink its first plan stepped to.
  if (row.stepped === F.frame) return row.alpha;
  row.stepped = F.frame;
  let alpha = target;
  if (!F.reducedMotion && F.frame > 1) {
    const continuing = row.frame === F.frame - 1;
    if (continuing || row.offScreen !== F.frame - 1) {
      const from = continuing ? row.alpha : 0;
      const stepMs = continuing ? Math.min(Math.max(0, F.now - row.at), MARK_STEP_MAX_MS) : NAME_FIRST_STEP_MS;
      alpha = target > from ? Math.min(target, from + stepMs / FLAT_MOTION.riseMs) : Math.max(target, from - stepMs / FLAT_MOTION.exitMs);
    }
  }
  if (alpha !== target) F.lagging = true;
  row.alpha = alpha;
  row.at = F.now;
  if (alpha > 0) {
    row.frame = F.frame;
    F.names.namesNow.push(row);
  }
  return alpha;
}

export function planName(n: PlacedName, alphas: ReadonlyMap<string, number>, share: number, wasFocus: boolean): void {
  const row = drawnNameOf(n, wasFocus);
  row.admitted = F.frame;
  row.name = n;
  placeName(row, alphas, share, false);
}

/** Plans a name's mark at the ink it draws this frame; `fading` names one no longer admitted, its ink running out. */
export function placeName(row: DrawnName, alphas: ReadonlyMap<string, number>, share: number, fading: boolean): void {
  const n = row.name;
  const wasFocus = row.wasFocus;
  const at = screenAt(n.id);
  if (!at || alphas.get(n.id) === 0) return;
  if (at.x + n.box.maxX < 0 || at.x + n.box.minX > F.W || at.y + n.box.maxY < 0 || at.y + n.box.minY > F.H) {
    if (!fading) row.offScreen = F.frame;
    return;
  }
  let target = 0;
  let room = 1;
  let backed = n.backed === true;
  if (!fading) {
    loadNameInk(n);
    target = scratch[0]! * share;
  }
  glideName(row);
  // A name arrives only where it is clear and leaves at full pace where it is not. The selection's name
  // gives way only to a disc drawn past its resting radius: names below it give way to it, and its plate covers dots.
  if (target > DRAWN_INK && grownMarks.size > 0) {
    const held = n.id === F.attention.focusId && !CAPTION_ROWS.has(n.role);
    room = nameClear(n, at, at.x + row.dx - n.dx, at.y + row.dy - n.dy, held) ? 1 : 0;
    // The selection's name stays put while its star's dots move out past it, so it draws on its plate while one crosses it.
    if (held && !backed) backed = onGrownDot(n, at.x + row.dx - n.dx, at.y + row.dy - n.dy);
    target *= room;
  }
  if (target <= DRAWN_INK) target = 0;
  const ink = drawnNameInk(row, target);
  if (ink <= DRAWN_INK) return;
  const { P, attention } = F;
  const inks = F.tokens.inks;
  const childSelected = n.role === "domain" && attention.selected && attention.focusId !== n.id && F.model.domainOf.get(attention.focusId ?? "") === n.id;
  const strong = (n.role === "domain" && !childSelected) || n.role === "project" || ((n.role === "capability" || n.role === "element") && (wasFocus || n.id === attention.focusId));
  const color = strong ? inks.nameStrong : inks.name;
  const mark = names.take();
  mark.name = n;
  const x = at.x + row.dx;
  const y = at.y + row.dy;
  const halo = n.role === "domain" ? P.domainNameHaloPx : P.nameHaloPx;
  if (mark.x !== x) mark.x = x;
  if (mark.y !== y) mark.y = y;
  if (mark.ink !== ink) mark.ink = ink;
  if (mark.room !== room) mark.room = room;
  mark.fading = fading;
  mark.backed = backed;
  mark.color = color;
  if (mark.halo !== halo) mark.halo = halo;
  const markR = n.leader ? (n.role === "element" ? dotRadius(n.id) : discRadius(n.id)) : 0;
  if (mark.markR !== markR) mark.markR = markR;
  L.names.add(mark);
}

const TITLE_ROLES: ReadonlySet<PlacedName["role"]> = new Set(["project", "domain", "orphans"]);

/**
 * Titles and the names a lit picture asks for (the selection and its lines' far ends) hold their place
 * over marks, as admission placed them; a far end's name still gives way to a higher-ranked name, and a
 * census or reach row is a caption that gives way like any name.
 */
function holdsPlace(n: PlacedName): boolean {
  return TITLE_ROLES.has(n.role) || ((n.role === "capability" || n.role === "element") && F.attention.named.has(n.id));
}

export const NAME_RANKS = 5;
export const nameRanks: number[] = [];
/** This frame's admitted names, each on the side it draws: an open star's member may trade its side for one clear of chrome. */
export const plannedNames: PlacedName[] = [];

/** Which names win where two would cross: places held, then names the lit picture asks for, capabilities, elements, and captions last. */
export function nameRank(n: PlacedName): number {
  if (holdsPlace(n)) return n.id === F.attention.focusId || TITLE_ROLES.has(n.role) ? 0 : 1;
  if (n.role !== "capability" && n.role !== "element") return 4;
  return n.role === "capability" ? 2 : 3;
}

/** Whether a concept's block of names may draw: its concept is not placed this frame, it is the selection, or every line clears the chrome. */
export function blockShows(list: readonly PlacedName[], from: number, to: number, chrome: readonly Box[], selectedId: string | null): boolean {
  const at = screenAt(list[from]!.id);
  return !at || nameBlockDraws(list, from, to, at.x, at.y, chrome, selectedId);
}

/** Whether every line of a block stands inside the free map by the frame margin, as a framed star does. O(block). */
function blockInsideFree(list: readonly PlacedName[], from: number, to: number): boolean {
  const at = screenAt(list[from]!.id);
  if (!at) return true;
  const f = F.input.freeRect;
  const m = F.P.frameMarginPx;
  const pad = F.P.namePadPx;
  for (let i = from; i < to; i += 1) {
    const b = list[i]!.box;
    if (at.x + b.minX + pad < f.minX + m || at.x + b.maxX - pad > f.maxX - m || at.y + b.minY + pad < f.minY + m || at.y + b.maxY - pad > f.maxY - m) return false;
  }
  return true;
}

/** Whether an opened domain star's member block may draw: clear of the chrome and inside the free map. */
export function memberBlockShows(list: readonly PlacedName[], from: number, to: number, chrome: readonly Box[]): boolean {
  return blockShows(list, from, to, chrome, null) && blockInsideFree(list, from, to);
}

/** Each fallback side drawn on its plate, made once per side: its plate covers the grown dots it stands on. */
const backedSides = new WeakMap<PlacedName, PlacedName>();

/** Whether this frame already draws a name for `id` that is clear where it stands. O(names drawn). */
function namedNow(id: string): boolean {
  for (let i = 0; i < L.names.size; i += 1) {
    const m = L.names.items[i]!;
    if (m.name.id === id && m.name.role === "capability" && !m.fading && m.room === 1) return true;
  }
  return false;
}

/**
 * Names each opened star member this frame left unnamed on the first of its fallback sides that
 * stands inside the free map, clear of the chrome and, where the frame draws it, of every disc, grown
 * dot (or on its plate) and name drawn before it. Admission holds names apart across a whole zoom
 * step; at rest the frame knows the one scale, so a rim member keeps a name its step ruled out. It
 * runs after every admitted name, so it never takes a place one of them holds. Each member the frame
 * before drew first keeps the side it was going to, where that side still fits; then every row a
 * member drew and no longer draws fades where the names after it see it; then the members whose side
 * no longer fits, and after them the members the frame before left unnamed, take the first side that
 * fits. So no member takes a place another still holds, a member that changes side cross-fades
 * between its own two rows, and two members that want one place hand it over, one fading out before
 * the other fades in, rather than cross-fading over each other while the camera moves.
 * O(unnamed members × fallbacks × (discs + grown dots + names drawn)).
 */
export function planMemberFallbacks(fallbacks: ReadonlyMap<string, readonly PlacedName[]>, alphas: ReadonlyMap<string, number>, chrome: readonly Box[]): void {
  let ids = fallbackIds.get(fallbacks);
  if (!ids) fallbackIds.set(fallbacks, (ids = [...fallbacks.keys()]));
  if (fallbackStates.length < ids.length) fallbackStates = new Uint8Array(ids.length * 2);
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]!;
    const at = screenAt(id);
    if (!at || alphas.get(id) === 0 || namedNow(id)) {
      fallbackStates[i] = FALLBACK_DONE;
      continue;
    }
    const row = rowDrawnLastFrame(id);
    if (row === null) {
      fallbackStates[i] = FALLBACK_NEW;
      continue;
    }
    const sides = fallbacks.get(id)!;
    const drew = sideOf(row.name);
    let kept = false;
    for (let k = 0; k < sides.length && !kept; k += 1) if (sideOf(sides[k]!) === drew) kept = planFallback(sides, k, at, alphas, chrome);
    fallbackStates[i] = kept ? FALLBACK_DONE : FALLBACK_MOVING;
  }
  for (let i = 0; i < ids.length; i += 1) fadeLeftRows(ids[i]!, alphas);
  for (let state = FALLBACK_MOVING; state <= FALLBACK_NEW; state += 1) {
    for (let i = 0; i < ids.length; i += 1) {
      if (fallbackStates[i] !== state) continue;
      const id = ids[i]!;
      const at = screenAt(id)!;
      const sides = fallbacks.get(id)!;
      for (let k = 0; k < sides.length; k += 1) if (planFallback(sides, k, at, alphas, chrome)) break;
    }
  }
}

/** Where a member stands in the fallback pass: named, or about to take a side because its own no longer fits, or because it had none. */
const FALLBACK_DONE = 0;
const FALLBACK_MOVING = 1;
const FALLBACK_NEW = 2;
let fallbackStates = new Uint8Array(0);

/** Each admission's fallback members in order, listed once so a frame walks them without allocating. */
const fallbackIds = new WeakMap<ReadonlyMap<string, readonly PlacedName[]>, readonly string[]>();

/** Whether `row` is a member's capability name the frame before drew with ink. */
function drewLastFrame(row: DrawnName): boolean {
  return row.name.role === "capability" && !row.wasFocus && row.frame === F.frame - 1 && row.alpha > DRAWN_INK;
}

/**
 * The row a member's capability name was drawn in on the frame before, null when none was: the one
 * that frame admitted, the side the member was going to, before one it was leaving. O(rows of the member).
 */
function rowDrawnLastFrame(id: string): DrawnName | null {
  const rows = F.names.names.get(id);
  if (!rows) return null;
  let drawn: DrawnName | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (!drewLastFrame(row)) continue;
    if (row.admitted === F.frame - 1) return row;
    drawn ??= row;
  }
  return drawn;
}

/** Places each row of a member's capability name the frame before drew and this frame does not, fading. O(rows of the member). */
function fadeLeftRows(id: string, alphas: ReadonlyMap<string, number>): void {
  const rows = F.names.names.get(id);
  if (!rows) return;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (drewLastFrame(row) && row.admitted !== F.frame) placeName(row, alphas, 1, true);
  }
}

/** Whether this frame already drew the row of `n`'s side, fading out: a member takes back no side in the frame it leaves it. O(rows of its concept). */
function steppedNow(n: PlacedName): boolean {
  const rows = F.names.names.get(n.id);
  if (!rows) return false;
  const side = sideOf(n);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (row.name.role === n.role && !row.wasFocus && sideOf(row.name) === side) return row.stepped === F.frame;
  }
  return false;
}

/** Plans a member's fallback side `k` where it stands inside the free map and clear of what the frame drew before it. */
function planFallback(sides: readonly PlacedName[], k: number, at: Point, alphas: ReadonlyMap<string, number>, chrome: readonly Box[]): boolean {
  if (steppedNow(sides[k]!) || !memberBlockShows(sides, k, k + 1, chrome)) return false;
  let side = sides[k]!;
  if (onGrownDot(side, at.x, at.y)) {
    let plated = backedSides.get(side);
    if (!plated) backedSides.set(side, (plated = { ...side, backed: true }));
    side = plated;
  }
  if (!nameClear(side, at, at.x, at.y, false)) return false;
  planName(side, alphas, 1, false);
  return true;
}
