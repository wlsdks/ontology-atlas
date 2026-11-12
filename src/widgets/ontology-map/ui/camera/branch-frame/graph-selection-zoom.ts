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

/**
 * Whether a zoom reads a selection clear: every concept in `near` is named, no two of those names
 * overlap or sit on one of their discs, and the selection's ring keeps `selectedDiscGapPx` from its
 * domain disc; and what `near` covers there, each name on the side it takes. One name admission
 * per zoom step asked, as the frame would admit it there.
 */
export function graphSelectionZoom(input: GraphSelectionZoomInput): SelectionZoomIn {
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
    for (const id of near) {
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
  const namesClear = (scale: number) => {
    const admission = admissionAt(scale);
    for (const id of near) if (!admission.ids.has(id)) return false;
    const pad = paint.namePadPx;
    const glyphs = admission.names.filter((n) => near.has(n.id)).map((n) => {
      const p = at(n.id)!;
      return { id: n.id, box: { minX: p.x * scale + n.box.minX + pad, maxX: p.x * scale + n.box.maxX - pad, minY: p.y * scale + n.box.minY + pad, maxY: p.y * scale + n.box.maxY - pad } };
    });
    for (let i = 0; i < glyphs.length; i += 1) {
      for (let j = i + 1; j < glyphs.length; j += 1) if (glyphs[i]!.id !== glyphs[j]!.id && overlaps(glyphs[i]!.box, glyphs[j]!.box)) return false;
    }
    for (const id of near) {
      const p = at(id);
      if (!p) continue;
      const r = discAt(id, scale);
      for (const g of glyphs) if (g.id !== id && onDisc(g.box, p.x * scale, p.y * scale, r)) return false;
    }
    return true;
  };
  return { maxScale: input.maxScale, clearAt: (scale) => ringClear(scale) && namesClear(scale), marksAt };
}
