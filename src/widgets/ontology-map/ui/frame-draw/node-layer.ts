import { domeFogAlpha } from "../../model/dome-view";
import { addStrataLodDust, createStrataLodDust, drawStrataLodDust, resetStrataLodDust } from "../../render/strata-lod";
import type { ReservedBox } from "../../render/label-layout";
import { isPreviewEndpointHidden } from "../../render/preview-edge";
import { S, domeNodeFrameReused, drawnScreenRadiusByIdReused, lodDustByState } from "./frame-state";
import { type FrameScope } from "./frame-scope";

const lodDust = createStrataLodDust();

// `nodeLayer` may wrap the context; every later pass paints through the wrapped one.
export function beginNodeLayer(F: FrameScope): void {
  const { params, domeLight, world, clusteredIds, previewEdge, viewportWidth, viewportHeight, camX,
    camY, camScale, halfW, halfH, litFocusRamp, lod } = F;
  let { ctx } = F;
    ctx = params.nodeLayer?.(ctx) ?? ctx;
    drawnScreenRadiusByIdReused.clear();
    const drawnScreenRadiusById = drawnScreenRadiusByIdReused;
    const nodeDiscReservations: ReservedBox[] = [];
    lodDustByState.current = 0;
    lodDustByState.stale = 0;
    lodDustByState.unknown = 0;
    if (lod !== null && domeLight !== null) {
        resetStrataLodDust(lodDust);
        const shown = lod.evidence;
        const was = lod.evidenceWas;
        const evidenceRamp = lod.evidenceRamp;
        for (let i = 0; i < world.nodes.length; i += 1) {
            const node = world.nodes[i];
            if (node.kind !== "capability" && node.kind !== "element")
                continue;
            const frame = domeNodeFrameReused[i];
            if (frame.a <= 0.01)
                continue;
            const weight = frame.a * (1 - S.lodPresenceReused[i]);
            if (weight <= 0.01)
                continue;
            if (isPreviewEndpointHidden(clusteredIds.has(node.id), previewEdge, node.id))
                continue;
            const x = (node.x + frame.dx - camX) * camScale + halfW;
            const y = (node.y + frame.dy - camY) * camScale + halfH;
            if (x < -4 || y < -4 || x > viewportWidth + 4 || y > viewportHeight + 4)
                continue;
            const to = shown?.get(node.id) ?? "unknown";
            const from = evidenceRamp >= 1 ? to : (was?.get(node.id) ?? "unknown");
            if (from === to) {
                addStrataLodDust(lodDust, node.kind, to, frame.u, weight, x, y);
            }
            else {
                addStrataLodDust(lodDust, node.kind, from, frame.u, weight * (1 - evidenceRamp), x, y);
                addStrataLodDust(lodDust, node.kind, to, frame.u, weight * evidenceRamp, x, y);
            }
        }
        S.lodDustDrawn = drawStrataLodDust(ctx, lodDust, { kindRgb: domeLight.kindRgb, warningRgb: domeLight.warningRgb }, domeFogAlpha, 1 - 0.55 * litFocusRamp, lodDustByState);
    }
    else {
        S.lodDustDrawn = 0;
    }
  F.ctx = ctx;
  F.drawnScreenRadiusById = drawnScreenRadiusById;
  F.nodeDiscReservations = nodeDiscReservations;
}
