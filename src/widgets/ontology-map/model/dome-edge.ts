import type { DomeArrangement, DomeNodeFrame } from './dome-view';

interface EdgeCoordinates {
  sourceId: string;
  targetId: string;
  kind: 'contains' | 'depends';
  ax: number;
  ay: number;
  bx: number;
  by: number;
  controlX: number;
  controlY: number;
}

/**
 * One projected curve for paint, picking, and measurement. Coordinates include
 * the current assembly/morph/orbit frame, so a curve cannot outrun its endpoints.
 * Containment stays straight in Cone/Strata. Neural branches and other relations
 * take shallow arcs; their control offset is capped at one small node diameter
 * in screen space, even when zoomed in. Reciprocal relations bow opposite ways.
 */
export function projectDomeEdgeControl(
  edge: EdgeCoordinates,
  frame: ReadonlyMap<string, DomeNodeFrame> | null,
  arrangement: DomeArrangement,
  cameraScale: number,
  neuralMix = arrangement === 'coupling' ? 1 : 0,
): { x: number; y: number } {
  const a = frame?.get(edge.sourceId);
  const b = frame?.get(edge.targetId);
  const ax = edge.ax + (a?.dx ?? 0);
  const ay = edge.ay + (a?.dy ?? 0);
  const bx = edge.bx + (b?.dx ?? 0);
  const by = edge.by + (b?.dy ?? 0);
  const flatX = edge.controlX + ((a?.dx ?? 0) + (b?.dx ?? 0)) / 2;
  const flatY = edge.controlY + ((a?.dy ?? 0) + (b?.dy ?? 0)) / 2;
  const ramp = Math.min(a?.a ?? 0, b?.a ?? 0);
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const branchMix = edge.kind === 'depends' ? 1 : Math.min(1, Math.max(0, neuralMix));
  const curved = branchMix > 0;
  const bow = curved && length > 1e-6
    ? Math.min(length * (edge.kind === 'contains' ? 0.06 : 0.1), 16 / Math.max(cameraScale, 1e-6)) * branchMix
    : 0;
  const x = (ax + bx) / 2 - (length > 1e-6 ? dy / length * bow : 0);
  const y = (ay + by) / 2 + (length > 1e-6 ? dx / length * bow : 0);
  return { x: flatX + (x - flatX) * ramp, y: flatY + (y - flatY) * ramp };
}
