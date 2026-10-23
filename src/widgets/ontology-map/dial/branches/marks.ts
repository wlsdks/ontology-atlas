import { scaledLabelFont } from "../../render/labels";
import { buildFlowMarks } from "../flow-marks";
import { crossfadeInk, inkIndex, mixOver } from "../ink";
import { smoothstep } from "../frame/disclosure";
import type { DialFrameMarks, DialMarksInput, DialMarksResult } from "../frame/marks";
import type { Box, DialAttention, DialKind, GlyphMark, Point, TextMark } from "../types";
import { branchPreviewRows, BRANCH_ROW_PITCH } from "./layout";
import { crossesBox, overlaps } from "../label-marks";
import { branchNameLines, branchTextStyle } from "./text";
import { branchMemberAlpha, branchMemberCount } from "./member-disclosure";
import { settleBranchNames } from "./name-occupancy";

export interface BranchBlock { id: string; box: Box; fill: number; rim: number; alpha: number }
export interface BranchStem { a: Point; c: Point; b: Point; ink: number }

export function buildBranchMarks(input: DialMarksInput, out: DialFrameMarks): DialMarksResult {
  const { model, scene, tokens, inks, mapTokens: map, disclosure } = input;
  const previewRows = scene.branchPreviewRows ?? branchPreviewRows(scene.clusters.length);
  const alphas = new Map<string, number>();
  const picks: DialMarksResult["picks"] = [];
  const rows: DialMarksResult["rows"] = [];
  const chords: DialMarksResult["chords"] = [];
  const blocks = out.blocks ??= [];
  const stems = out.stems ??= [];
  const children: { id: string; parent: Point; radius: number; p: Point; half: number; active: boolean; direct: boolean }[] = [];
  const boxes = new Map<string, Box>();
  const radii = new Map<string, number>();
  const nameBoxes = new Map<string, Box>();
  const activeIds = new Set([...(input.requiredBranchIds ?? []), input.focusedNodeId, input.hoveredNodeId, input.agentFocusNodeId, input.selectionPulse?.nodeId].filter((id): id is string => !!id));
  const activeElementCount = [...activeIds].filter((id) => id !== model.projectId && !model.domainById.has(id) && !model.capabilityById.has(id) && scene.positions.has(id)).length;
  let ordinaryElements = 0;
  const takeElement = (active: boolean) => {
    if (active) return true;
    if (ordinaryElements >= 1000 - activeElementCount) return false;
    ordinaryElements += 1;
    return true;
  };
  const activeChildren = new Map<string, string[]>();
  for (const id of activeIds) {
    const parent = model.capabilityOf.get(id) ?? (!model.capabilityById.has(id) && !model.domainById.has(id) ? model.domainOf.get(id) : null);
    if (!parent) continue;
    const children = activeChildren.get(parent) ?? [];
    children.push(id);
    activeChildren.set(parent, children);
  }
  const activeCaps = new Set([...activeIds].map((id) => model.capabilityOf.get(id) ?? id));
  const partners = new Set([...input.attention.needsCaps, ...input.attention.usedByCaps, ...input.attention.relatesCaps]);
  const activeDomains = new Set([...activeIds, ...partners].map((id) => model.domainOf.get(id)));
  const selected = (id: string) => input.focusedNodeId === id || (input.focusedNodeId === undefined && input.attention.selected && (input.attention.capabilityId ?? input.attention.domainId) === id);
  const ink = (color: string) => inkIndex(out, color);
  const position = (id: string, p: Point) => input.nodeScreen(id) ?? input.toScreen(p.x, p.y);
  const visible = (p: Point, room: number) => p.x + room >= 0 && p.x - room <= input.viewportWidth && p.y + room >= 0 && p.y - room <= input.viewportHeight;
  const inkAlphaFor = (a: DialAttention | null, id: string, kind: DialKind): number => {
    if (input.contextAlphas) return input.contextInkAlphas?.get(id) ?? input.contextAlphas.get(id) ?? map.egoRestAlpha;
    if (!a?.domainId) return 1;
    const domain = model.domainOf.get(id);
    const own = a.domainId === id || (domain === a.domainId && (a.capabilityId === null || a.capabilityId === id));
    const partner = a.needsCaps.has(id) || a.usedByCaps.has(id) || a.relatesCaps.has(id);
    if (own || partner || (kind === "domain" && a.partnerDomains.has(id))) return 1;
    return map.egoRestAlpha;
  };
  const inkAlpha = (id: string, kind: DialKind) => {
    const before = inkAlphaFor(input.previous ?? input.inkAttention, id, kind);
    const after = inkAlphaFor(input.inkAttention, id, kind);
    return before + (after - before) * Math.min(1, Math.max(0, input.inkMix));
  };
  const colorFor = (a: DialAttention | null, id: string, kind: DialKind, rest: string) => mixOver(rest, inks.bg, inkAlphaFor(a, id, kind));
  const color = (id: string, kind: DialKind, rest: string) => crossfadeInk(
    colorFor(input.previous ?? input.inkAttention, id, kind, rest),
    colorFor(input.inkAttention, id, kind, rest), input.inkMix,
  );
  const text = (id: string, role: TextMark["role"], value: string, p: Point, align: CanvasTextAlign, kind: DialKind, tint: string, presence = 1) => {
    if (selected(id) && (role === "capability" || role === "element")) tint = inks.domainLabelAttended;
    const { font, height } = branchTextStyle(role === "element" ? "capability" : role, kind, tokens.labelScale);
    const lines = (role === "capability" || role === "domain" || role === "element") ? branchNameLines(value, font, tokens.nameMaxPx, input.measureText) : [value];
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
      id, kind, ...p, r, stroke: selected(id) ? inks.domainLabelAttended : stroke, fill: selected(id) ? mixOver(inks.domainLabelAttended, fill, 0.12) : fill,
      egoState: selected(id) ? "center" : "normal",
      selectionInk: selected(id) ? inks.domainLabelAttended : undefined,
      count: null, stalePip,
      hovered: false, agentFocus: input.agentFocusNodeId === id,
      selectionPulse: null,
    };
    out.glyphs.push(g);
    const alpha = input.contextAlphas?.get(id) ?? 1;
    if (alpha >= 0.05) picks.push({ id, ...p, r: kind === "element" ? Math.max(tokens.chipMinPx * 1.5, r) : r });
    alphas.set(id, kind === "element" || kind === "project" || selected(id) ? alpha : inkAlpha(id, kind));
  };
  const rowPx = tokens.pitch * BRANCH_ROW_PITCH * input.scale;
  const detail = smoothstep(tokens.ledgerGapPx, tokens.ledgerGapPx + tokens.chipMinPx, rowPx);
  const namesVisible = detail > 0.01;
  const capAlpha = disclosure.capAlpha;
  for (const cluster of scene.clusters) {
    const id = cluster.domainId;
    const domain = model.domainById.get(id)!;
    const p = position(id, cluster.chip);
    if (input.attention.domainId !== id && !activeDomains.has(id) && !visible(p, cluster.footprint * input.scale + tokens.nameMaxPx)) continue;
    const appear = input.appearOf(id);
    if (appear <= 0) continue;
    const arrival = smoothstep(tokens.chordArrival, 1, appear);
    if (arrival <= 0) {
      glyph(id, "domain", p, tokens.chipMinPx * appear, inks.domainRim, inks.domainFill);
      continue;
    }
    const titleFont = scaledLabelFont("project", tokens.labelScale);
    const titleLines = branchNameLines(domain.label, titleFont, tokens.nameMaxPx, input.measureText);
    const titleWidth = Math.max(...titleLines.map((line) => input.measureText(line, titleFont)));
    const titleExtraHeight = (titleLines.length - 1) * branchTextStyle("domain", "domain", tokens.labelScale).height;
    const units = input.labels?.units(domain.capabilityIds.length, domain.elementCount) ?? "";
    const unitsWidth = input.measureText(units, scaledLabelFont("capability", tokens.labelScale));
    const width = Math.max(tokens.nameMaxPx + tokens.ledgerGapPx, titleWidth + tokens.ledgerGapPx * 2, unitsWidth + tokens.ledgerGapPx * 2);
    const halfHeight = tokens.ledgerGapPx + tokens.chipMinPx + titleExtraHeight / 2;
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
    const cardTextX = marker.x + tokens.chipMinPx + tokens.ledgerGapPx / 2;
    const compactTextX = p.x + side * (tokens.chipMinPx + tokens.ledgerGapPx / 2) - (side < 0 ? titleWidth : 0);
    const textX = scene.clusters.length > 4 ? compactTextX + (cardTextX - compactTextX) * detail : cardTextX;
    const title = text(id, "domain", domain.label, { x: textX, y: p.y - (tokens.chipMinPx + titleExtraHeight / 2) * detail }, "left", "domain", color(id, "domain", inks.domainLabelAttended));
    if (namesVisible) text(id, "units", units, { x: textX, y: p.y + (tokens.ledgerGapPx + titleExtraHeight) / 2 }, "left", "element", color(id, "domain", inks.units), detail);
    if (detail <= 0.5) rows.push({ id, box: title });
    const shownMembers = branchMemberCount(scene, id);
    const expanded = shownMembers > previewRows;
    const now = input.now ?? performance.now();
    const disclosureAlpha = branchMemberAlpha(scene, id, previewRows, now, input.reducedMotion);
    const explicitDisclosure = expanded || disclosureAlpha > 0;
    const members = cluster.items.filter((item) => !item.direct);
    let ordinal = 0;
    for (const item of cluster.items) {
      const memberIndex = item.direct ? -1 : ordinal++;
      const activeElements = activeChildren.get(item.direct ? id : item.id);
      const active = input.attention.capabilityId === item.id || activeCaps.has(item.id) || !!activeElements || (input.contextAlphas?.get(item.id) ?? 0) >= 0.5;
      const memberAlpha = item.direct ? 0 : branchMemberAlpha(scene, id, memberIndex, now, input.reducedMotion);
      const presence = active || partners.has(item.id) ? 1 : (item.direct ? disclosure.elementsAlpha : memberAlpha * (memberIndex >= previewRows ? 1 : detail + (1 - detail) * disclosureAlpha));
      if (presence <= 0.01 || (input.contextAlphas && (input.contextAlphas.get(item.id) ?? 0) < 0.05)) { if (!item.direct) alphas.set(item.id, 0); continue; }
      const q = item.direct ? input.toScreen(item.x, item.y) : position(item.id, item);
      const radius = Math.min(map.radiusCapability * 1.5, Math.max(tokens.discGlyphPx, rowPx / 3));
      radii.set(item.id, radius);
      const itemVisible = visible(q, tokens.nameMaxPx);
      if ((!active && !partners.has(item.id) && !explicitDisclosure && capAlpha <= 0.02) || (!itemVisible && !activeElements)) continue;
      if (itemVisible && !item.direct) {
        const state = input.evidence?.stateOf(item.id);
        const tint = mixOver(color(item.id, "capability", state === "stale" ? inks.stale : inks.capabilityRim), inks.bg, presence);
        const root = { x: p.x + side * width / 2 * detail, y: p.y };
        stems.push({ a: root, c: { x: (root.x + q.x) / 2, y: q.y }, b: { x: q.x - side * radius, y: q.y }, ink: ink(mixOver(color(item.id, "capability", inks.element), inks.bg, presence)) });
        if (active) glyph(item.id, "capability", q, Math.max(radius, tokens.discGlyphPx), tint, inks.bg);
        else {
          out.discs.push({ id: item.id, ...q, r: radius * appear, fill: ink(mixOver(inks.capabilityFill, inks.bg, presence)), rim: ink(tint), dashed: false, lineWidth: 1.3 });
          if (presence > 0.5) picks.push({ id: item.id, ...q, r: radius });
        }
        alphas.set(item.id, selected(item.id) ? presence : presence * inkAlpha(item.id, "capability"));
        if (state === "stale" && namesVisible) text(item.id, "status", "!", q, "center", "element", tint, presence);
        if (namesVisible || expanded || memberIndex >= previewRows || active || partners.has(item.id)) {
          const label = model.capabilityById.get(item.id)!.label;
          const name = text(item.id, "capability", label, { x: q.x + side * (radius + tokens.chipMinPx), y: q.y }, side > 0 ? "left" : "right", "capability", color(item.id, "capability", inks.domainLabel), presence);
          if (presence > 0.5) rows.push({ id: item.id, box: name });
        }
      }
      const a = disclosure.elementAlphaFor(item);
      if (!activeElements && !input.contextAlphas && (a <= 0.5 || (disclosure.entered !== id && input.attention.capabilityId !== item.id))) continue;
      for (const el of a <= 0.5 && !input.contextAlphas ? activeElements ?? [] : item.elementIds) {
        const activeElement = activeIds.has(el);
        if (a <= 0.5 && !activeElement && !input.contextAlphas) continue;
        if (input.contextAlphas && (input.contextAlphas.get(el) ?? 0) < 0.5) continue;
        const at = scene.positions.get(el)!;
        const e = position(el, at);
        if (!visible(e, tokens.chipMinPx)) continue;
        const label = input.elementLabel(el);
        if (!activeElement && (!label || item.elementPitch * input.scale < tokens.elementName)) continue;
        const half = Math.max(tokens.chipMinPx * 0.75, Math.min(tokens.discGlyphPx, item.elementPitch * input.scale * 0.22));
        if (!activeElement && (e.x - half < input.freeRect.minX || e.x + half > input.freeRect.maxX || e.y - half < input.freeRect.minY || e.y + half > input.freeRect.maxY)) continue;
        if (!takeElement(activeElement)) continue;
        if (activeElement) glyph(el, "element", e, tokens.discGlyphPx, inks.element, inks.elementFill);
        else {
          out.squares.push({ id: el, ...e, half, fill: ink(inks.elementFill), rim: ink(inks.element) });
          picks.push({ id: el, ...e, r: tokens.chipMinPx * 1.5 });
          alphas.set(el, 1);
        }
        if (label) text(el, "element", label, { x: e.x + side * (half + tokens.chipMinPx), y: e.y }, side > 0 ? "left" : "right", "element", inks.domainLabel);
        children.push({ id: el, parent: item.direct ? { x: p.x + side * width / 2 * detail, y: p.y } : q, radius: item.direct ? 0 : radius + (active ? tokens.chipMinPx : 0), p: e, half: activeElement ? tokens.discGlyphPx : half, active: activeElement, direct: item.direct });
      }
    }
    const more = domain.capabilityIds.length - shownMembers;
    if (!input.contextAlphas && (more > 0 || expanded) && (namesVisible || expanded)) {
      const last = members[Math.min(shownMembers, members.length) - 1]!;
      const point = input.toScreen(last.x, last.y + tokens.pitch * BRANCH_ROW_PITCH);
      const radius = Math.min(map.radiusCapability * 1.5, Math.max(tokens.discGlyphPx, rowPx / 3));
      const controls: { direction: "more" | "less"; label: string }[] = [];
      const nextBatch = Math.min(more, previewRows);
      if (more > 0) controls.push({ direction: "more", label: input.labels?.moreMembers?.(nextBatch) ?? input.labels?.more(nextBatch) ?? `+${nextBatch}` });
      if (expanded) controls.push({ direction: "less", label: input.labels?.lessMembers?.(shownMembers - previewRows) ?? `−${shownMembers - previewRows}` });
      controls.forEach((control, index) => {
        const label = text(id, "more", control.label, { x: point.x + side * (radius + tokens.chipMinPx), y: point.y + index * tokens.ledgerGapPx }, side > 0 ? "left" : "right", "capability", color(id, "domain", inks.units), expanded ? 1 : detail);
        rows.push({ id, box: label, action: { type: "branch-members", domainId: id, direction: control.direction } });
      });
    }
  }
  for (const id of scene.orphans.ids) {
    const active = activeIds.has(id);
    if (!active && disclosure.orphanAlpha <= 0.5) { alphas.set(id, 0); continue; }
    const p = position(id, scene.positions.get(id)!);
    if (!visible(p, tokens.chipMinPx) || !takeElement(active)) continue;
    glyph(id, "element", p, tokens.discMinPx, inks.element, inks.elementFill);
    const label = active ? input.elementLabel(id) : null;
    if (label) text(id, "element", label, { x: p.x + tokens.chipMinPx, y: p.y }, "left", "element", inks.domainLabelAttended);
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
  settleBranchNames(input, out, nameBoxes, rows);
  const hidden = new Set<string>();
  const childBodies = [
    ...(out.blocks ?? []).filter((mark) => mark.alpha > 0.01).map((mark) => ({ id: mark.id, box: mark.box })),
    ...out.glyphs.map((mark) => ({ id: mark.id, box: { minX: mark.x - mark.r, maxX: mark.x + mark.r, minY: mark.y - mark.r, maxY: mark.y + mark.r } })),
    ...out.discs.map((mark) => ({ id: mark.id, box: { minX: mark.x - mark.r, maxX: mark.x + mark.r, minY: mark.y - mark.r, maxY: mark.y + mark.r } })),
    ...out.squares.map((mark) => ({ id: mark.id, box: { minX: mark.x - mark.half, maxX: mark.x + mark.half, minY: mark.y - mark.half, maxY: mark.y + mark.half } })),
  ];
  for (const child of children) {
    const { parent, p, radius, half } = child;
    const sign = p.y < parent.y ? -1 : 1;
    let stem: BranchStem | undefined;
    if (nameBoxes.has(child.id)) {
      // A fixed set of ports keeps containment separate from the central capability caption.
      for (const turn of [sign, -sign]) {
        const a = { x: parent.x, y: parent.y + turn * radius };
        const reach = Math.min(child.direct ? tokens.nameMaxPx : Infinity, Math.max(tokens.ledgerGapPx * 2, Math.abs(p.x - parent.x) * 0.6));
        const edge = { x: p.x, y: p.y + turn * half };
        for (const { b, c } of [
          { b: { x: p.x + (p.x < parent.x ? half : -half), y: p.y }, c: { x: parent.x, y: p.y } },
          { b: edge, c: { x: parent.x, y: p.y + turn * reach } },
          { b: edge, c: { x: (parent.x + p.x) / 2, y: p.y + turn * reach } },
        ]) {
          const points = Array.from({ length: 33 }, (_, i) => {
            const t = i / 32;
            return { x: (1 - t) ** 2 * a.x + 2 * t * (1 - t) * c.x + t ** 2 * b.x, y: (1 - t) ** 2 * a.y + 2 * t * (1 - t) * c.y + t ** 2 * b.y };
          });
          if (child.direct && points.some((point) => point.x < input.freeRect.minX || point.x > input.freeRect.maxX || point.y < input.freeRect.minY || point.y > input.freeRect.maxY)) continue;
          const bounds = { minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)) };
          const blocked = (box: Box) => overlaps(bounds, box) && crossesBox([points], box);
          if (out.texts.some((text) => blocked(text.box)) || childBodies.some((body) => body.id !== child.id && blocked(body.box))) continue;
          stem = { a, c, b, ink: ink(mixOver(inks.element, inks.bg, 0.5)) };
          break;
        }
        if (stem) break;
      }
    }
    if (stem) stems.push(stem);
    else if (!child.active) hidden.add(child.id);
  }
  if (hidden.size) {
    out.squares = out.squares.filter((mark) => !hidden.has(mark.id!));
    out.texts = out.texts.filter((mark) => !hidden.has(mark.id!));
    out.leaders = out.leaders.filter((mark) => !hidden.has(mark.id));
    for (const id of hidden) { nameBoxes.delete(id); alphas.set(id, 0); }
    for (let i = picks.length - 1; i >= 0; i--) if (hidden.has(picks[i]!.id)) picks.splice(i, 1);
    for (let i = rows.length - 1; i >= 0; i--) if (hidden.has(rows[i]!.id)) rows.splice(i, 1);
  }
  const flows = input.contextAlphas ? { links: [], drawn: [], entered: disclosure.entered, resolved: disclosure.resolved, budget: { shown: 0, total: 0, perEndCap: Infinity }, stubs: [] } : buildFlowMarks({
    model, scene, tokens, inks, attention: input.attention, inkAttention: input.inkAttention, previous: input.previous,
    connectionCount: input.labels?.connectionCount,
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
