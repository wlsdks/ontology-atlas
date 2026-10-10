import { drawInstrumentCaption } from "../../render/labels";
import type { FrameInputs } from "./frame-begin";
import type { FrameFocus } from "./frame-focus";
import type { NodeLayer } from "./node-layer";

const WARDING_CAPTION_OFFSET_PX = 24;
const WARDING_CAPTION_ALPHA = 0.62;

export function paintWardingRing(frame: FrameInputs, focus: FrameFocus, layer: NodeLayer): void {
  const { wardingRing, camera, tokens } = frame;
  const { project } = focus;
  const { ctx } = layer;
  if (wardingRing !== null) {
    const center = project(wardingRing.centerX, wardingRing.centerY);
    const screenRadius = wardingRing.radius * camera.scale.value;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = tokens.indigo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const start = -Math.PI / 2;
    ctx.arc(center.x, center.y, Math.max(0, screenRadius), start, start + Math.PI * 2 * wardingRing.drawProgress);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;

    if (wardingRing.caption && wardingRing.drawProgress > 0.05) {
      drawInstrumentCaption(
        ctx,
        wardingRing.caption,
        center.x,
        center.y + screenRadius + WARDING_CAPTION_OFFSET_PX,
        tokens.labelDomain,
        WARDING_CAPTION_ALPHA * wardingRing.drawProgress);
    }
  }
}
