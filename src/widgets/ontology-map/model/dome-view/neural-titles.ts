export interface TitleBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TitleCandidate {
  id: string;
  /** Where the title would stand, above its own cluster. */
  box: TitleBox;
  /** The cluster's drawn disc. */
  disc: { x: number; y: number; r: number };
  /** Larger is farther from the reader. */
  depth: number;
}

const boxesMeet = (a: TitleBox, b: TitleBox) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

function boxMeetsDisc(box: TitleBox, disc: { x: number; y: number; r: number }): boolean {
  const nx = Math.min(Math.max(disc.x, box.minX), box.maxX);
  const ny = Math.min(Math.max(disc.y, box.minY), box.maxY);
  return Math.hypot(disc.x - nx, disc.y - ny) < disc.r;
}

/**
 * The domain titles that stand: nearest first, a title gives way when it would sit on another
 * cluster's disc, on a nearer title or on a fixed label such as the project's. O(k² + k·f).
 */
export function standingDomainTitles(candidates: readonly TitleCandidate[], fixedLabels: readonly TitleBox[] = []): Set<string> {
  const nearestFirst = [...candidates].sort((a, b) => a.depth - b.depth);
  const standing: TitleCandidate[] = [];
  for (const c of nearestFirst) {
    if (standing.some((s) => boxesMeet(s.box, c.box))) continue;
    if (fixedLabels.some((label) => boxesMeet(label, c.box))) continue;
    if (candidates.some((o) => o.id !== c.id && boxMeetsDisc(c.box, o.disc))) continue;
    standing.push(c);
  }
  return new Set(standing.map((s) => s.id));
}
