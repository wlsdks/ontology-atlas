import type { LibraryGraphNode } from "../model/build-library-graph";
import type { LayoutPoint } from "../model/library-graph-layout";

const CELL_SIZE = 8;
const MAX_QUERY_CELLS = 2048;

export class LibraryLabelMarkIndex {
  private readonly rows = new Map<number, Map<number, number | number[]>>();
  private readonly missing: number[] = [];
  private readonly xs: number[];
  private readonly ys: number[];

  constructor(private readonly nodes: readonly LibraryGraphNode[], positions: ReadonlyMap<string, LayoutPoint>) {
    this.xs = new Array(nodes.length).fill(Number.NaN);
    this.ys = new Array(nodes.length).fill(Number.NaN);
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const point = positions.get(node.id);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        this.missing.push(index);
        continue;
      }
      this.xs[index] = point.x;
      this.ys[index] = point.y;
      const x = Math.floor(point.x / CELL_SIZE);
      const y = Math.floor(point.y / CELL_SIZE);
      let row = this.rows.get(y);
      if (!row) { row = new Map(); this.rows.set(y, row); }
      const cell = row.get(x);
      if (cell === undefined) row.set(x, index);
      else if (Array.isArray(cell)) cell.push(index);
      else row.set(x, [cell, index]);
    }
  }

  private hits(cell: number | number[] | undefined, left: number, top: number, right: number, bottom: number,
    test: (node: LibraryGraphNode) => boolean): boolean {
    if (cell === undefined) return false;
    const accepts = (index: number) => {
      if (this.xs[index] < left || this.xs[index] > right || this.ys[index] < top || this.ys[index] > bottom) return false;
      return test(this.nodes[index]);
    };
    if (!Array.isArray(cell)) return accepts(cell);
    for (const index of cell) if (accepts(index)) return true;
    return false;
  }

  some(left: number, top: number, right: number, bottom: number, test: (node: LibraryGraphNode) => boolean): boolean {
    for (const index of this.missing) if (test(this.nodes[index])) return true;
    const x0 = Math.floor(left / CELL_SIZE), x1 = Math.floor(right / CELL_SIZE);
    const y0 = Math.floor(top / CELL_SIZE), y1 = Math.floor(bottom / CELL_SIZE);
    if ([x0, x1, y0, y1].every(Number.isSafeInteger) &&
      (x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_QUERY_CELLS) {
      for (let y = y0; y <= y1; y += 1) {
        const row = this.rows.get(y);
        if (!row) continue;
        for (let x = x0; x <= x1; x += 1) {
          if (this.hits(row.get(x), left, top, right, bottom, test)) return true;
        }
      }
    } else {
      for (const [y, row] of this.rows) {
        if (y < y0 || y > y1) continue;
        for (const [x, cell] of row) {
          if (x < x0 || x > x1) continue;
          if (this.hits(cell, left, top, right, bottom, test)) return true;
        }
      }
    }
    return false;
  }
}
