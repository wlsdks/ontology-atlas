export interface PreviewEdgeDrawInput {
  source: { x: number; y: number };
  target: { x: number; y: number };
  sourceRadius: number;
  targetRadius: number;
  alpha: number;
  solid: boolean;
  /** 0..1 settle from dashed draft to solid committed relation. */
  solidProgress?: number;
  color: string;
}

export interface PreviewEdgeIdentity {
  sourceId: string;
  targetId: string;
}

export function isPreviewEndpoint(
  preview: PreviewEdgeIdentity | null | undefined,
  nodeId: string,
): boolean {
  return preview !== null && preview !== undefined &&
    (nodeId === preview.sourceId || nodeId === preview.targetId);
}

export function isPreviewEndpointHidden(
  clustered: boolean,
  preview: PreviewEdgeIdentity | null | undefined,
  nodeId: string,
): boolean {
  return clustered && !isPreviewEndpoint(preview, nodeId);
}

const DRAFT_DASH = [6, 5] as const;
const ARROW_LENGTH = 8;
const ARROW_HALF_ANGLE = Math.PI / 7;
const NODE_GAP = 3;

/**
 * Paints only over the current frame. It never enters TopologyWorld, so a
 * proposed relation cannot pull either endpoint or change force/layout input.
 */
export function drawPreviewEdge(
  ctx: CanvasRenderingContext2D,
  input: PreviewEdgeDrawInput,
): void {
  const alpha = Math.min(1, Math.max(0, input.alpha));
  if (alpha <= 0) return;
  const dx = input.target.x - input.source.x;
  const dy = input.target.y - input.source.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;

  const angle = Math.atan2(dy, dx);
  const unitX = dx / distance;
  const unitY = dy / distance;
  const sourceInset = Math.max(0, input.sourceRadius) + NODE_GAP;
  const targetInset = Math.max(0, input.targetRadius) + NODE_GAP;
  if (distance <= sourceInset + targetInset + 1) return;
  const start = {
    x: input.source.x + unitX * sourceInset,
    y: input.source.y + unitY * sourceInset,
  };
  const end = {
    x: input.target.x - unitX * targetInset,
    y: input.target.y - unitY * targetInset,
  };
  ctx.save();
  const baseAlpha = ctx.globalAlpha * alpha;
  ctx.strokeStyle = input.color;
  ctx.fillStyle = input.color;
  const solidProgress = input.solid
    ? Math.min(1, Math.max(0, input.solidProgress ?? 1))
    : 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const strokeLine = (dash: readonly number[], lineAlpha: number, width: number) => {
    if (lineAlpha <= 0.001) return;
    ctx.globalAlpha = baseAlpha * lineAlpha;
    ctx.lineWidth = width;
    ctx.setLineDash([...dash]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  };
  strokeLine(DRAFT_DASH, 1 - solidProgress, 1.5);
  strokeLine([], solidProgress, 2);

  // Direction has its own shape channel; colour is never the only encoding.
  ctx.globalAlpha = baseAlpha;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - ARROW_LENGTH * Math.cos(angle - ARROW_HALF_ANGLE),
    end.y - ARROW_LENGTH * Math.sin(angle - ARROW_HALF_ANGLE),
  );
  ctx.lineTo(
    end.x - ARROW_LENGTH * Math.cos(angle + ARROW_HALF_ANGLE),
    end.y - ARROW_LENGTH * Math.sin(angle + ARROW_HALF_ANGLE),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
