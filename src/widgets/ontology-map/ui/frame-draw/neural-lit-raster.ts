import { at } from "./neural-axons";
import type { NeuralFrame } from "./neural-frame";

/** A lit axon is sampled every step into a raster of cells a name or receded title must keep clear of. */
const LIT_PATH_STEP_PX = 5;
const LIT_CELL_PX = 6;

/** The screen cells lit axons pass through, reused across frames: mark is O(1), a box test O(cells it covers). */
class LitRaster {
  private cells = new Uint8Array(0);
  private cols = 0;
  private rows = 0;
  reset(width: number, height: number): void {
    this.cols = Math.max(1, Math.ceil(width / LIT_CELL_PX));
    this.rows = Math.max(1, Math.ceil(height / LIT_CELL_PX));
    if (this.cells.length < this.cols * this.rows) this.cells = new Uint8Array(this.cols * this.rows);
    else this.cells.fill(0, 0, this.cols * this.rows);
  }
  private mark(x: number, y: number): void {
    const col = Math.floor(x / LIT_CELL_PX);
    const row = Math.floor(y / LIT_CELL_PX);
    if (col >= 0 && row >= 0 && col < this.cols && row < this.rows) this.cells[row * this.cols + col] = 1;
  }
  /** Marks the cells drawn axon `e` passes through. O(its length / LIT_PATH_STEP_PX). */
  markAxon(f: NeuralFrame, e: number): void {
    const { axonAX: ax, axonAY: ay, axonCX: acx, axonCY: acy, axonBX: abx, axonBY: aby } = f;
    const lengthPx = Math.hypot(acx[e] - ax[e], acy[e] - ay[e]) + Math.hypot(abx[e] - acx[e], aby[e] - acy[e]);
    const samples = Math.ceil(lengthPx / LIT_PATH_STEP_PX);
    for (let j = 1; j < samples; j += 1) this.mark(at(ax[e], acx[e], abx[e], j / samples), at(ay[e], acy[e], aby[e], j / samples));
  }
  hits(box: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
    const c0 = Math.max(0, Math.floor(box.minX / LIT_CELL_PX));
    const c1 = Math.min(this.cols - 1, Math.floor(box.maxX / LIT_CELL_PX));
    const r0 = Math.max(0, Math.floor(box.minY / LIT_CELL_PX));
    const r1 = Math.min(this.rows - 1, Math.floor(box.maxY / LIT_CELL_PX));
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) if (this.cells[row * this.cols + col] === 1) return true;
    }
    return false;
  }
}

export const litRaster = new LitRaster();
