export interface CaptionBox { minX: number; minY: number; maxX: number; maxY: number }
export type CaptionReservation = CaptionBox & { sunk?: boolean };
export interface RelationCaption { edgeId: string; text: string; x: number; y: number; priority: number; normal?: { x: number; y: number } }
export type PlacedRelationCaption = Omit<RelationCaption, 'normal'> & CaptionBox;

export function relationCaptionText(label: string, from: { x: number; y: number }, to: { x: number; y: number }, directional: boolean): string {
  if (!directional) return label;
  const direction = (Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) + 8) % 8;
  return `${['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][direction]} ${label}`;
}

export function captionNormal(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return undefined;
  const sign = dx !== 0 ? Math.sign(dx) : Math.sign(dy);
  return { x: (sign * dy) / length, y: (-sign * dx) / length };
}

export function captionWithinFlatBudget(edge: {
  attended: boolean;
  touchesFocus: boolean;
  spine: boolean;
  folded: boolean;
}): boolean {
  if (edge.attended) return true;
  if (edge.folded) return false;
  return edge.touchesFocus || edge.spine;
}

export function placeRelationCaptions(
  candidates: readonly RelationCaption[],
  reserved: readonly CaptionReservation[],
  safe: { left: number; right: number; top: number; bottom: number },
  measure: (text: string) => number,
  height: number,
  limit = 24,
): PlacedRelationCaption[] {
  const placed: PlacedRelationCaption[] = [];
  const overlaps = (left: CaptionBox, right: CaptionBox) => left.minX < right.maxX && left.maxX > right.minX && left.minY < right.maxY && left.maxY > right.minY;
  const fits = (box: CaptionBox) => [box.minX, box.maxX, box.minY, box.maxY].every(Number.isFinite)
    && box.minX >= safe.left && box.maxX <= safe.right && box.minY >= safe.top && box.maxY <= safe.bottom
    && !reserved.some((item) => !item.sunk && overlaps(box, item)) && !placed.some((item) => overlaps(box, item));
  for (const { normal, ...candidate } of [...candidates].sort((a, b) => b.priority - a.priority || (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0))) {
    if (placed.length >= limit) break;
    const width = measure(candidate.text) + 8;
    for (const side of normal ? [0, 1, -1, 2, -2] : [0]) {
      const x = candidate.x + side * height * (normal?.x ?? 0);
      const y = candidate.y + side * height * (normal?.y ?? 0);
      const box = { ...candidate, x, y, minX: x - width / 2, maxX: x + width / 2, minY: y - height / 2, maxY: y + height / 2 };
      if (!fits(box)) continue;
      placed.push(box);
      break;
    }
  }
  return placed;
}
