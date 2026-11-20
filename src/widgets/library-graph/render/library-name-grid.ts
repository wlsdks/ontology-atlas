/** About two lines of a name tall and a short word wide, so a name spans a handful of cells. */
const CELL_PX = 32;

/**
 * Name boxes bucketed on the canvas in typed arrays that are cleared, not reallocated, per
 * frame: O(cells + boxes) to reset, O(boxes in the cells a query spans) per query. Cells are
 * clamped to the canvas, which keeps every overlapping pair in a shared cell, so it stays exact.
 */
export class LibraryNameGrid {
  private columns = 0;
  private rows = 0;
  /** Per cell, the first entry listed in it, or -1. */
  private head = new Int32Array(0);
  /** Per entry, the next entry in the same cell, or -1. */
  private next = new Int32Array(64);
  /** Per entry, the box it lists. */
  private item = new Int32Array(64);
  /** Per box, its x, y, width and height. */
  private boxes = new Float64Array(64 * 4);
  private entries = 0;
  private count = 0;

  reset(width: number, height: number): void {
    this.columns = Math.max(1, Math.ceil(width / CELL_PX));
    this.rows = Math.max(1, Math.ceil(height / CELL_PX));
    const cells = this.columns * this.rows;
    if (this.head.length < cells) this.head = new Int32Array(cells);
    this.head.fill(-1, 0, cells);
    this.entries = 0;
    this.count = 0;
  }

  /** Whether a held box overlaps `x, y, width, height` grown by `gapX` across and `gapY` down. */
  blocks(x: number, y: number, width: number, height: number, gapX: number, gapY: number): boolean {
    const x0 = this.column(x - gapX), x1 = this.column(x + width + gapX);
    const y0 = this.row(y - gapY), y1 = this.row(y + height + gapY);
    const boxes = this.boxes;
    for (let row = y0; row <= y1; row += 1) {
      for (let column = x0; column <= x1; column += 1) {
        for (let entry = this.head[row * this.columns + column]; entry !== -1; entry = this.next[entry]) {
          const at = this.item[entry] * 4;
          if (x - gapX < boxes[at] + boxes[at + 2] && x + width + gapX > boxes[at] &&
            y - gapY < boxes[at + 1] + boxes[at + 3] && y + height + gapY > boxes[at + 1]) return true;
        }
      }
    }
    return false;
  }

  add(x: number, y: number, width: number, height: number): void {
    if ((this.count + 1) * 4 > this.boxes.length) this.boxes = grown(this.boxes);
    const index = this.count;
    this.count += 1;
    const at = index * 4;
    this.boxes[at] = x;
    this.boxes[at + 1] = y;
    this.boxes[at + 2] = width;
    this.boxes[at + 3] = height;
    const x0 = this.column(x), x1 = this.column(x + width);
    const y0 = this.row(y), y1 = this.row(y + height);
    for (let row = y0; row <= y1; row += 1) {
      for (let column = x0; column <= x1; column += 1) {
        if (this.entries === this.next.length) {
          this.next = grown(this.next);
          this.item = grown(this.item);
        }
        const cell = row * this.columns + column;
        this.next[this.entries] = this.head[cell];
        this.item[this.entries] = index;
        this.head[cell] = this.entries;
        this.entries += 1;
      }
    }
  }

  private column(x: number): number {
    return Math.min(this.columns - 1, Math.max(0, Math.floor(x / CELL_PX)));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL_PX)));
  }
}

function grown<T extends Int32Array | Float64Array>(array: T): T {
  const next = new (array.constructor as new (length: number) => T)(array.length * 2);
  next.set(array);
  return next;
}
