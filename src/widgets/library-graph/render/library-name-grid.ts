/** About two lines of a name tall and a short word wide, so a name spans a handful of cells. */
const DEFAULT_CELL_PX = 32;
/** A box spanning more cells than this is kept loose, so one huge mark cannot cost a pass over the canvas. */
const MAX_SPAN_CELLS = 1024;
/** Owner of a box that is nobody's: every query counts it. */
export const NO_OWNER = -1;

/**
 * Boxes in canvas cells held in typed arrays reset per pass, never reallocated once grown: O(cells +
 * boxes) to reset, O(boxes in the spanned cells) per query. Clamped cells keep every overlapping pair
 * in a shared cell and a non-finite or huge box is loose, visited by every query, so answers are exact.
 */
export class LibraryNameGrid {
  private readonly cellPx: number;
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
  /** Per box, its owner, or {@link NO_OWNER}. */
  private owners = new Int32Array(64);
  /** Per box, the query that last visited it, so a box listed in many cells is tested once. */
  private seen = new Uint32Array(64);
  private loose = new Int32Array(16);
  private looseCount = 0;
  private stamp = 0;
  /** Boxes tested by every query so far: the work a pass did, which tests count. */
  visits = 0;
  private entries = 0;
  private count = 0;

  constructor(cellPx = DEFAULT_CELL_PX) {
    this.cellPx = cellPx;
  }

  reset(width: number, height: number): void {
    this.columns = Math.max(1, Math.ceil(width / this.cellPx));
    this.rows = Math.max(1, Math.ceil(height / this.cellPx));
    const cells = this.columns * this.rows;
    if (this.head.length < cells) this.head = new Int32Array(cells);
    this.head.fill(-1, 0, cells);
    this.entries = 0;
    this.count = 0;
    this.looseCount = 0;
  }

  /** Whether a held box not owned by `own` overlaps `x, y, width, height` grown by `gapX` across and `gapY` down. */
  blocks(x: number, y: number, width: number, height: number, gapX: number, gapY: number, own = NO_OWNER - 1): boolean {
    const left = x - gapX, right = x + width + gapX, top = y - gapY, bottom = y + height + gapY;
    const boxes = this.boxes, owners = this.owners;
    const stamp = this.nextStamp();
    const hit = (box: number): boolean => {
      if (this.seen[box] === stamp) return false;
      this.seen[box] = stamp;
      this.visits += 1;
      const at = box * 4;
      return owners[box] !== own && left < boxes[at] + boxes[at + 2] && right > boxes[at] &&
        top < boxes[at + 1] + boxes[at + 3] && bottom > boxes[at + 1];
    };
    if (!Number.isFinite(left + right + top + bottom)) {
      for (let box = 0; box < this.count; box += 1) if (hit(box)) return true;
      return false;
    }
    for (let index = 0; index < this.looseCount; index += 1) if (hit(this.loose[index])) return true;
    const x0 = this.column(left), x1 = this.column(right);
    const y0 = this.row(top), y1 = this.row(bottom);
    for (let row = y0; row <= y1; row += 1) {
      for (let column = x0; column <= x1; column += 1) {
        for (let entry = this.head[row * this.columns + column]; entry !== -1; entry = this.next[entry]) {
          if (hit(this.item[entry])) return true;
        }
      }
    }
    return false;
  }

  /**
   * The room a line from `startX` keeps before the first box not owned by `own` that starts at or
   * past `startX` within `reach` and shares the line's band grown by `gapY`: that box's x less
   * `gapX` less `startX`, or `room` when none is nearer.
   */
  roomRightOf(startX: number, lineTop: number, lineHeight: number, reach: number, gapX: number, gapY: number, own: number, room: number): number {
    const left = startX - gapX, right = startX + reach + gapX, top = lineTop - gapX, bottom = lineTop + lineHeight + gapX;
    const boxes = this.boxes, owners = this.owners;
    const stamp = this.nextStamp();
    let least = room;
    const visit = (box: number): void => {
      if (this.seen[box] === stamp) return;
      this.seen[box] = stamp;
      this.visits += 1;
      const at = box * 4;
      const bx = boxes[at], by = boxes[at + 1];
      if (owners[box] === own || bx < startX) return;
      if (by + boxes[at + 3] + gapY <= lineTop || by - gapY >= lineTop + lineHeight) return;
      least = Math.min(least, bx - gapX - startX);
    };
    if (!Number.isFinite(left + right + top + bottom)) {
      for (let box = 0; box < this.count; box += 1) visit(box);
      return least;
    }
    for (let index = 0; index < this.looseCount; index += 1) visit(this.loose[index]);
    const x0 = this.column(left), x1 = this.column(right);
    const y0 = this.row(top), y1 = this.row(bottom);
    for (let row = y0; row <= y1; row += 1) {
      for (let column = x0; column <= x1; column += 1) {
        for (let entry = this.head[row * this.columns + column]; entry !== -1; entry = this.next[entry]) visit(this.item[entry]);
      }
    }
    return least;
  }

  add(x: number, y: number, width: number, height: number, owner = NO_OWNER): void {
    if (this.count === this.owners.length) {
      this.boxes = grown(this.boxes);
      this.owners = grown(this.owners);
      this.seen = grown(this.seen);
    }
    const index = this.count;
    this.count += 1;
    const at = index * 4;
    this.boxes[at] = x;
    this.boxes[at + 1] = y;
    this.boxes[at + 2] = width;
    this.boxes[at + 3] = height;
    this.owners[index] = owner;
    this.seen[index] = 0;
    // A negative size spans back from its corner; the overlap test reads the same four sums.
    const left = Math.min(x, x + width), right = Math.max(x, x + width);
    const top = Math.min(y, y + height), bottom = Math.max(y, y + height);
    const x0 = this.column(left), x1 = this.column(right);
    const y0 = this.row(top), y1 = this.row(bottom);
    if (!Number.isFinite(left + right + top + bottom) || (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_SPAN_CELLS) {
      if (this.looseCount === this.loose.length) this.loose = grown(this.loose);
      this.loose[this.looseCount] = index;
      this.looseCount += 1;
      return;
    }
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

  private nextStamp(): number {
    this.stamp = this.stamp === 0xffffffff ? 1 : this.stamp + 1;
    if (this.stamp === 1) this.seen.fill(0);
    return this.stamp;
  }

  private column(x: number): number {
    return Math.min(this.columns - 1, Math.max(0, Math.floor(x / this.cellPx)));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellPx)));
  }
}

function grown<T extends Int32Array | Float64Array | Uint32Array>(array: T): T {
  const next = new (array.constructor as new (length: number) => T)(array.length * 2);
  next.set(array);
  return next;
}
