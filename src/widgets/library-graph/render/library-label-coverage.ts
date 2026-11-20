const CELL_SIZE = 8;
const MAX_CELLS = 65_536;

export class LibraryLabelCoverage {
  /** Per cell, the first owner plus one to cover it, or 0. */
  private readonly first: Int32Array;
  private readonly crowded: Uint8Array;

  private readonly columns: number;
  private readonly rows: number;

  private constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
    this.first = new Int32Array(columns * rows);
    this.crowded = new Uint8Array(columns * rows);
  }

  /** An empty coverage for the canvas, clearing `reuse` in O(cells) when it has the same shape. */
  static create(width: number, height: number, reuse?: LibraryLabelCoverage | null): LibraryLabelCoverage | null {
    const columns = Math.ceil(width / CELL_SIZE), rows = Math.ceil(height / CELL_SIZE);
    if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns <= 0 || rows <= 0 || columns * rows > MAX_CELLS) return null;
    if (reuse && reuse.columns === columns && reuse.rows === rows) {
      reuse.first.fill(0);
      reuse.crowded.fill(0);
      return reuse;
    }
    return new LibraryLabelCoverage(columns, rows);
  }

  /** Covers the cells wholly inside the box for `owner`, a non-negative integer. */
  add(owner: number, left: number, top: number, right: number, bottom: number): void {
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) return;
    const epsilon = Math.max(1e-7, Math.max(Math.abs(left), Math.abs(top), Math.abs(right), Math.abs(bottom)) * Number.EPSILON * 16);
    const x0 = Math.max(0, Math.floor((left + epsilon) / CELL_SIZE) + 1);
    const x1 = Math.min(this.columns - 1, Math.ceil((right - epsilon) / CELL_SIZE) - 2);
    const y0 = Math.max(0, Math.floor((top + epsilon) / CELL_SIZE) + 1);
    const y1 = Math.min(this.rows - 1, Math.ceil((bottom - epsilon) / CELL_SIZE) - 2);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const index = y * this.columns + x;
        if (this.first[index] === 0) this.first[index] = owner + 1;
        else if (this.first[index] !== owner + 1) this.crowded[index] = 1;
      }
    }
  }

  blocksLine(x: number, y: number, height: number): boolean {
    const column = Math.floor(x / CELL_SIZE);
    if (column < 0 || column >= this.columns) return false;
    const first = Math.max(0, Math.floor(y / CELL_SIZE));
    const last = Math.min(this.rows - 1, Math.floor((y + height) / CELL_SIZE));
    for (let row = first; row <= last; row += 1) {
      if (this.crowded[row * this.columns + column] === 1) return true;
    }
    return false;
  }
}
