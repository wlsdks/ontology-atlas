export class RowHeightIndex {
  private readonly sums: number[];

  constructor(private readonly heights: readonly number[]) {
    this.sums = new Array(heights.length + 1).fill(0);
    for (let i = 1; i < this.sums.length; i += 1) {
      this.sums[i] += heights[i - 1];
      const parent = i + (i & -i);
      if (parent < this.sums.length) this.sums[parent] += this.sums[i];
    }
  }

  update(index: number, previous: number, next: number): void {
    for (let i = index + 1; i < this.sums.length; i += i & -i) {
      this.sums[i] += next - previous;
    }
  }

  top(index: number, gap: number): number {
    const count = Math.min(index, this.heights.length);
    let total = count * gap;
    for (let i = count; i > 0; i -= i & -i) total += this.sums[i];
    return total;
  }

  private boundary(value: number, gap: number, strict: boolean): number {
    let index = 0;
    let sum = 0;
    let step = 1;
    while (step * 2 <= this.heights.length) step *= 2;
    for (; step > 0; step = Math.floor(step / 2)) {
      const next = index + step;
      if (next > this.heights.length) continue;
      const candidate = sum + this.sums[next];
      const offset = candidate + next * gap;
      if (strict ? offset < value : offset <= value) {
        index = next;
        sum = candidate;
      }
    }
    return index;
  }

  window(gap: number, viewportTop: number, viewportHeight: number, overscan: number) {
    const count = this.heights.length;
    const first = this.boundary(viewportTop, gap, false);
    const bottom = viewportTop + viewportHeight;
    const last = bottom <= this.top(first, gap) ? first
      : Math.min(count, this.boundary(bottom, gap, true) + 1);
    const start = Math.max(0, first - overscan);
    const end = Math.min(count, last + overscan);
    return { start, end, before: this.top(start, gap), after: this.top(count, gap) - this.top(end, gap) };
  }
}
