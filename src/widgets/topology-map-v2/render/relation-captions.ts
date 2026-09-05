export interface CaptionBox { minX: number; minY: number; maxX: number; maxY: number }
export interface RelationCaption { edgeId: string; text: string; x: number; y: number; priority: number }
export type PlacedRelationCaption = RelationCaption & CaptionBox;

export function relationCaptionText(label: string, from: { x: number; y: number }, to: { x: number; y: number }, directional: boolean): string {
  if (!directional) return label;
  const direction = (Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) + 8) % 8;
  return `${['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][direction]} ${label}`;
}

/** Captions explain visible edges without covering a concept, another label, or chrome. */
export function placeRelationCaptions(
  candidates: readonly RelationCaption[],
  reserved: readonly CaptionBox[],
  safe: { left: number; right: number; top: number; bottom: number },
  measure: (text: string) => number,
  height: number,
  limit = 24,
): PlacedRelationCaption[] {
  const placed: PlacedRelationCaption[] = [];
  const overlaps = (left: CaptionBox, right: CaptionBox) => left.minX < right.maxX && left.maxX > right.minX && left.minY < right.maxY && left.maxY > right.minY;
  for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.edgeId.localeCompare(b.edgeId))) {
    if (placed.length >= limit) break;
    const width = measure(candidate.text) + 8;
    const box = { ...candidate, minX: candidate.x - width / 2, maxX: candidate.x + width / 2, minY: candidate.y - height / 2, maxY: candidate.y + height / 2 };
    if (![box.minX, box.maxX, box.minY, box.maxY].every(Number.isFinite)
      || box.minX < safe.left || box.maxX > safe.right || box.minY < safe.top || box.maxY > safe.bottom
      || reserved.some((item) => overlaps(box, item)) || placed.some((item) => overlaps(box, item))) continue;
    placed.push(box);
  }
  return placed;
}
