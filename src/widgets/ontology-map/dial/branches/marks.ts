import { scaledLabelFont, scaledLabelFontSize } from "../../render/labels";
import { buildFlowMarks } from "../flow-marks";
import { crossfadeInk, inkIndex, mixOver } from "../ink";
import { smoothstep } from "../frame/disclosure";
import type { DialFrameMarks, DialMarksInput, DialMarksResult } from "../frame/marks";
import type { Box, DialAttention, DialKind, GlyphMark, Point, TextMark } from "../types";
import { branchPreviewRows, BRANCH_ROW_PITCH } from "./layout";
import { capabilityNameTries, overlaps } from "../label-marks";
import { branchNameLines, branchTextStyle } from "./text";

export interface BranchBlock { id: string; box: Box; fill: number; rim: number; alpha: number }
export interface BranchStem { a: Point; c: Point; b: Point; ink: number }

export function buildBranchMarks(input: DialMarksInput, out: DialFrameMarks): DialMarksResult {
  const { model, scene, tokens, inks, mapTokens: map, disclosure } = input;
  const previewRows = branchPreviewRows(scene.clusters.length);
  const alphas = new Map<string, number>();
  const picks: DialMarksResult["picks"] = [];
  const rows: DialMarksResult["rows"] = [];
  const chords: DialMarksResult["chords"] = [];
  const blocks = out.blocks ??= [];
  const stems = out.stems ??= [];
  const boxes = new Map<string, Box>();
  const radii = new Map<string, number>();
  const nameBoxes = new Map<string, Box>();
  const partners = new Set([...input.attention.needsCaps, ...input.attention.usedByCaps, ...input.attention.relatesCaps]);
  const ink = (color: string) => inkIndex(out, color);
  const position = (id: string, p: Point) => input.nodeScreen(id) ?? input.toScreen(p.x, p.y);
  const visible = (p: Point, room: number) => p.x + room >= 0 && p.x - room <= input.viewportWidth && p.y + room >= 0 && p.y - room <= input.viewportHeight;
  const colorFor = (a: DialAttention | null, id: string, kind: DialKind, rest: string): string => {
    if (input.contextAlphas) return mixOver(rest, inks.bg, input.contextAlphas.get(id) ?? map.egoRestAlpha);
    if (!a?.domainId) return rest;
    const domain = model.domainOf.get(id);
    const own = a.domainId === id || (domain === a.domainId && (a.capabilityId === null || a.capabilityId === id));
    const partner = a.needsCaps.has(id) || a.usedByCaps.has(id) || a.relatesCaps.has(id);
    if (own || partner) return rest;
    if (kind === "domain" && a.partnerDomains.has(id)) return rest;
    return mixOver(rest, inks.bg, map.egoRestAlpha);
  };
  const color = (id: string, kind: DialKind, rest: string) => crossfadeInk(
    colorFor(input.previous ?? input.inkAttention, id, kind, rest),
    colorFor(input.inkAttention, id, kind, rest), input.inkMix,
  );
  const text = (id: string, role: TextMark["role"], value: string, p: Point, align: CanvasTextAlign, kind: DialKind, tint: string, presence = 1) => {
    const { font, height } = branchTextStyle(role, kind, tokens.labelScale);
    const lines = role === "capability" ? branchNameLines(value, font, tokens.nameMaxPx, input.measureText) : [value];
    const width = Math.max(...lines.map((line) => input.measureText(line, font)));
    const textHeight = height * lines.length;
    const left = align === "right" ? p.x - width : align === "center" ? p.x - width / 2 : p.x;
    const box = { minX: left - 2, maxX: left + width + 2, minY: p.y - textHeight / 2 - 2, maxY: p.y + textHeight / 2 + 2 };
    const domain = model.domainById.has(id) ? id : model.domainOf.get(id);
    const arrival = domain ? smoothstep(tokens.chordArrival, 1, input.appearOf(domain)) : 1;
    out.texts.push({ id, role, text: lines.join(" "), lines: lines.length > 1 ? lines : undefined, lineHeight: height, ...p, align, font, ink: ink(mixOver(tint, inks.bg, arrival * presence)), box, parts: null });
    if (role !== "units" && role !== "more" && role !== "status") nameBoxes.set(id, box);
    return box;
  };
  const glyph = (id: string, kind: DialKind, p: Point, r: number, stroke: string, fill: string, stalePip = false) => {
    const g: GlyphMark = {
      id, kind, ...p, r, stroke, fill,
      egoState: "normal",
      count: null, stalePip,
      hovered: false, agentFocus: input.agentFocusNodeId === id,
      selectionPulse: null,
    };
    out.glyphs.push(g);
    const alpha = input.contextAlphas?.get(id) ?? 1;
    if (alpha >= 0.05) picks.push({ id, ...p, r });
    alphas.set(id, alpha);
  };
  const rowPx = tokens.pitch * BRANCH_ROW_PITCH * input.scale;
  const detail = smoothstep(tokens.ledgerGapPx, tokens.ledgerGapPx + tokens.chipMinPx, rowPx);
  const namesVisible = detail > 0.01;
  const capAlpha = disclosure.capAlpha;
  for (const cluster of scene.clusters) {
    const id = cluster.domainId;
    const domain = model.domainById.get(id)!;
    const p = position(id, cluster.chip);
    if (!visible(p, cluster.footprint * input.scale + tokens.nameMaxPx)) continue;
    const appear = input.appearOf(id);
    if (appear <= 0) continue;
    const arrival = smoothstep(tokens.chordArrival, 1, appear);
    if (arrival <= 0) {
      glyph(id, "domain", p, tokens.chipMinPx * appear, inks.domainRim, inks.domainFill);
      continue;
    }
    const titleWidth = input.measureText(domain.label, scaledLabelFont("project", tokens.labelScale));
    const units = input.labels?.units(domain.capabilityIds.length, domain.elementCount) ?? "";
    const unitsWidth = input.measureText(units, scaledLabelFont("capability", tokens.labelScale));
    const width = Math.max(tokens.nameMaxPx + tokens.ledgerGapPx, titleWidth + tokens.ledgerGapPx * 2, unitsWidth + tokens.ledgerGapPx * 2);
    const halfHeight = tokens.ledgerGapPx + tokens.chipMinPx;
    const box = { minX: p.x - width / 2, maxX: p.x + width / 2, minY: p.y - halfHeight, maxY: p.y + halfHeight };
    const halfWidth = tokens.chipMinPx + (width / 2 - tokens.chipMinPx) * detail;
    const portHeight = tokens.chipMinPx + (halfHeight - tokens.chipMinPx) * detail;
    boxes.set(id, { minX: p.x - halfWidth, maxX: p.x + halfWidth, minY: p.y - portHeight, maxY: p.y + portHeight });
    if (namesVisible) {
      const before = input.previous ?? input.inkAttention;
      const fill = (a: DialAttention | null) => mixOver(inks.domainFill, inks.bg, a?.domainId === id ? 1 : 0.5);
      const rim = (a: DialAttention | null) => a?.domainId === id ? inks.domainLabelAttended : colorFor(a, id, "domain", inks.domainRim);
      blocks.push({ id, box, fill: ink(crossfadeInk(fill(before), fill(input.inkAttention), input.inkMix)), rim: ink(crossfadeInk(rim(before), rim(input.inkAttention), input.inkMix)), alpha: arrival * detail });
      if (detail > 0.5) rows.push({ id, box });
    }
    radii.set(id, portHeight);
    const marker = { x: p.x + (box.minX + tokens.ledgerGapPx * 0.7 - p.x) * detail, y: p.y };
    glyph(id, "domain", marker, tokens.chipMinPx * appear, color(id, "domain", inks.domainRim), inks.domainFill, (input.evidence?.staleByDomain.get(id) ?? 0) > 0);
    const side = cluster.branchSide ?? 1;
    const textX = marker.x + tokens.chipMinPx + tokens.ledgerGapPx / 2;
    const title = text(id, "domain", domain.label, { x: textX, y: p.y - tokens.chipMinPx * detail }, "left", "domain", color(id, "domain", inks.domainLabelAttended));
    if (namesVisible) text(id, "units", units, { x: textX, y: p.y + tokens.ledgerGapPx / 2 }, "left", "element", color(id, "domain", inks.units), detail);
    if (detail <= 0.5) rows.push({ id, box: title });
    for (const [itemIndex, item] of cluster.items.entries()) {
      const active = input.attention.capabilityId === item.id || input.hoveredNodeId === item.id || input.agentFocusNodeId === item.id || input.selectionPulse?.nodeId === item.id || (input.contextAlphas?.get(item.id) ?? 0) >= 0.5;
      const preview = !item.direct && itemIndex < previewRows;
      const presence = active || partners.has(item.id) ? 1 : Math.max(preview ? detail : 0, disclosure.elementsAlpha);
      if (presence <= 0.01 || (input.contextAlphas && (input.contextAlphas.get(item.id) ?? 0) < 0.05)) { if (!item.direct) alphas.set(item.id, 0); continue; }
      const q = item.direct ? input.toScreen(item.x, item.y) : position(item.id, item);
      const radius = Math.min(map.radiusCapability * 1.5, Math.max(tokens.discGlyphPx, rowPx / 3));
      radii.set(item.id, radius);
      if (capAlpha <= 0.02 || !visible(q, tokens.nameMaxPx)) continue;
      const state = input.evidence?.stateOf(item.id);
      const tint = mixOver(color(item.id, "capability", state === "stale" ? inks.stale : inks.capabilityRim), inks.bg, presence);
      const root = { x: p.x + side * width / 2 * detail, y: p.y };
      stems.push({ a: root, c: { x: (root.x + q.x) / 2, y: q.y }, b: { x: q.x - side * radius, y: q.y }, ink: ink(mixOver(color(item.id, "capability", inks.element), inks.bg, presence)) });
      if (item.direct) out.squares.push({ id: null, ...q, half: radius, fill: ink(inks.elementFill), rim: ink(inks.element) });
      else {
        if (active) glyph(item.id, "capability", q, Math.max(radius, tokens.discGlyphPx), tint, inks.bg);
        else {
          out.discs.push({ id: item.id, ...q, r: radius * appear, fill: ink(mixOver(inks.capabilityFill, inks.bg, presence)), rim: ink(tint), dashed: false, lineWidth: 1.3 });
          if (presence > 0.5) picks.push({ id: item.id, ...q, r: radius });
        }
        alphas.set(item.id, input.contextAlphas?.get(item.id) ?? presence);
        if (state === "stale" && namesVisible) text(item.id, "status", "!", q, "center", "element", tint, presence);
        if (namesVisible || active || partners.has(item.id)) {
          const label = model.capabilityById.get(item.id)!.label;
          const name = text(item.id, "capability", label, { x: q.x + side * (radius + tokens.chipMinPx), y: q.y }, side > 0 ? "left" : "right", "capability", color(item.id, "capability", inks.domainLabel), presence);
          if (presence > 0.5) rows.push({ id: item.id, box: name });
        }
      }
      const a = disclosure.elementAlphaFor(item);
      if (!input.contextAlphas && (a <= 0.5 || (disclosure.entered !== id && input.attention.capabilityId !== item.id))) continue;
      for (const el of item.elementIds) {
        if (input.contextAlphas && (input.contextAlphas.get(el) ?? 0) < 0.5) continue;
        const at = scene.positions.get(el)!;
        const e = position(el, at);
        if (!visible(e, tokens.chipMinPx)) continue;
        out.squares.push({ id: el, ...e, half: Math.min(3.2, Math.max(1.2, item.elementPitch * input.scale * 0.22)), fill: ink(inks.elementFill), rim: ink(inks.element) });
        picks.push({ id: el, ...e, r: 4 });
        alphas.set(el, 1);
        const label = input.elementLabel(el);
        if (label && item.elementPitch * input.scale >= tokens.elementName) {
          const font = scaledLabelFont("element", tokens.labelScale);
          const width = input.measureText(label, font);
          const height = scaledLabelFontSize("element", tokens.labelScale);
          const fit = capabilityNameTries({ ...e, r: tokens.chipMinPx }, width, height).find((candidate) => !out.texts.some((t) => overlaps(t.box, candidate.box)));
          if (fit) text(el, "element", label, fit, fit.align, "element", inks.units);
        }
      }
    }
    const more = domain.capabilityIds.length - previewRows;
    if (!input.contextAlphas && more > 0 && disclosure.elementsAlpha < 0.99 && namesVisible) {
      const last = cluster.items[previewRows - 1]!;
      const point = input.toScreen(last.x, last.y + tokens.pitch * BRANCH_ROW_PITCH);
      const radius = Math.min(map.radiusCapability * 1.5, Math.max(tokens.discGlyphPx, rowPx / 3));
      const label = text(id, "more", input.labels?.moreMembers?.(more) ?? input.labels?.more(more) ?? `+${more}`, { x: point.x + side * (radius + tokens.chipMinPx), y: point.y }, side > 0 ? "left" : "right", "capability", color(id, "domain", inks.units), detail * (1 - disclosure.elementsAlpha));
      if (detail > 0.5 && disclosure.elementsAlpha < 0.5) rows.push({ id, box: label });
    }
  }
  for (const id of scene.orphans.ids) {
    if (disclosure.orphanAlpha <= 0.5) { alphas.set(id, 0); continue; }
    const p = position(id, scene.positions.get(id)!);
    if (!visible(p, tokens.chipMinPx)) continue;
    glyph(id, "element", p, tokens.discMinPx, inks.element, inks.elementFill);
  }
  if (model.projectId) {
    const id = model.projectId;
    const p = position(id, scene.positions.get(id)!);
    if (visible(p, tokens.nameMaxPx)) {
      const radius = Math.min(tokens.hubMaxPx, Math.max(tokens.hubMinPx, map.radiusProject * input.scale));
      glyph(id, "project", p, radius, inks.domainRim, inks.bg);
      const titleY = p.y + radius + tokens.ledgerGapPx;
      const name = text(id, "project", model.projectLabel, { x: p.x, y: titleY }, "center", "project", inks.domainLabelAttended);
      rows.push({ id, box: name });
      input.hubLines?.forEach((line, i) => { if (line) text(id, "units", line, { x: p.x, y: titleY + (i + 1) * tokens.ledgerRowPx }, "center", "element", inks.units); });
    }
  }
  const flows = input.contextAlphas ? { links: [], drawn: [], entered: disclosure.entered, resolved: disclosure.resolved, budget: { shown: 0, total: 0, perEndCap: Infinity }, stubs: [] } : buildFlowMarks({
    model, scene, tokens, inks, attention: input.attention, inkAttention: input.inkAttention, previous: input.previous,
    inkMix: input.inkMix, chordPresence: input.chordPresence, scale: input.scale,
    viewportWidth: input.viewportWidth, viewportHeight: input.viewportHeight, freeRect: input.freeRect,
    nodeScreen: input.nodeScreen, toScreen: input.toScreen, appearOf: input.appearOf, measureText: input.measureText,
    endRadiusPx: (id) => radii.get(id) ?? 0, endBox: (id) => boxes.get(id) ?? null,
    occupied: [...boxes.values(), ...out.texts.map((t) => t.box)], avoidTexts: out.texts.map((t) => t.box), chords,
    resolution: disclosure, named: new Set(nameBoxes.keys()), nameBoxes,
  }, out);
  if (input.contextAlphas) stems.length = 0;
  const elementSquares = out.squares.filter((q) => q.id !== null).length;
  return { drawnCount: [...alphas.values()].filter((a) => a > 0.5).length, tier: elementSquares ? "element" : "circuit", alphas, picks, rows, chords, flows, ledger: null, elementSquares };
}
