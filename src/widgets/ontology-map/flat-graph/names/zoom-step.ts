import type { Box, Point } from "../../dial/dial-shapes";

export function zoomStep(scale: number, stepsPerOctave: number): number {
  return Math.round(Math.log2(Math.max(1e-6, scale)) * stepsPerOctave);
}

export function stepScale(step: number, stepsPerOctave: number): number {
  return 2 ** (step / stepsPerOctave);
}

export const CELL_PX = 96;

/** Uniform grid over world-space boxes: insert and overlap queries cost O(cells touched). */
export class Occupancy<T extends Box = Box> {
  private readonly cells = new Map<string, T[]>();
  private readonly cell: number;
  constructor(cell: number) {
    this.cell = cell;
  }

  private keys(b: Box): string[] {
    const out: string[] = [];
    for (let gx = Math.floor(b.minX / this.cell); gx <= Math.floor(b.maxX / this.cell); gx += 1) {
      for (let gy = Math.floor(b.minY / this.cell); gy <= Math.floor(b.maxY / this.cell); gy += 1) out.push(`${gx},${gy}`);
    }
    return out;
  }

  hits(b: Box): boolean {
    return this.count(b, 1) > 0;
  }

  /** Boxes `b` overlaps, counted up to `limit`; a box in several cells counts once per cell. */
  count(b: Box, limit = Infinity): number {
    let n = 0;
    for (const key of this.keys(b)) {
      for (const o of this.cells.get(key) ?? []) {
        if (b.minX < o.maxX && b.maxX > o.minX && b.minY < o.maxY && b.maxY > o.minY && (n += 1) >= limit) return n;
      }
    }
    return n;
  }

  /** Whether `test` holds for a box `b` overlaps; a box in several cells may be tested once per cell. */
  some(b: Box, test: (o: T) => boolean): boolean {
    for (const key of this.keys(b)) {
      for (const o of this.cells.get(key) ?? []) {
        if (b.minX < o.maxX && b.maxX > o.minX && b.minY < o.maxY && b.maxY > o.minY && test(o)) return true;
      }
    }
    return false;
  }

  add(b: T): void {
    for (const key of this.keys(b)) {
      const list = this.cells.get(key);
      if (list) list.push(b);
      else this.cells.set(key, [b]);
    }
  }
}

/**
 * Screen boxes held at the low end, the centre and the high end of a zoom step. The gap between two
 * boxes on an axis is linear in the zoom, so two that overlap nowhere at those three overlap inside
 * the step only where their anchors cross. Insert and query cost three grid lookups.
 */
export class StepOccupancy {
  private readonly grids: readonly Occupancy[];
  private readonly scales: readonly [number, number, number];
  constructor(scales: readonly [number, number, number]) {
    this.scales = scales;
    this.grids = scales.map((scale) => new Occupancy(CELL_PX / scale));
  }

  add(at: Point, rel: Box): void {
    this.grids.forEach((grid, i) => grid.add(worldBox(at, rel, this.scales[i]!)));
  }

  hits(at: Point, rel: Box): boolean {
    return this.grids.some((grid, i) => grid.hits(worldBox(at, rel, this.scales[i]!)));
  }

  hitsAtCentre(at: Point, rel: Box): boolean {
    return this.grids[1]!.hits(worldBox(at, rel, this.scales[1]!));
  }
}

export function worldBox(at: Point, rel: Box, scale: number): Box {
  return { minX: at.x + rel.minX / scale, maxX: at.x + rel.maxX / scale, minY: at.y + rel.minY / scale, maxY: at.y + rel.maxY / scale };
}

/** The world box a screen box covers anywhere between two scales: each edge moves monotonically with 1 / scale. */
export function sweptBox(at: Point, rel: Box, lo: number, hi: number): Box {
  const a = worldBox(at, rel, lo);
  const b = worldBox(at, rel, hi);
  return { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY) };
}

export function grown(b: Box, px: number): Box {
  return { minX: b.minX - px, maxX: b.maxX + px, minY: b.minY - px, maxY: b.maxY + px };
}
