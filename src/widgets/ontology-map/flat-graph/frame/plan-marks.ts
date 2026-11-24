import type { DialChordLight, Point } from "../../dial/dial-shapes";
import { FLAT_LINE_BITS } from "../attention";
import { directItemId } from "../layout";
import { arcPathInto, graphDiscRadiusPx, litLineTrimsInto, smoothstep } from "../marks";
import type { GraphMotion } from "../motion";
import type { FlatGraphCluster, FlatGraphItem } from "../flat-graph-shapes";
import { addExitTag, exitShare, exitWholeShare } from "./exit-tags";
import { hueOf, loadMarkInk, ownerInkShare, ownerStepBack, loadGlowShare, screenOf, fanShare, alongSpoke, screenAt, onScreen, discRadius, dotRadius, segmentOnScreen, lensHidden } from "./place";
import { crowdClear } from "./push-crowd";
import { DRAWN_INK, ROOM_GONE_PX, ROOM_WHOLE_PX, type Disc, type Segment, type Arc, LINE_KINDS, type Light, segments, dots, discs, glows, lights, arcMarks, chordPool, alphaCache, frameChords, shownElements, cacheFor, L, F as frameState, movedRoom, scratch } from "./state";

// A module-local name: see `F` in ./state.
const F = frameState;

const FOCUS_GLOW_ALPHA = 0.4;

const DOT_ALPHA = 0.7;

export function disc(id: string, at: Point, r: number, hue: string, ink: number, focus: boolean, state: Disc["state"]): Disc {
  const d = discs.take();
  d.id = id;
  if (d.x !== at.x) d.x = at.x;
  if (d.y !== at.y) d.y = at.y;
  if (d.r !== r) d.r = r;
  d.hue = hue;
  if (d.ink !== ink) d.ink = ink;
  d.focus = focus;
  d.state = state;
  if (d.hollow !== 0) d.hollow = 0;
  return d;
}

export function light(x: number, y: number, r: number, ink: string, alpha: number): Light {
  const l = lights.take();
  if (l.x !== x) l.x = x;
  if (l.y !== y) l.y = y;
  if (l.r !== r) l.r = r;
  l.ink = ink;
  if (l.alpha !== alpha) l.alpha = alpha;
  return l;
}

export function arcMark(from: Point, to: Point, bow: number, trimStart: number, trimEnd: number, width: number, alpha: number, head: boolean, glowAlpha: number, kind: number): Arc | null {
  const arc = arcMarks.take();
  if (!arcPathInto(arc.path, from, to, bow, trimStart, trimEnd)) return null;
  if (arc.width !== width) arc.width = width;
  if (arc.alpha !== alpha) arc.alpha = alpha;
  arc.head = head;
  if (arc.glow !== glowAlpha) arc.glow = glowAlpha;
  if (arc.kind !== kind) arc.kind = kind;
  arc.key = "";
  if (arc.reach !== 1) arc.reach = 1;
  if (arc.fadeStart !== 0) arc.fadeStart = 0;
  if (arc.fadeEnd !== 0) arc.fadeEnd = 0;
  return arc;
}

const expandedItems = new Set<string>();

/** The share of its full radius a capability disc is drawn at, 1 for a disc no crowd shrank. */
function crowdKept(d: Disc): number {
  const full = graphDiscRadiusPx("capability", F.model.capabilityById.get(d.id)?.elementIds.length ?? 0, F.P, F.growth);
  return Math.min(1, d.r / full);
}

/** A glow under one disc of the hovered or selected set, no wider for a crowd-shrunk disc than its size carries; the rest picture draws none. */
export function addGlow(d: Disc, isProject: boolean): void {
  const { P, growth } = F;
  if (isProject) scratch[0] = F.projectShare;
  else loadGlowShare(d.id);
  // A domain's glow goes out while a concept of its own is selected, so the light gathers on the selection.
  const share = scratch[0]! * (!isProject && F.model.domainById.has(d.id) ? 1 - ownerStepBack(d.id) : 1);
  if (share <= DRAWN_INK) return;
  const halo = isProject ? P.projectGlowPx * growth : F.model.domainById.has(d.id) ? P.domainGlowPx * growth : d.r + P.capGlowPx * growth * crowdKept(d);
  const focusGain = d.focus ? FOCUS_GLOW_ALPHA / P.glowAlpha : 1;
  const alpha = Math.min(1, P.glowAlpha * focusGain) * d.ink * d.ink * share;
  const g = glows.take();
  if (g.x !== d.x) g.x = d.x;
  if (g.y !== d.y) g.y = d.y;
  if (g.r !== halo) g.r = halo;
  g.ink = d.hue;
  if (g.alpha !== alpha) g.alpha = alpha;
  L.glows.add(g);
}

function segmentBetween(a: Point, b: Point, ink: string, toElement: boolean): Segment {
  const s = segments.take();
  if (s.x0 !== a.x) s.x0 = a.x;
  if (s.y0 !== a.y) s.y0 = a.y;
  if (s.x1 !== b.x) s.x1 = b.x;
  if (s.y1 !== b.y) s.y1 = b.y;
  s.ink = ink;
  s.toElement = toElement;
  s.spoke = false;
  return s;
}

export function discAt(id: string, at: Point, hue: string, focus: boolean, state: Disc["state"]): Disc {
  const d = discs.take();
  d.id = id;
  if (d.x !== at.x) d.x = at.x;
  if (d.y !== at.y) d.y = at.y;
  d.hue = hue;
  d.focus = focus;
  d.state = state;
  if (d.hollow !== 0) d.hollow = 0;
  return d;
}

/** One domain's disc, its capability discs and links, and any element fan that draws. O(members). */
export function planCluster(c: FlatGraphCluster, projectAt: Point | null, projectInk: number): void {
  const { P, attention, contextMode } = F;
  const alphas = cacheFor(alphaCache, F.layout);
  const hue = hueOf(c.domainId);
  const at = screenOf(c.domainId);
  const domainHidden = lensHidden(c.domainId);
  alphas.set(c.domainId, domainHidden ? 0 : 1);
  loadMarkInk(c.domainId);
  const ink = scratch[0]!;
  if (projectAt && !contextMode && F.projectShare > DRAWN_INK && segmentOnScreen(projectAt, at)) {
    const s = segmentBetween(projectAt, at, F.tokens.inks.project, false);
    const alpha = P.linkDomainAlpha * F.projectShare * Math.min(ink, projectInk);
    if (s.alpha !== alpha) s.alpha = alpha;
    L.segments.add(s);
  }
  if (!domainHidden && onScreen(at)) {
    const d = discAt(c.domainId, at, hue, c.domainId === attention.focusId, "current");
    const r = discRadius(c.domainId);
    if (d.r !== r) d.r = r;
    const discInk = ink * ownerInkShare(c.domainId);
    // While a concept of its own is selected the domain gives up its fill, keeping its size, so its weight steps back.
    const hollow = ownerStepBack(c.domainId);
    if (d.hollow !== hollow) d.hollow = hollow;
    if (d.ink !== discInk) d.ink = discInk;
    L.domains.add(d);
  }
  const evidence = F.evidence;
  // A hollow domain's member links start at its rim, so they never meet in the empty disc.
  const rimShare = ownerStepBack(c.domainId);
  const rimPx = rimShare > 0 ? discRadius(c.domainId) * rimShare : 0;
  for (let i = 0; i < c.items.length; i += 1) {
    const it = c.items[i]!;
    if (it.direct) {
      if (F.dotAlpha > DRAWN_INK || expandedItems.has(it.id)) planElements(it, at, hue);
      continue;
    }
    const itemAt = screenOf(it.id);
    loadMarkInk(it.id);
    const itemInk = scratch[0]!;
    const itemHidden = lensHidden(it.id);
    alphas.set(it.id, itemHidden ? 0 : 1);
    if (!contextMode && segmentOnScreen(at, itemAt)) {
      const s = segmentBetween(at, itemAt, hue, false);
      const apart = Math.hypot(itemAt.x - at.x, itemAt.y - at.y);
      if (rimPx > 0 && apart > rimPx) {
        s.x0 = at.x + ((itemAt.x - at.x) / apart) * rimPx;
        s.y0 = at.y + ((itemAt.y - at.y) / apart) * rimPx;
      }
      const alpha = P.linkCapAlpha * Math.min(ink, itemInk);
      if (s.alpha !== alpha) s.alpha = alpha;
      L.segments.add(s);
    }
    if (!itemHidden && onScreen(itemAt)) {
      const d = discAt(it.id, itemAt, hue, it.id === attention.focusId, evidence !== null ? evidence.stateOf(it.id) : "current");
      const r = discRadius(it.id);
      if (d.r !== r) d.r = r;
      if (d.ink !== itemInk) d.ink = itemInk;
      L.discs.add(d);
    }
    if (F.dotAlpha > DRAWN_INK || expandedItems.has(it.id)) planElements(it, itemAt, hue);
  }
}

/** The items whose element fans draw although dots are hidden: lit, required or the agent's. O(lit). */
export function markExpandedItems(lit: ReadonlySet<string> | null, required: ReadonlySet<string>, agentId: string | null): void {
  expandedItems.clear();
  const model = F.model;
  const add = (id: string) => {
    const owner = model.capabilityOf.get(id);
    if (owner !== undefined) expandedItems.add(owner);
    else if (!model.capabilityById.has(id) && !model.domainById.has(id)) {
      const domain = model.domainOf.get(id);
      if (domain) expandedItems.add(directItemId(domain));
    }
  };
  if (lit) for (const id of lit) add(id);
  for (const id of required) add(id);
  if (agentId) add(agentId);
}

function planElements(it: FlatGraphItem, itemAt: Point, hue: string): void {
  const { P, input, attention, contextMode } = F;
  const alphas = cacheFor(alphaCache, F.layout);
  loadMarkInk(it.direct ? it.domainId : it.id);
  const itemInk = scratch[0]!;
  const itemR = it.direct ? 0 : discRadius(it.id);
  for (let i = 0; i < it.elementIds.length; i += 1) {
    const elementId = it.elementIds[i]!;
    const lit = attention.lit?.has(elementId) === true;
    const uncovered = lensHidden(elementId) ? 0 : Math.max(F.dotAlpha, lit ? F.focusness : 0, fanShare(elementId), F.required.has(elementId) || elementId === input.agentFocusNodeId ? 1 : 0);
    if (uncovered <= DRAWN_INK) continue;
    const elementAt = screenOf(elementId);
    const visible = onScreen(elementAt);
    // A dot off screen keeps no radius, so it neither steps nor keeps the loop awake.
    const r = visible ? dotRadius(elementId) : 0;
    // Only a disc larger than the dot covers it, and never the selection's own, which its ring marks.
    const coverR = !visible || elementId === F.selectedId || elementId === F.leavingId ? 0 : itemR;
    let clear = coverR > r ? Math.hypot(elementAt.x - itemAt.x, elementAt.y - itemAt.y) - coverR - r : ROOM_WHOLE_PX;
    if (visible && elementId !== F.selectedId && elementId !== F.leavingId && movedRoom(elementId) !== undefined) clear = Math.min(clear, crowdClear(elementId, r, elementAt));
    const shown = uncovered * smoothstep(ROOM_GONE_PX, ROOM_WHOLE_PX, clear);
    if (shown <= DRAWN_INK) continue;
    alphas.set(elementId, 1);
    shownElements.add(elementId);
    loadMarkInk(elementId);
    const elementInk = scratch[0]!;
    if (!contextMode && segmentOnScreen(itemAt, elementAt)) {
      const fanned = fanShare(elementId);
      const s = segmentBetween(itemAt, elementAt, hue, true);
      s.spoke = fanned > 0;
      if (s.spoke) {
        // A spoke starts outside the selection ring, so the ring stays one unbroken circle.
        const length = Math.hypot(elementAt.x - itemAt.x, elementAt.y - itemAt.y) || 1;
        const start = Math.min(1, ((itemR + P.selectedRingGapPx + P.selectedRingPx) * fanned) / length);
        s.x0 = itemAt.x + (elementAt.x - itemAt.x) * start;
        s.y0 = itemAt.y + (elementAt.y - itemAt.y) * start;
        // And it stops at the dot's rim, so the dot reads whole.
        const end = Math.max(start, 1 - (r * fanned) / length);
        s.x1 = itemAt.x + (elementAt.x - itemAt.x) * end;
        s.y1 = itemAt.y + (elementAt.y - itemAt.y) * end;
      }
      const alpha = (P.linkElementAlpha + (P.fanSpokeAlpha - P.linkElementAlpha) * fanned) * Math.min(itemInk, elementInk) * shown;
      if (s.alpha !== alpha) s.alpha = alpha;
      L.segments.add(s);
    }
    if (visible) {
      const d = dots.take();
      const alpha = DOT_ALPHA * shown;
      d.id = elementId;
      if (d.x !== elementAt.x) d.x = elementAt.x;
      if (d.y !== elementAt.y) d.y = elementAt.y;
      if (d.r !== r) d.r = r;
      d.hue = hue;
      if (d.ink !== elementInk) d.ink = elementInk;
      if (d.alpha !== alpha) d.alpha = alpha;
      d.lit = lit;
      L.dots.add(d);
    }
  }
}

const LINE_TRIMS = new Float64Array(2);

/**
 * The focus's relations as kinded lines, each drawn `reach` of the way from its source end; a
 * taper's point stops short of the disc it reaches. A selection's fully drawn lines also become the
 * light layer's chords.
 */
export function focusLinks(motion: GraphMotion): void {
  const P = F.P;
  // A selection the map opened with (a deep link, a rebuilt world) changed nothing here, so it does not light.
  const chorded = motion.current.selected && motion.settled && Number.isFinite(motion.changedAt) && !F.input.reducedMotion;
  const devicePxPerCss = F.W > 0 ? F.input.ctx.canvas.width / F.W : 1;
  for (let lineIndex = 0; lineIndex < motion.drawnCount; lineIndex += 1) {
    const { line, reach, current } = motion.drawn[lineIndex]!;
    if (reach <= DRAWN_INK) continue;
    const a = screenAt(line.from);
    const b = screenAt(line.to);
    if (!a || !b) continue;
    const kind = LINE_KINDS.indexOf(line.kind) + 1;
    const tapered = line.kind === "needs" || line.kind === "neededBy";
    const betweenDomains = F.model.domainById.has(line.from) && F.model.domainById.has(line.to);
    litLineTrimsInto(LINE_TRIMS, F.layout, line, Math.hypot(b.x - a.x, b.y - a.y), F.scale, F.growth, discRadius(line.from), discRadius(line.to), P);
    // A line to a fanned element is a fan's length long: a taper that short reads as a blot, so it draws as a hair.
    const withinFan = fanShare(line.from) > 0 || fanShare(line.to) > 0;
    const width = tapered && !withinFan ? Math.min(P.lineTaperMaxPx, P.lineTaperPx + P.lineTaperGainPx * (line.weight - 1)) : line.kind === "relates" ? P.lineDotPx : P.lineHairPx;
    // A relation between a capability and its own fanned element runs straight along that element's spoke, from outside the ring.
    const spoke = alongSpoke(line.from, line.to);
    const ring = spoke ? P.selectedRingGapPx + P.selectedRingPx : 0;
    const ownsFrom = spoke && F.model.capabilityById.has(line.from) && fanShare(line.to) > 0;
    const mark = arcMark(a, b, spoke ? 0 : P.lineBow, LINE_TRIMS[0]! + (ownsFrom ? ring : 0), LINE_TRIMS[1]! + (spoke && !ownsFrom ? ring : 0), width, P.lineAlpha, false, 0, kind);
    if (!mark) continue;
    const { a: start, b: end } = mark.path;
    if (reach * Math.hypot(end.x - start.x, end.y - start.y) * devicePxPerCss < 1) continue;
    mark.key = line.key;
    if (mark.reach !== reach) mark.reach = reach;
    if (betweenDomains) {
      // The end outside the member star fades in, so the line emerges from the cluster's light.
      const fade = Math.min(0.5, P.lineFadePx / (Math.hypot(end.x - start.x, end.y - start.y) || 1));
      if (line.kind === "needs") mark.fadeStart = fade;
      else mark.fadeEnd = fade;
    }
    // A line that runs under a panel or off the canvas names where it goes at the edge it leaves by, and ends there.
    const focusId = F.attention.focusId;
    const fromFocus = line.from === focusId;
    const inside = focusId !== null && (fromFocus || line.to === focusId) ? exitShare(mark.path, fromFocus, fromFocus ? b : a, discRadius(fromFocus ? line.to : line.from)) : -1;
    if (current && focusId !== null) addExitTag(mark.path, line.from, line.to, focusId, line.kind === "neededBy" ? F.tokens.inks.reach : F.tokens.inks.arc, reach, inside);
    if (inside > 0) endAtEdge(mark, fromFocus ? 0 : 1 - inside, fromFocus ? inside : 1, fromFocus);
    L.focusArcs.add(mark);
    if (current) F.lineKinds |= FLAT_LINE_BITS[line.kind] | (betweenDomains ? FLAT_LINE_BITS.domains : 0);
    if (chorded && current) frameChords.add(chordOf(mark, line.kind === "relates"));
  }
}

/**
 * Cuts `arc` to the part of its curve between `t0` and `t1` and fades it out toward the cut, the end
 * away from the selection when `cutAtEnd`. O(1).
 */
function endAtEdge(arc: Arc, t0: number, t1: number, cutAtEnd: boolean): void {
  const { a, c, b } = arc.path;
  const u0 = 1 - t0;
  const u1 = 1 - t1;
  const mid = t0 * u1 + u0 * t1;
  const cx = u0 * u1 * a.x + mid * c.x + t0 * t1 * b.x;
  const cy = u0 * u1 * a.y + mid * c.y + t0 * t1 * b.y;
  const ax = u0 * u0 * a.x + 2 * u0 * t0 * c.x + t0 * t0 * b.x;
  const ay = u0 * u0 * a.y + 2 * u0 * t0 * c.y + t0 * t0 * b.y;
  const bx = u1 * u1 * a.x + 2 * u1 * t1 * c.x + t1 * t1 * b.x;
  const by = u1 * u1 * a.y + 2 * u1 * t1 * c.y + t1 * t1 * b.y;
  a.x = ax;
  a.y = ay;
  c.x = cx;
  c.y = cy;
  b.x = bx;
  b.y = by;
  const fade = Math.min(0.5, F.P.lineFadePx / (Math.hypot(bx - ax, by - ay) || 1)) * exitWholeShare();
  if (cutAtEnd) arc.fadeEnd = Math.max(arc.fadeEnd, fade);
  else arc.fadeStart = Math.max(arc.fadeStart, fade);
}

/** A chord runs the way impact travels: from what is needed, or the broader concept, toward what rests on it. */
function chordOf(arc: Arc, symmetric: boolean): DialChordLight {
  const chord = chordPool.take();
  const { a, c, b } = arc.path;
  const start = symmetric ? a : b;
  const end = symmetric ? b : a;
  chord.key = arc.key;
  if (chord.a.x !== start.x) chord.a.x = start.x;
  if (chord.a.y !== start.y) chord.a.y = start.y;
  if (chord.c.x !== c.x) chord.c.x = c.x;
  if (chord.c.y !== c.y) chord.c.y = c.y;
  if (chord.b.x !== end.x) chord.b.x = end.x;
  if (chord.b.y !== end.y) chord.b.y = end.y;
  if (chord.widthPx !== arc.width) chord.widthPx = arc.width;
  return chord;
}
