const CELL_SIZE = 8;
const MAX_CELLS = 65_536;

export class LibraryLabelCoverage {
  private readonly first: Array<string | undefined>;
  private readonly crowded: boolean[];

  private constructor(private readonly columns: number, private readonly rows: number) {
    this.first = new Array(columns * rows).fill(undefined);
    this.crowded = new Array(columns * rows).fill(false);
  }

  static create(width: number, height: number): LibraryLabelCoverage | null {
    const columns = Math.ceil(width / CELL_SIZE), rows = Math.ceil(height / CELL_SIZE);
    if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns <= 0 || rows <= 0 || columns * rows > MAX_CELLS) return null;
    return new LibraryLabelCoverage(columns, rows);
  }

  add(id: string, left: number, top: number, right: number, bottom: number): void {
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) return;
    const epsilon = Math.max(1e-7, Math.max(Math.abs(left), Math.abs(top), Math.abs(right), Math.abs(bottom)) * Number.EPSILON * 16);
    const x0 = Math.max(0, Math.floor((left + epsilon) / CELL_SIZE) + 1);
    const x1 = Math.min(this.columns - 1, Math.ceil((right - epsilon) / CELL_SIZE) - 2);
    const y0 = Math.max(0, Math.floor((top + epsilon) / CELL_SIZE) + 1);
    const y1 = Math.min(this.rows - 1, Math.ceil((bottom - epsilon) / CELL_SIZE) - 2);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const index = y * this.columns + x;
        if (this.first[index] === undefined) this.first[index] = id;
        else if (this.first[index] !== id) this.crowded[index] = true;
      }
    }
  }

  blocksLine(x: number, y: number, height: number): boolean {
    const column = Math.floor(x / CELL_SIZE);
    if (column < 0 || column >= this.columns) return false;
    const first = Math.max(0, Math.floor(y / CELL_SIZE));
    const last = Math.min(this.rows - 1, Math.floor((y + height) / CELL_SIZE));
    for (let row = first; row <= last; row += 1) {
      if (this.crowded[row * this.columns + column]) return true;
    }
    return false;
  }
}
