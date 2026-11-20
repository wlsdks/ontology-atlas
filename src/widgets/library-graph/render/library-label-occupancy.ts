/** Fine enough that a name grazing a dense column's edge still finds a certificate; see the off-grid work test. */
const CELL_PX = 2;
/** 2,048 × 1,024 cells, 16 MB with both Int32 rasters; a larger canvas skips the raster. */
const MAX_CELLS = 1 << 21;
const SHARED = -1;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Per cell: 0 when unmarked, the marking owner's id plus one, or {@link SHARED} for two owners or an ownerless box. */
class CellOwners {
  readonly cells: Int32Array;
  private readonly columns: number;
  private readonly rows: number;

  constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
    this.cells = new Int32Array(columns * rows);
  }

  mark(owner: number, x0: number, x1: number, y0: number, y1: number): void {
    const cells = this.cells;
    for (let y = Math.max(0, y0); y <= Math.min(this.rows - 1, y1); y += 1) {
      for (let x = Math.max(0, x0); x <= Math.min(this.columns - 1, x1); x += 1) {
        const index = y * this.columns + x;
        const held = cells[index];
        if (held === 0) cells[index] = owner;
        else if (held !== owner) cells[index] = SHARED;
      }
    }
  }

  /** Whether any cell in the range is marked by anything but `own`. */
  other(own: number, x0: number, x1: number, y0: number, y1: number): boolean {
    const cells = this.cells;
    for (let y = Math.max(0, y0); y <= Math.min(this.rows - 1, y1); y += 1) {
      for (let x = Math.max(0, x0); x <= Math.min(this.columns - 1, x1); x += 1) {
        const held = cells[y * this.columns + x];
        if (held !== 0 && held !== own) return true;
      }
    }
    return false;
  }
}

/**
 * Two exact certificates that a box overlaps a taken one within the gap: a cell wholly inside a
 * taken box's gap that the box meets, or a cell wholly inside the box's own gap that a taken box
 * meets. Each answers in O(cells the box spans) however dense the marks; a miss proves nothing.
 */
export class LibraryLabelOccupancy {
  /** Cells wholly inside a taken box grown by the gap. */
  private readonly inGap: CellOwners;
  /** Cells a taken box of non-negative size meets. */
  private readonly met: CellOwners;
  private readonly columns: number;
  private readonly rows: number;
  private readonly gapX: number;
  private readonly gapY: number;

  private constructor(columns: number, rows: number, gapX: number, gapY: number) {
    this.columns = columns;
    this.rows = rows;
    this.gapX = gapX;
    this.gapY = gapY;
    this.inGap = new CellOwners(columns, rows);
    this.met = new CellOwners(columns, rows);
  }

  /** An empty raster for the canvas, clearing `reuse` in O(cells) when it has the same shape. */
  static create(width: number, height: number, gapX: number, gapY: number, reuse?: LibraryLabelOccupancy | null): LibraryLabelOccupancy | null {
    const columns = Math.ceil(width / CELL_PX), rows = Math.ceil(height / CELL_PX);
    if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns <= 0 || rows <= 0 || columns * rows > MAX_CELLS) return null;
    if (reuse && reuse.columns === columns && reuse.rows === rows && reuse.gapX === gapX && reuse.gapY === gapY) {
      reuse.inGap.cells.fill(0);
      reuse.met.cells.fill(0);
      return reuse;
    }
    return new LibraryLabelOccupancy(columns, rows, gapX, gapY);
  }

  /** Takes a box for `owner`, a non-negative integer; a negative owner's box blocks every box. */
  hold(owner: number, x: number, y: number, width: number, height: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return;
    const id = owner < 0 ? SHARED : owner + 1;
    // Shrunk by a few ulps, so a cell counted inside is inside under the caller's rounding too.
    const left = x - this.gapX, top = y - this.gapY, right = x + width + this.gapX, bottom = y + height + this.gapY;
    const epsilon = Math.max(1e-7, Math.max(Math.abs(left), Math.abs(top), Math.abs(right), Math.abs(bottom)) * Number.EPSILON * 16);
    this.inGap.mark(id,
      Math.floor((left + epsilon) / CELL_PX) + 1, Math.ceil((right - epsilon) / CELL_PX) - 2,
      Math.floor((top + epsilon) / CELL_PX) + 1, Math.ceil((bottom - epsilon) / CELL_PX) - 2);
    if (width < 0 || height < 0) return;
    this.met.mark(id,
      Math.floor(x / CELL_PX), Math.floor((x + width) / CELL_PX),
      Math.floor(y / CELL_PX), Math.floor((y + height) / CELL_PX));
  }

  /** True only if a box held by anything but `own` overlaps `box` grown by the gap. */
  blocks(box: Box, own: number): boolean {
    const { x, y, width, height } = box;
    // An owner never held marks no cell, so any marked cell is another's.
    const id = own + 1;
    if (this.inGap.other(id,
      Math.floor(x / CELL_PX), Math.floor((x + width) / CELL_PX),
      Math.floor(y / CELL_PX), Math.floor((y + height) / CELL_PX))) return true;
    // The same sums the exact test compares, so a cell inside them is inside its bounds.
    const left = x - this.gapX, top = y - this.gapY, right = x + width + this.gapX, bottom = y + height + this.gapY;
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) return false;
    return this.met.other(id,
      Math.floor(left / CELL_PX) + 1, Math.ceil(right / CELL_PX) - 2,
      Math.floor(top / CELL_PX) + 1, Math.ceil(bottom / CELL_PX) - 2);
  }
}
