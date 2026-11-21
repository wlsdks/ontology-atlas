import type { MeasureText } from "../../dial/label-marks";
import type { Box, DialLabels } from "../../dial/types";
import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { domainPartners } from "../../model/containment-tree";
import type { FlatGraphTitle } from "../types";
import type { NameInput, NamePiece, PlacedName } from "./types";

export function font(weight: number, px: number, family: string): string {
  return `${weight} ${px}px ${family}`;
}

export type DomainBlockInput = Pick<NameInput, "model" | "tokens" | "labels" | "measureText" | "fontFamily" | "staleByDomain" | "discRadius">;

/**
 * A domain's name and caption. A selected domain's reach line takes the caption's row: the layout
 * keeps members off a two-row title, and the detail panel shows the membership the caption counts.
 * A resting caption draws only a stale count, the one fact in it that asks for attention.
 */
export function domainBlock(input: DomainBlockInput, domainId: string, reachLine: string | null = null, captionRests = false): PlacedName[] {
  const { model, tokens: t, labels, measureText, fontFamily } = input;
  const d = model.domainById.get(domainId)!;
  const r = input.discRadius(domainId);
  const nameFont = font(FONT_WEIGHT.strong, t.domainNamePx, fontFamily);
  const nameW = measureText(d.label, nameFont);
  const nameY = r + t.nameGapPx + t.domainNamePx / 2;
  const out: PlacedName[] = [{
    id: domainId, role: "domain", text: d.label, font: nameFont, dx: 0, dy: nameY, align: "center",
    box: { minX: -nameW / 2 - t.namePadPx, maxX: nameW / 2 + t.namePadPx, minY: nameY - t.domainNamePx / 2 - t.namePadPx, maxY: nameY + t.domainNamePx / 2 + t.namePadPx },
  }];
  if (labels) {
    const stale = input.staleByDomain?.get(domainId) ?? 0;
    const units = labels.units(d.capabilityIds.length, d.elementCount);
    const text = captionRests ? labels.stale(stale) : stale > 0 ? `${units} · ${labels.stale(stale)}` : units;
    const captionFont = font(400, t.captionPx, fontFamily);
    const y = nameY + t.domainNamePx / 2 + t.captionGapPx + t.captionPx / 2;
    if (reachLine) {
      const figures = tabularPieces(reachLine, captionFont, measureText);
      const min = -figures.width / 2;
      out.push({
        id: domainId, role: "reach", text: reachLine, font: captionFont, dx: 0, dy: y, align: "center",
        box: { minX: min - t.namePadPx, maxX: -min + t.namePadPx, minY: y - t.captionPx / 2 - t.namePadPx, maxY: y + t.captionPx / 2 + t.namePadPx },
        pieces: figures.pieces.map((p) => ({ text: p.text, dx: min + p.dx })),
      });
    } else if (!captionRests || stale > 0) {
      const w = measureText(text, captionFont);
      out.push({
        id: domainId, role: "units", text, font: captionFont, dx: 0, dy: y, align: "center",
        box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: y - t.captionPx / 2 - t.namePadPx, maxY: y + t.captionPx / 2 + t.namePadPx },
      });
    }
  }
  return out;
}

/**
 * A domain block moved above its disc, its lines in the same order: where a partner domain's title
 * goes when a lit domain line would run through it below, so the line meets the disc.
 */
export function blockAbove(block: readonly PlacedName[]): PlacedName[] {
  let top = Infinity;
  let bottom = -Infinity;
  for (const n of block) {
    top = Math.min(top, n.box.minY);
    bottom = Math.max(bottom, n.box.maxY);
  }
  const shift = -(top + bottom);
  return block.map((n) => ({ ...n, dy: n.dy + shift, box: { ...n.box, minY: n.box.minY + shift, maxY: n.box.maxY + shift } }));
}

/** Whether a domain's title may take the side above its disc: a far end of a focused domain's lines. */
export function titleMayRise(input: Pick<NameInput, "model" | "focusId" | "named">, domainId: string): boolean {
  const focus = input.focusId;
  return focus !== null && focus !== domainId && input.model.domainById.has(focus) && input.named.has(domainId);
}

/** The selected domain's reach line, null for any other domain or picture. */
export function domainReachLine(input: Pick<NameInput, "selected" | "focusId" | "labels" | "reach">, domainId: string): string | null {
  return input.selected && input.focusId === domainId ? reachText(input.labels, input.reach) : null;
}

/**
 * Each domain's name and caption block at the overview, which the layout keeps clear of members,
 * wide enough for the reach line that takes the caption's row when the domain is selected; `name`
 * measures the name row alone. O(flows × D).
 */
export function domainTitleBlocks(input: Omit<DomainBlockInput, "staleByDomain" | "discRadius">, rows: "all" | "name" = "all"): Map<string, FlatGraphTitle> {
  const blocks = new Map<string, FlatGraphTitle>();
  const block: DomainBlockInput = { ...input, staleByDomain: null, discRadius: () => input.tokens.domainDiscPx };
  for (const d of input.model.domains) {
    const { needs, usedBy } = domainPartners(input.model.flows, d.id);
    const reachLine = reachText(input.labels, { needs: needs.length, neededBy: usedBy.length });
    const drawn = [...domainBlock(block, d.id), ...(reachLine ? domainBlock(block, d.id, reachLine) : [])];
    const boxes = drawn.filter((n) => rows === "all" || n.role === "domain").map((n) => n.box);
    blocks.set(d.id, {
      halfWidthPx: Math.max(...boxes.map((b) => Math.max(-b.minX, b.maxX))),
      topPx: Math.min(...boxes.map((b) => b.minY)),
      bottomPx: Math.max(...boxes.map((b) => b.maxY)),
    });
  }
  return blocks;
}

/**
 * How far the project's name above the hub and its two caption lines below reach from the hub's
 * centre at the overview. The layout keeps every cluster outside that circle; the lines' ends reach
 * past it sideways, where a cluster's own title already holds its members off. O(1).
 */
export function hubBlockReachPx(input: Pick<NameInput, "model" | "tokens">): number {
  const { model, tokens: t } = input;
  if (model.projectId === null) return 0;
  const nameTop = t.projectDiscPx + t.nameGapPx + t.projectNamePx + t.namePadPx;
  const captionBottom = t.projectDiscPx + t.nameGapPx + 2 * t.captionPx + t.captionGapPx + t.namePadPx;
  return Math.max(nameTop, captionBottom);
}

export function projectName(input: NameInput): PlacedName | null {
  const { model, tokens: t, measureText, fontFamily } = input;
  if (model.projectId === null || !model.projectLabel) return null;
  const f = font(FONT_WEIGHT.strong, t.projectNamePx, fontFamily);
  const w = measureText(model.projectLabel, f);
  const y = -input.discRadius(model.projectId) - t.nameGapPx - t.projectNamePx / 2;
  return {
    id: model.projectId, role: "project", text: model.projectLabel, font: f, dx: 0, dy: y, align: "center",
    box: { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: y - t.projectNamePx / 2 - t.namePadPx, maxY: y + t.projectNamePx / 2 + t.namePadPx },
  };
}

/** Text runs with each digit centred in a cell as wide as the widest digit, so figures align as `tnum` would. */
export function tabularPieces(text: string, f: string, measureText: MeasureText): { pieces: NamePiece[]; width: number } {
  let cell = 0;
  for (let d = 0; d <= 9; d += 1) cell = Math.max(cell, measureText(String(d), f));
  const pieces: NamePiece[] = [];
  let x = 0;
  let run = "";
  const flush = () => {
    if (!run) return;
    pieces.push({ text: run, dx: x });
    x += measureText(run, f);
    run = "";
  };
  for (const ch of text) {
    if (ch < "0" || ch > "9") {
      run += ch;
      continue;
    }
    flush();
    pieces.push({ text: ch, dx: x + (cell - measureText(ch, f)) / 2 });
    x += cell;
  }
  flush();
  return { pieces, width: x };
}

/** The reach line's text: zero sides are left out, and nothing at all is null. */
export function reachText(labels: DialLabels | null, reach: { needs: number; neededBy: number } | null): string | null {
  if (!labels || !reach) return null;
  const parts: string[] = [];
  if (reach.needs > 0 && labels.reachNeeds) parts.push(labels.reachNeeds(reach.needs));
  if (reach.neededBy > 0 && labels.reachNeededBy) parts.push(labels.reachNeededBy(reach.neededBy));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The row the project's caption draws on under its disc, padded like a name. O(1). */
export function hubCaptionBox(input: NameInput): Box | null {
  const { model, tokens: t } = input;
  if (!input.hubCaption || model.projectId === null || !input.layout.positions.has(model.projectId)) return null;
  const w = input.measureText(input.hubCaption, font(FONT_WEIGHT.signature, t.captionPx, input.fontFamily));
  const y = input.discRadius(model.projectId) + t.nameGapPx + t.captionPx / 2;
  return { minX: -w / 2 - t.namePadPx, maxX: w / 2 + t.namePadPx, minY: y - t.captionPx / 2 - t.namePadPx, maxY: y + t.captionPx / 2 + t.namePadPx };
}

/** The concepts outside every domain, captioned once under their group with the count. */
export function orphanCaption(input: NameInput, scale: number): PlacedName | null {
  const { layout, tokens: t, labels, measureText, fontFamily } = input;
  const first = layout.orphanIds[0];
  if (first === undefined || !labels) return null;
  const at = layout.positions.get(first)!;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of layout.orphanIds) {
    const p = layout.positions.get(id)!;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const count = layout.orphanIds.length;
  const text = labels.noDomain?.(count) ?? labels.orphans(count);
  const f = font(400, t.captionPx, fontFamily);
  const w = measureText(text, f);
  const r = Math.max(...layout.orphanIds.map((id) => input.discRadius(id)));
  const dx = ((minX + maxX) / 2 - at.x) * scale;
  const dy = (maxY - at.y) * scale + r + t.nameGapPx + t.captionPx / 2;
  return {
    id: first, role: "orphans", text, font: f, dx, dy, align: "center",
    box: { minX: dx - w / 2 - t.namePadPx, maxX: dx + w / 2 + t.namePadPx, minY: dy - t.captionPx / 2 - t.namePadPx, maxY: dy + t.captionPx / 2 + t.namePadPx },
  };
}
