import { scaledLabelFontSize } from "../render/labels";
import { domainLabelBlock, sideOf, type MeasureText } from "./label-marks";
import type { DialLabels, DialModel, DialScene, DialTokens, Pad } from "./types";

const NAME_CLEARANCE_PX = 10;
const ORPHAN_CAPTION_LINES = 1.4;

export function dialOverviewPad(scene: DialScene, model: DialModel, labels: DialLabels | null, measure: MeasureText, tokens: DialTokens): Pad {
  const clearance = tokens.chipMaxPx + NAME_CLEARANCE_PX;
  const pad: Pad = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const sector of scene.sectors) {
    const block = domainLabelBlock(sector, model, labels, null, measure, 1, tokens);
    const align = sideOf(sector.angle);
    if (align === "left") pad.right = Math.max(pad.right, block.width + clearance);
    else if (align === "right") pad.left = Math.max(pad.left, block.width + clearance);
    else if (Math.sin(sector.angle) < 0) pad.top = Math.max(pad.top, block.height + clearance);
    else pad.bottom = Math.max(pad.bottom, block.height + clearance);
  }
  if (labels && scene.orphans.length > 0) pad.bottom += scaledLabelFontSize("element", 1) * ORPHAN_CAPTION_LINES;
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
