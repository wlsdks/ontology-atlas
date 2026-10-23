import { scaledLabelFont, scaledLabelFontSize } from "../../render/labels";
import { buildFlowMarks } from "../flow-marks";
import { crossfadeInk, inkIndex, mixOver } from "../ink";
import { smoothstep } from "../frame/disclosure";
import type { DialFrameMarks, DialMarksInput, DialMarksResult } from "../frame/marks";
import type { Box, DialAttention, DialKind, GlyphMark, Point, TextMark } from "../types";
import { BRANCH_PREVIEW_ROWS } from "./layout";
import { capabilityNameTries, overlaps } from "../label-marks";
import { branchTextStyle } from "./text";

export interface BranchBlock { box: Box; fill: number; rim: number; alpha: number }
export interface BranchStem { a: Point; c: Point; b: Point; ink: number }

export function buildBranchMarks(input: DialMarksInput, out: DialFrameMarks): DialMarksResult {
  const { model, scene, tokens, inks, mapTokens: map, disclosure } = input;
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
    if (!a?.domainId) return rest;
    const domain = model.domainOf.get(id);
    const own = a.domainId === id || (domain === a.domainId && (a.capabilityId === null || a.capabilityId === id));
    const partner = a.needsCaps.has(id) || a.usedByCaps.has(id) || a.relatesCaps.has(id);
    if (own || partner) return inks.needs;
    if (kind === "domain" && a.partnerDomains.has(id)) return rest;
    return mixOver(rest, inks.bg, map.egoRestAlpha);
  };
  const color = (id: string, kind: DialKind, rest: string) => crossfadeInk(
    colorFor(input.previous ?? input.inkAttention, id, kind, rest),
    colorFor(input.inkAttention, id, kind, rest), input.inkMix,
  );
  const text = (id: string, role: TextMark["role"], value: string, p: Point, align: CanvasTextAlign, kind: DialKind, tint: string) => {
    const { font, height } = branchTextStyle(role, kind, tokens.labelScale);
    const width = input.measureText(value, font);
    const left = align === "right" ? p.x - width : align === "center" ? p.x - width / 2 : p.x;
    const box = { minX: left - 2, maxX: left + width + 2, minY: p.y - height / 2 - 2, maxY: p.y + height / 2 + 2 };
    const domain = model.domainById.has(id) ? id : model.domainOf.get(id);
    const arrival = domain ? smoothstep(tokens.chordArrival, 1, input.appearOf(domain)) : 1;
    out.texts.push({ id, role, text: value, ...p, align, font, ink: ink(mixOver(tint, inks.bg, arrival)), box, parts: null });
    if (role !== "units" && role !== "more") nameBoxes.set(id, box);
    return box;
  };
  const glyph = (id: string, kind: DialKind, p: Point, r: number, stroke: string, fill: string, stalePip = false) => {
    const g: GlyphMark = {
      id, kind, ...p, r, stroke, fill,
      egoState: input.attention.capabilityId === id || (input.attention.capabilityId === null && input.attention.domainId === id) ? "center" : "normal",
      count: null, stalePip,
      hovered: input.hoveredNodeId === id, agentFocus: input.agentFocusNodeId === id,
      selectionPulse: input.selectionPulse?.nodeId === id ? input.selectionPulse : null,
    };
    out.glyphs.push(g);
    picks.push({ id, ...p, r });
    alphas.set(id, 1);
  };
  const rowHeight = tokens.ledgerRowPx * 2;
  const namesVisible = tokens.pitch * input.scale >= rowHeight * 0.65;
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
    boxes.set(id, box);
    if (namesVisible) {
      blocks.push({ box, fill: ink(mixOver(inks.domainFill, inks.bg, 0.5)), rim: ink(color(id, "domain", inks.domainRim)), alpha: arrival });
      rows.push({ id, box });
    } else boxes.delete(id);
    radii.set(id, namesVisible ? halfHeight : tokens.chipMinPx);
    const marker = namesVisible ? { x: box.minX + tokens.ledgerGapPx * 0.7, y: p.y } : p;
    glyph(id, "domain", marker, tokens.chipMinPx * appear, color(id, "domain", inks.domainRim), inks.domainFill, (input.evidence?.staleByDomain.get(id) ?? 0) > 0);
    const side = cluster.branchSide ?? 1;
    const outer = p.x + side * (titleWidth + tokens.ledgerGapPx);
    const beside = outer >= tokens.chipMinPx && outer <= input.viewportWidth - tokens.chipMinPx;
    const compactTitle = beside ? { x: p.x + side * tokens.ledgerGapPx, y: p.y } : { x: p.x, y: p.y + tokens.ledgerGapPx };
    const title = text(id, "domain", domain.label, namesVisible ? { x: box.minX + tokens.ledgerGapPx * 1.5, y: p.y - tokens.chipMinPx } : compactTitle, namesVisible ? "left" : beside ? side > 0 ? "left" : "right" : "center", "domain", color(id, "domain", inks.domainLabelAttended));
    if (namesVisible) text(id, "units", units, { x: box.minX + tokens.ledgerGapPx * 1.5, y: p.y + tokens.ledgerGapPx / 2 }, "left", "element", color(id, "domain", inks.units));
    else rows.push({ id, box: title });
    for (const [itemIndex, item] of cluster.items.entries()) {
      const active = input.attention.capabilityId === item.id || input.hoveredNodeId === item.id || input.agentFocusNodeId === item.id || input.selectionPulse?.nodeId === item.id;
      const preview = !item.direct && itemIndex < BRANCH_PREVIEW_ROWS;
      const revealed = (preview && namesVisible) || disclosure.elementsAlpha > 0.5 || active || partners.has(item.id);
      if (!revealed) { if (!item.direct) alphas.set(item.id, 0); continue; }
      const q = item.direct ? input.toScreen(item.x, item.y) : position(item.id, item);
      const radius = Math.min(tokens.discMaxPx, Math.max(tokens.discMinPx, input.scale * tokens.pitch * tokens.discPitchShare));
      radii.set(item.id, radius);
      if (capAlpha <= 0.02 || !visible(q, tokens.nameMaxPx)) continue;
      const state = input.evidence?.stateOf(item.id);
      const tint = color(item.id, "capability", state === "stale" ? inks.stale : inks.capabilityRim);
      const root = namesVisible ? { x: side > 0 ? box.maxX : box.minX, y: p.y } : p;
      stems.push({ a: root, c: { x: (root.x + q.x) / 2, y: q.y }, b: { x: q.x - side * radius, y: q.y }, ink: ink(color(item.id, "capability", inks.element)) });
      if (item.direct) out.squares.push({ id: null, ...q, half: radius, fill: ink(inks.elementFill), rim: ink(inks.element) });
      else {
        if (active) glyph(item.id, "capability", q, Math.max(radius, tokens.discGlyphPx), tint, inks.bg, state === "stale");
        else {
          out.discs.push({ id: item.id, ...q, r: radius * appear, fill: ink(inks.bg), rim: ink(tint), dashed: state === "unknown", lineWidth: 1.3 });
          picks.push({ id: item.id, ...q, r: radius });
        }
        alphas.set(item.id, 1);
        if (namesVisible || active || partners.has(item.id)) {
          const label = model.capabilityById.get(item.id)!.label;
          const name = text(item.id, "capability", label, { x: q.x + side * (radius + tokens.chipMinPx), y: q.y }, side > 0 ? "left" : "right", "capability", color(item.id, "capability", inks.domainLabel));
          rows.push({ id: item.id, box: name });
        }
      }
      const a = disclosure.elementAlphaFor(item);
      if (a <= 0.5 || (disclosure.entered !== id && input.attention.capabilityId !== item.id)) continue;
      for (const el of item.elementIds) {
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
    const more = domain.capabilityIds.length - BRANCH_PREVIEW_ROWS;
    if (more > 0 && disclosure.elementsAlpha <= 0.5 && namesVisible) {
      const last = cluster.items[BRANCH_PREVIEW_ROWS - 1]!;
      const point = input.toScreen(last.x, last.y + tokens.pitch);
      const label = text(id, "more", input.labels?.moreMembers?.(more) ?? input.labels?.more(more) ?? `+${more}`, { x: point.x + side * (tokens.discMaxPx + tokens.chipMinPx), y: point.y }, side > 0 ? "left" : "right", "capability", color(id, "domain", inks.units));
      rows.push({ id, box: label });
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
      glyph(id, "project", p, tokens.hubMinPx, inks.domainRim, inks.bg);
      const name = text(id, "project", model.projectLabel, { x: p.x + tokens.hubMinPx + tokens.ledgerGapPx / 2, y: p.y }, "left", "project", inks.domainLabelAttended);
      rows.push({ id, box: name });
      input.hubLines?.forEach((line, i) => { if (line) text(id, "units", line, { x: name.minX, y: p.y + (namesVisible ? 1 : -1) * (i + 1) * tokens.ledgerRowPx }, "left", "element", inks.units); });
    }
  }
  const flows = buildFlowMarks({
    model, scene, tokens, inks, attention: input.attention, inkAttention: input.inkAttention, previous: input.previous,
    inkMix: input.inkMix, chordPresence: input.chordPresence, scale: input.scale,
    viewportWidth: input.viewportWidth, viewportHeight: input.viewportHeight, freeRect: input.freeRect,
    nodeScreen: input.nodeScreen, toScreen: input.toScreen, appearOf: input.appearOf, measureText: input.measureText,
    endRadiusPx: (id) => radii.get(id) ?? 0, endBox: (id) => boxes.get(id) ?? null,
    occupied: [...boxes.values(), ...out.texts.map((t) => t.box)], avoidTexts: out.texts.map((t) => t.box), chords,
    resolution: disclosure, named: new Set(nameBoxes.keys()), nameBoxes,
  }, out);
  const elementSquares = out.squares.filter((q) => q.id !== null).length;
  return { drawnCount: [...alphas.values()].filter((a) => a > 0.5).length, tier: elementSquares ? "element" : "circuit", alphas, picks, rows, chords, flows, ledger: null, elementSquares };
}
