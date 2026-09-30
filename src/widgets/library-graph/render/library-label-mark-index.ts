import type { LibraryGraphNode } from "../model/build-library-graph";
import type { LayoutPoint } from "../model/library-graph-layout";

const CELL_SIZE = 64;
const MAX_QUERY_CELLS = 2048;

export class LibraryLabelMarkIndex {
  private readonly rows = new Map<number, Map<number, LibraryGraphNode | LibraryGraphNode[]>>();
  private readonly missing: LibraryGraphNode[] = [];

  constructor(nodes: readonly LibraryGraphNode[], positions: ReadonlyMap<string, LayoutPoint>) {
    for (const node of nodes) {
      const point = positions.get(node.id);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        this.missing.push(node);
        continue;
      }
      const x = Math.floor(point.x / CELL_SIZE);
      const y = Math.floor(point.y / CELL_SIZE);
      let row = this.rows.get(y);
      if (!row) { row = new Map(); this.rows.set(y, row); }
      const cell = row.get(x);
      if (!cell) row.set(x, node);
      else if (Array.isArray(cell)) cell.push(node);
      else row.set(x, [cell, node]);
    }
  }

  private hits(cell: LibraryGraphNode | LibraryGraphNode[] | undefined, test: (node: LibraryGraphNode) => boolean): boolean {
    if (!cell) return false;
    if (!Array.isArray(cell)) return test(cell);
    for (const node of cell) if (test(node)) return true;
    return false;
  }

  some(left: number, top: number, right: number, bottom: number, test: (node: LibraryGraphNode) => boolean): boolean {
    for (const id of this.missing) if (test(id)) return true;
    const x0 = Math.floor(left / CELL_SIZE), x1 = Math.floor(right / CELL_SIZE);
    const y0 = Math.floor(top / CELL_SIZE), y1 = Math.floor(bottom / CELL_SIZE);
    if ([x0, x1, y0, y1].every(Number.isSafeInteger) &&
      (x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_QUERY_CELLS) {
      for (let y = y0; y <= y1; y += 1) {
        const row = this.rows.get(y);
        if (!row) continue;
        for (let x = x0; x <= x1; x += 1) {
          if (this.hits(row.get(x), test)) return true;
        }
      }
    } else {
      for (const [y, row] of this.rows) {
        if (y < y0 || y > y1) continue;
        for (const [x, cell] of row) {
          if (x < x0 || x > x1) continue;
          if (this.hits(cell, test)) return true;
        }
      }
    }
    return false;
  }
}
