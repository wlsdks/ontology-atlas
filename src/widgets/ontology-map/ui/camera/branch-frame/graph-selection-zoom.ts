import type { Box, DialLabels, DialModel } from "../../../dial/types";
import type { GraphAttention } from "../../../flat-graph/attention";
import { graphDiscRadiusPx, zoomGrowth } from "../../../flat-graph/marks";
import { admitNamesAt, selectedDiscRadius, stepScale, zoomStep, type NameAdmission } from "../../../flat-graph/names";
import type { FlatGraphLayout, FlatGraphPaintTokens } from "../../../flat-graph/types";
import type { FramedMark, SelectionZoomIn } from "../../../model/camera/flat-selection-camera";

/** Rounding of a name box edge to canvas pixels. */
const EDGE_PX = 0.5;

export interface GraphSelectionZoomInput {
  model: DialModel;
  layout: FlatGraphLayout;
  paint: FlatGraphPaintTokens;
  attention: GraphAttention;
  labels: DialLabels | null;
  measureText(text: string, font: string): number;
  fontFamily: string;
  elementLabel(id: string): string | null;
  staleByDomain: ReadonlyMap<string, number> | null;
  medianElementPitch: number;
  /** The selection, its domain and the lit concepts inside it: what must read clear. */
  near: ReadonlySet<string>;
  /** What must stay framed, names included, at any zoom taken: `near` itself or a wider lit set. */
  framed: ReadonlySet<string>;
  domainId: string | null;
  /** The scale the map opens at, against which discs grow. */
  entryScale: number;
  maxScale: number;
}

function radiusOf(model: DialModel, paint: FlatGraphPaintTokens, id: string, growth: number): number {
  if (model.domainById.has(id)) return graphDiscRadiusPx("domain", 0, paint, growth);
  const cap = model.capabilityById.get(id);
  return graphDiscRadiusPx(cap || !model.domainOf.has(id) ? "capability" : "element", cap?.elementIds.length ?? 0, paint, growth);
}

function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX - EDGE_PX && b.minX < a.maxX - EDGE_PX && a.minY < b.maxY - EDGE_PX && b.minY < a.maxY - EDGE_PX;
}

function onDisc(b: Box, x: number, y: number, r: number): boolean {
  const nx = Math.min(b.maxX, Math.max(b.minX, x));
  const ny = Math.min(b.maxY, Math.max(b.minY, y));
  return Math.hypot(nx - x, ny - y) < r - EDGE_PX;
}

interface ZoomReading {
  marksAt(scale: number): FramedMark[];
  /** Whether no two names in `near` overlap and none sits on another concept's disc there, counting only pairs that involve `of` unless it is null. */
  namesApart(scale: number, of: string | null): boolean;
  ringClear(scale: number): boolean;
  namedCount(scale: number): number;
}

/** One name admission per zoom step asked, as the frame would admit it there. */
function zoomReading(input: GraphSelectionZoomInput): ZoomReading {
  const { model, layout, paint, attention, near, domainId } = input;
  const focus = attention.focusId!;
  const at = (id: string) => layout.positions.get(id) ?? layout.itemAt.get(id);
  const ringClear = (scale: number) => {
    if (domainId === null || domainId === focus) return true;
    const a = at(focus);
    const b = at(domainId);
    if (!a || !b) return true;
    const growth = zoomGrowth(scale / input.entryScale, paint);
    const ring = selectedDiscRadius(radiusOf(model, paint, focus, growth), paint, growth) + paint.selectedRingGapPx;
    return Math.hypot(a.x - b.x, a.y - b.y) * scale - ring - radiusOf(model, paint, domainId, growth) >= paint.selectedDiscGapPx;
  };
  const admissions = new Map<number, NameAdmission>();
  const admissionAt = (scale: number) => {
    const step = zoomStep(scale, paint.zoomStepsPerOctave);
    let admission = admissions.get(step);
    if (admission) return admission;
    const stepGrowth = zoomGrowth(stepScale(step, paint.zoomStepsPerOctave) / input.entryScale, paint);
    admission = admitNamesAt({
      model, layout, tokens: paint, labels: input.labels, measureText: input.measureText, fontFamily: input.fontFamily, scale, growth: stepGrowth,
      elementLabel: input.elementLabel, staleByDomain: input.staleByDomain, lit: attention.lit, focusId: focus, selected: true,
      named: attention.named, reach: attention.reach, lines: attention.lines, agentFocusId: null, attentionKey: attention.key,
      discRadius: (id) => radiusOf(model, paint, id, stepGrowth), elementSpacingPx: input.medianElementPitch * scale,
    });
    admissions.set(step, admission);
    return admission;
  };
  const discAt = (id: string, scale: number) => {
    const growth = zoomGrowth(scale / input.entryScale, paint);
    const own = radiusOf(model, paint, id, growth);
    return id === focus && !model.domainById.has(id) ? selectedDiscRadius(own, paint, growth) : own;
  };
  const marksAt = (scale: number): FramedMark[] => {
    const admission = admissionAt(scale);
    const marks = new Map<string, FramedMark>();
    for (const id of input.framed) {
      const p = at(id);
      if (!p) continue;
      const r = discAt(id, scale) + (id === focus ? paint.selectedRingGapPx + paint.selectedRingPx : 0);
      marks.set(id, { x: p.x, y: p.y, box: { minX: -r, maxX: r, minY: -r, maxY: r } });
    }
    for (const n of admission.names) {
      const box = marks.get(n.id)?.box;
      if (!box) continue;
      box.minX = Math.min(box.minX, n.box.minX);
      box.maxX = Math.max(box.maxX, n.box.maxX);
      box.minY = Math.min(box.minY, n.box.minY);
      box.maxY = Math.max(box.maxY, n.box.maxY);
    }
    const focusMark = marks.get(focus);
    return focusMark ? [focusMark, ...[...marks.values()].filter((m) => m !== focusMark)] : [...marks.values()];
  };
  const namesApart = (scale: number, of: string | null) => {
    const admission = admissionAt(scale);
    const pad = paint.namePadPx;
    const glyphs = admission.names.filter((n) => near.has(n.id)).map((n) => {
      const p = at(n.id)!;
      return { id: n.id, box: { minX: p.x * scale + n.box.minX + pad, maxX: p.x * scale + n.box.maxX - pad, minY: p.y * scale + n.box.minY + pad, maxY: p.y * scale + n.box.maxY - pad } };
    });
    const weighed = (a: string, b: string) => a !== b && (of === null || a === of || b === of);
    for (let i = 0; i < glyphs.length; i += 1) {
      for (let j = i + 1; j < glyphs.length; j += 1) if (weighed(glyphs[i]!.id, glyphs[j]!.id) && overlaps(glyphs[i]!.box, glyphs[j]!.box)) return false;
    }
    for (const id of near) {
      const p = at(id);
      if (!p) continue;
      const r = discAt(id, scale);
      for (const g of glyphs) if (weighed(g.id, id) && onDisc(g.box, p.x * scale, p.y * scale, r)) return false;
    }
    return true;
  };
  const namedCount = (scale: number) => {
    const ids = admissionAt(scale).ids;
    let count = 0;
    for (const id of near) if (ids.has(id)) count += 1;
    return count;
  };
  return { marksAt, namesApart, ringClear, namedCount };
}

/**
 * How well a zoom reads a capability's selection, in order: no two names in `near` overlap or sit
 * on one of its discs; the selection's ring keeps `selectedDiscGapPx` from its domain disc; how
 * many of `near` are named. It reads clear once the first two hold. And what `framed` covers
 * there, each name on the side it takes.
 */
export function graphSelectionZoom(input: GraphSelectionZoomInput): SelectionZoomIn {
  const reading = zoomReading(input);
  const scoreAt = (scale: number) => [reading.namesApart(scale, null) ? 1 : 0, reading.ringClear(scale) ? 1 : 0, reading.namedCount(scale)];
  const readsAt = (scale: number) => reading.namesApart(scale, null) && reading.ringClear(scale);
  return { maxScale: input.maxScale, readsAt, scoreAt, marksAt: reading.marksAt };
}

/**
 * An element's selection reads once its own name is apart from the names and discs in `near`, and
 * nothing else earns zoom: an element's picture is its lines, so the frame zooms in no further
 * than that separation needs and only while every far end in `framed` still fits.
 */
export function elementSelectionZoom(input: GraphSelectionZoomInput): SelectionZoomIn {
  const reading = zoomReading(input);
  const focus = input.attention.focusId!;
  const readsAt = (scale: number) => reading.namesApart(scale, focus);
  const scoreAt = (scale: number) => [readsAt(scale) ? 1 : 0];
  return { maxScale: input.maxScale, readsAt, scoreAt, marksAt: reading.marksAt };
}
