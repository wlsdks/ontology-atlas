import { LABEL_OFFSET, scaledLabelFont, scaledLabelFontSize } from "../render/labels";
import { domainLabelBlock, sideOf, type MeasureText } from "./label-marks";
import type { Box, DialLabels, DialModel, DialScene, DialTokens, Pad } from "./types";
import { branchTextStyle } from "./branches/text";
import { branchPreviewRows } from "./branches/layout";

const NAME_GAP_PX = 5;
const ORPHAN_GAP_PX = 8;
const EDGE_SHARE = 0.01;
const CAMERA_SPINE_NAME_ALLOWANCE_PX = Math.max(...Object.values(LABEL_OFFSET)) + 4;
const OPENING_WINDOW_FIT_HEIGHT_PX = 949 - 148 - 96 - CAMERA_SPINE_NAME_ALLOWANCE_PX;
const CAMERA_LABEL_ALLOWANCE_SHARE = (2 * CAMERA_SPINE_NAME_ALLOWANCE_PX) / (OPENING_WINDOW_FIT_HEIGHT_PX - CAMERA_SPINE_NAME_ALLOWANCE_PX);

type Side = keyof Pad;

function sidesTouched(box: Box, extent: Box): Set<Side> {
  const slack = EDGE_SHARE * Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY, 1);
  const out = new Set<Side>();
  if (box.minX <= extent.minX + slack) out.add("left");
  if (box.maxX >= extent.maxX - slack) out.add("right");
  if (box.minY <= extent.minY + slack) out.add("top");
  if (box.maxY >= extent.maxY - slack) out.add("bottom");
  return out;
}

function grow(pad: Pad, side: Side, px: number): void {
  pad[side] = Math.max(pad[side], px);
}

function addBlock(pad: Pad, touched: Set<Side>, angle: number, width: number, height: number, clearance: number): void {
  const align = sideOf(angle);
  const side: Side = align === "left" ? "right" : align === "right" ? "left" : Math.sin(angle) < 0 ? "top" : "bottom";
  if (!touched.has(side)) return;
  grow(pad, side, (side === "left" || side === "right" ? width : height) + clearance);
}

export function dialOverviewBounds(scene: Pick<DialScene, "rings" | "extent" | "clusters" | "orphans">): Box {
  const r = Math.max(0, ...scene.rings.map((ring) => ring.radius));
  if (r <= 0) return { ...scene.extent };
  const reach: Pad = { left: r, right: r, top: r, bottom: r };
  const reachOut = (x: number, y: number, f: number) => {
    grow(reach, "left", f - x);
    grow(reach, "right", x + f);
    grow(reach, "top", f - y);
    grow(reach, "bottom", y + f);
  };
  for (const c of scene.clusters) reachOut(c.chip.x, c.chip.y, c.footprint);
  if (scene.orphans.ids.length > 0) reachOut(scene.orphans.centre.x, scene.orphans.centre.y, scene.orphans.radius);
  const hx = Math.min(reach.left, reach.right);
  const hy = Math.min(reach.top, reach.bottom);
  return { minX: -hx, minY: -hy * (1 + CAMERA_LABEL_ALLOWANCE_SHARE), maxX: hx, maxY: hy };
}

export function dialOverviewPad(scene: DialScene, model: DialModel, labels: DialLabels | null, measure: MeasureText, tokens: DialTokens): Pad {
  if (scene.branches) {
    const { font } = branchTextStyle("capability", "capability", tokens.labelScale);
    let left = tokens.chipMaxPx;
    let right = tokens.chipMaxPx;
    const previewRows = scene.branchPreviewRows ?? branchPreviewRows(scene.clusters.length);
    for (const c of scene.clusters) for (const it of c.items.slice(0, previewRows)) {
      const width = Math.min(tokens.nameMaxPx, measure(model.capabilityById.get(it.id)?.label ?? "", font)) + tokens.ledgerGapPx + tokens.chipMinPx;
      if (c.branchSide === 1) right = Math.max(right, width);
      else left = Math.max(left, width);
    }
    const side = Math.max(left, right);
    return { left: side, right: side, top: tokens.ledgerGapPx, bottom: tokens.ledgerGapPx };
  }
  return scene.rings.length > 0 ? { left: 0, right: 0, top: 0, bottom: 0 } : dialLabelPad(scene, model, labels, measure, tokens);
}

function dialLabelPad(scene: DialScene, model: DialModel, labels: DialLabels | null, measure: MeasureText, tokens: DialTokens): Pad {
  const pad: Pad = { left: 0, right: 0, top: 0, bottom: 0 };
  const clearance = tokens.chipMaxPx + NAME_GAP_PX;
  for (const cluster of scene.clusters) {
    const f = cluster.footprint;
    const bounds: Box = { minX: cluster.chip.x - f, maxX: cluster.chip.x + f, minY: cluster.chip.y - f, maxY: cluster.chip.y + f };
    const block = domainLabelBlock(cluster.domainId, model, labels, null, measure, tokens);
    addBlock(pad, sidesTouched(bounds, scene.extent), Math.atan2(cluster.chip.y, cluster.chip.x), block.width, block.height, clearance);
  }
  const orphans = scene.orphans;
  if (labels && orphans.ids.length > 0) {
    const r = orphans.radius;
    const bounds: Box = { minX: orphans.centre.x - r, maxX: orphans.centre.x + r, minY: orphans.centre.y - r, maxY: orphans.centre.y + r };
    const touched = sidesTouched(bounds, scene.extent);
    const font = scaledLabelFont("element", tokens.labelScale);
    const width = measure(labels.orphans(orphans.ids.length), font);
    if (touched.has("right")) grow(pad, "right", width + ORPHAN_GAP_PX);
    else if (touched.has("left")) grow(pad, "left", width + ORPHAN_GAP_PX);
    else if (touched.has("bottom")) grow(pad, "bottom", scaledLabelFontSize("element", tokens.labelScale) * 2);
    else if (touched.has("top")) grow(pad, "top", scaledLabelFontSize("element", tokens.labelScale) * 2);
  }
  return pad;
}

export function createMeasureText(): MeasureText {
  let ctx: CanvasRenderingContext2D | null | undefined;
  const memo = new Map<string, number>();
  return (text, font) => {
    const key = `${font}\0${text}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    if (ctx === undefined) ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    let width: number;
    if (ctx) {
      ctx.font = font;
      width = ctx.measureText(text).width;
    } else {
      width = text.length * (Number.parseFloat(font.split(" ")[1] ?? "10") || 10) * 0.6;
    }
    memo.set(key, width);
    return width;
  };
}
