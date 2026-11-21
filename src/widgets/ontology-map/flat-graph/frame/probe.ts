import { emptyDialFrameMarks, type DialFrameMarks } from "../../dial/frame/marks";
import type { GlyphMark, StripMark, TextMark } from "../../dial/dial-shapes";
import { sunk } from "../marks";
import type { FlatGraphTokens } from "../flat-graph-shapes";
import { sideOf } from "./name-plan";
import { grownIds } from "./place";
import { type Disc, type Arc, LINE_KINDS, REST_ARC, markPool, FrameList, setBox, type FramePlan } from "./state";

export const pool = emptyDialFrameMarks();
type DiscProbe = DialFrameMarks["discs"][number];
const probeDiscs = markPool<DiscProbe>(() => ({ id: "", x: 0, y: 0, r: 0, fill: 0, rim: 0, dashed: false, lineWidth: 0 }));
const probeStrips = markPool<StripMark>(() => ({ flowKey: "", role: "chord", ink: 0, ax: 0, ay: 0, cx: 0, cy: 0, bx: 0, by: 0, w0: 0, w1: 0, gapT0: 0, gapT1: 0, dashed: false, headStart: false, headEnd: true, headSize: 0 }));
const probeTexts = markPool<TextMark>(() => ({ id: "", role: "domain", text: "", x: 0, y: 0, align: "center", font: "", ink: 0, box: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, parts: null, backed: false, alpha: 1, room: 1, fading: false, side: 0 }));
const probeGlyphs = markPool<GlyphMark>(() => ({ id: "", kind: "element", x: 0, y: 0, r: 0, egoState: "normal", fill: null, stroke: null, hovered: false, agentFocus: false, selectionPulse: null, count: null, stalePip: false, grown: false }));
const probeInks = new FrameList(pool.inks);
const probeDiscList = new FrameList(pool.discs);
const probeStripList = new FrameList(pool.strips);
const probeTextList = new FrameList(pool.texts);
const probeGlyphList = new FrameList(pool.glyphs);
const UNUSED_PROBE_LISTS = [pool.squares, pool.ticks, pool.rails, pool.numerals, pool.leaders, pool.plates, pool.extraTexts];
const arcKeys: string[] = [];

function inkIndex(ink: string): number {
  const at = probeInks.indexOf(ink);
  if (at >= 0) return at;
  probeInks.add(ink);
  return probeInks.size - 1;
}

function probeDisc(d: Disc, fill: number, ground: string, tokens: FlatGraphTokens): void {
  const lineWidth = tokens.paint.capRimPx;
  const mark = probeDiscs.take();
  mark.id = d.id;
  if (mark.x !== d.x) mark.x = d.x;
  if (mark.y !== d.y) mark.y = d.y;
  if (mark.r !== d.r) mark.r = d.r;
  mark.fill = fill;
  mark.rim = inkIndex(sunk(d.hue, ground, d.ink));
  mark.dashed = d.state === "unknown";
  if (mark.lineWidth !== lineWidth) mark.lineWidth = lineWidth;
  probeDiscList.add(mark);
}

/** A resting arc or focus line as the probe's strip; a focus line's key is `kind:from>to`, a taper's end width 0. */
function probeStrip(arc: Arc, key: string, ink: number, headSize: number): void {
  const { path, width } = arc;
  const kind = arc.kind === REST_ARC ? null : LINE_KINDS[arc.kind - 1];
  const end = kind === "needs" || kind === "neededBy" ? 0 : width;
  const strip = probeStrips.take();
  strip.flowKey = key;
  strip.role = kind === "relates" ? "relates" : "chord";
  strip.dashed = kind === "relates";
  strip.headEnd = kind === null;
  strip.ink = ink;
  if (strip.ax !== path.a.x) strip.ax = path.a.x;
  if (strip.ay !== path.a.y) strip.ay = path.a.y;
  if (strip.cx !== path.c.x) strip.cx = path.c.x;
  if (strip.cy !== path.c.y) strip.cy = path.c.y;
  if (strip.bx !== path.b.x) strip.bx = path.b.x;
  if (strip.by !== path.b.y) strip.by = path.b.y;
  if (strip.w0 !== width) strip.w0 = width;
  if (strip.w1 !== end) strip.w1 = end;
  if (strip.headSize !== headSize) strip.headSize = headSize;
  probeStripList.add(strip);
}

/** Records the painted inks, sinking included, so the probe sees what the eye sees. */
export function fillProbeMarks(plan: FramePlan, tokens: FlatGraphTokens, ground: string): void {
  for (let listIndex = 0; listIndex < UNUSED_PROBE_LISTS.length; listIndex += 1) {
    const list = UNUSED_PROBE_LISTS[listIndex]!;
    if (list.length !== 0) list.length = 0;
  }
  probeInks.restart();
  probeDiscList.restart();
  probeStripList.restart();
  probeTextList.restart();
  probeGlyphList.restart();
  probeGlyphs.reset();
  probeDiscs.reset();
  probeStrips.reset();
  probeTexts.reset();
  const fill = inkIndex(tokens.inks.discFill);
  for (let dIndex = 0; dIndex < plan.discs.length; dIndex += 1) {
    const d = plan.discs[dIndex]!;
    probeDisc(d, fill, ground, tokens);
  }
  for (let dIndex = 0; dIndex < plan.domains.length; dIndex += 1) {
    const d = plan.domains[dIndex]!;
    probeDisc(d, fill, ground, tokens);
  }
  // An element's dot is the probe's glyph: its drawn centre and radius.
  for (let dIndex = 0; dIndex < plan.dots.length; dIndex += 1) {
    const d = plan.dots[dIndex]!;
    const glyph = probeGlyphs.take();
    glyph.id = d.id;
    if (glyph.x !== d.x) glyph.x = d.x;
    if (glyph.y !== d.y) glyph.y = d.y;
    if (glyph.r !== d.r) glyph.r = d.r;
    glyph.grown = grownIds.has(d.id);
    probeGlyphList.add(glyph);
  }
  const arcInk = inkIndex(tokens.inks.arc);
  const reachInk = inkIndex(tokens.inks.reach);
  for (let i = 0; i < plan.arcs.length; i += 1) probeStrip(plan.arcs[i]!, (arcKeys[i] ??= `arc:${i}`), arcInk, tokens.paint.arcHeadPx);
  for (let i = 0; i < plan.focusArcs.length; i += 1) {
    const arc = plan.focusArcs[i]!;
    probeStrip(arc, arc.key, LINE_KINDS[arc.kind - 1] === "neededBy" ? reachInk : arcInk, 0);
  }
  const pad = tokens.paint.namePadPx;
  for (let nIndex = 0; nIndex < plan.names.length; nIndex += 1) {
    const n = plan.names[nIndex]!;
    const ox = n.x - n.name.dx;
    const oy = n.y - n.name.dy;
    const text = probeTexts.take();
    text.id = n.name.id; text.role = n.name.role === "reach" ? "status" : n.name.role; text.text = n.name.text; text.align = n.name.align; text.font = n.name.font;
    if (text.x !== n.x) text.x = n.x;
    if (text.y !== n.y) text.y = n.y;
    text.ink = inkIndex(sunk(n.color, ground, n.ink));
    text.backed = n.backed;
    text.fading = n.fading;
    text.side = sideOf(n.name);
    if (text.alpha !== n.ink) text.alpha = n.ink;
    if (text.room !== n.room) text.room = n.room;
    setBox(text.box, ox + n.name.box.minX + pad, ox + n.name.box.maxX - pad, oy + n.name.box.minY + pad, oy + n.name.box.maxY - pad);
    probeTextList.add(text);
  }
  probeInks.seal();
  probeDiscList.seal();
  probeStripList.seal();
  probeTextList.seal();
  probeGlyphList.seal();
}
