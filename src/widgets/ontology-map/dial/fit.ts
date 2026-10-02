import { scaledLabelFont, scaledLabelFontSize } from "../render/labels";
import { domainLabelBlock, sideOf, type MeasureText } from "./label-marks";
import type { Box, DialLabels, DialModel, DialScene, DialTokens, Pad } from "./types";

const NAME_GAP_PX = 5;
const ORPHAN_GAP_PX = 8;
const EDGE_SHARE = 0.01;

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

export function dialOverviewPad(scene: DialScene, model: DialModel, labels: DialLabels | null, measure: MeasureText, tokens: DialTokens): Pad {
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
