/** Past this many cells a box or query skips the grid: a non-finite or huge extent is listed or scanned. */
const BOX_GRID_MAX_SPAN_CELLS = 1024;

/**
 * Boxes bucketed on a fixed screen grid, so a test asks only the boxes near it: O(1) expected per
 * add and per query at bounded density, where testing every placed box was O(k²) a frame.
 * Exact: a query visits every box whose extent meets it grown by its margin, each once.
 */
export class BoxGrid<T extends { x: number; y: number }> {
  private readonly items: T[] = [];
  private readonly cells = new Map<number, number[]>();
  /** Boxes too wide or non-finite to bucket, visited by every query. */
  private readonly unbucketed: number[] = [];
  private stamp = 0;
  private seen = new Uint32Array(64);

  private readonly cell: number;
  private readonly extent: (item: T) => { left: number; top: number; right: number; bottom: number };

  constructor(cell: number, extent: (item: T) => { left: number; top: number; right: number; bottom: number }) {
    this.cell = cell;
    this.extent = extent;
  }

  private bucketable(x0: number, x1: number, y0: number, y1: number): boolean {
    return Number.isFinite(x0 + x1 + y0 + y1) && x1 >= x0 && y1 >= y0 &&
      (x1 - x0 + 1) * (y1 - y0 + 1) <= BOX_GRID_MAX_SPAN_CELLS;
  }

  add(item: T): void {
    const index = this.items.length;
    this.items.push(item);
    if (index >= this.seen.length) {
      const grown = new Uint32Array(this.seen.length * 2);
      grown.set(this.seen);
      this.seen = grown;
    }
    const { left, top, right, bottom } = this.extent(item);
    const x0 = Math.floor(left / this.cell);
    const x1 = Math.floor(right / this.cell);
    const y0 = Math.floor(top / this.cell);
    const y1 = Math.floor(bottom / this.cell);
    if (!this.bucketable(x0, x1, y0, y1)) {
      this.unbucketed.push(index);
      return;
    }
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        const key = (cx + 0x8000) * 0x10000 + (cy + 0x8000);
        const held = this.cells.get(key);
        if (held) held.push(index);
        else this.cells.set(key, [index]);
      }
    }
  }

  /** Every item whose extent meets the box grown by `margin`, each once. */
  each(box: { x: number; y: number; width: number; height: number }, margin: number, visit: (item: T) => void): void {
    this.some(box, margin, (item) => {
      visit(item);
      return false;
    });
  }

  some(box: { x: number; y: number; width: number; height: number }, margin: number, test: (item: T) => boolean): boolean {
    this.stamp += 1;
    const stamp = this.stamp;
    const x0 = Math.floor((box.x - margin) / this.cell);
    const x1 = Math.floor((box.x + box.width + margin) / this.cell);
    const y0 = Math.floor((box.y - margin) / this.cell);
    const y1 = Math.floor((box.y + box.height + margin) / this.cell);
    if (!this.bucketable(x0, x1, y0, y1)) return this.items.some(test);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        const held = this.cells.get((cx + 0x8000) * 0x10000 + (cy + 0x8000));
        if (!held) continue;
        for (const index of held) {
          if (this.seen[index] === stamp) continue;
          this.seen[index] = stamp;
          if (test(this.items[index])) return true;
        }
      }
    }
    for (const index of this.unbucketed) if (test(this.items[index])) return true;
    return false;
  }
}
