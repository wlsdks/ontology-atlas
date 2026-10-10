import { isPathLensNode } from "../../model/path-lens";
import { measureLabelWidth, scaledLabelFontSize, scaledLabelFont } from "../../render/labels";
import { placeRelationCaptions } from "../../render/relation-captions";
import { isPreviewEndpoint } from "../../render/preview-edge";
import { passState } from "./frame-state";
import type { ReservedBox, SafeRect } from "../../render/label-layout";
import type { FrameInputs } from "./frame-begin";
import type { EdgePrep } from "./edge-prep";
import type { NodeLayer } from "./node-layer";

export function paintRelationCaptions(frame: FrameInputs, edges: EdgePrep, layer: NodeLayer, chipReservations: readonly ReservedBox[], safeRect: SafeRect): void {
  const { mapLensKind, spotlightIds, colorSelectedEdge, colorFocusedNodeId, hoveredNodeId,
    previewEdge, tokens, pathLensActive } = frame;
  const { captionCandidates } = edges;
  const { ctx, nodeDiscReservations } = layer;
  if (captionCandidates.length) {
    const pathSinks = mapLensKind === "path" && spotlightIds !== null && (pathLensActive || (colorSelectedEdge !== null && colorFocusedNodeId === null));
    const sunk = (id: string | undefined) => pathSinks && id !== undefined && id !== hoveredNodeId
      && id !== colorSelectedEdge?.sourceId && id !== colorSelectedEdge?.targetId
      && !isPreviewEndpoint(previewEdge, id) && !isPathLensNode(mapLensKind, id, spotlightIds);
    passState.drawnRelationCaptions = placeRelationCaptions(captionCandidates, [...nodeDiscReservations.map((item) => ({ ...item.bbox, sunk: sunk(item.ownerId) })), ...chipReservations.map((item) => item.bbox), ...passState.drawnLabelBoxes.map((box) => ({ ...box, sunk: sunk(box.nodeId) }))], safeRect, (text) => measureLabelWidth(ctx, 'capability', text, 1), scaledLabelFontSize('capability', 1) + 8);
    ctx.save();
    ctx.font = scaledLabelFont('capability', 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1;
    for (const caption of passState.drawnRelationCaptions) {
      ctx.fillStyle = tokens.canvasBgNear;
      ctx.fillRect(caption.minX, caption.minY, caption.maxX - caption.minX, caption.maxY - caption.minY);
      ctx.fillStyle = tokens.labelCapability;
      ctx.fillText(caption.text, caption.x, caption.y);
    }
    ctx.restore();
  }
}
