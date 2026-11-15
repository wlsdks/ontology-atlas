const BARNES_HUT_THETA = 1;
const OCTREE_MAX_DEPTH = 24;
const OCTREE_LEAF_POINTS = 8;
const COINCIDENT_D2 = 1e-6;

export class BarnesHutOctree {
  private cells = 0;
  private capacity = 0;
  private cx = new Float64Array(0);
  private cy = new Float64Array(0);
  private cz = new Float64Array(0);
  private half = new Float64Array(0);
  private mass = new Float64Array(0);
  private comX = new Float64Array(0);
  private comY = new Float64Array(0);
  private comZ = new Float64Array(0);
  private firstChild = new Int32Array(0);
  private head = new Int32Array(0);
  private next = new Int32Array(0);
  private px: Float64Array = new Float64Array(0);
  private py: Float64Array = new Float64Array(0);
  private pz: Float64Array = new Float64Array(0);
  private readonly stack = new Int32Array(8 * (OCTREE_MAX_DEPTH + 2));

  build(px: Float64Array, py: Float64Array, pz: Float64Array, members: Int32Array, memberCount: number): void {
    if (this.next.length < px.length) this.next = new Int32Array(px.length);
    this.px = px;
    this.py = py;
    this.pz = pz;
    this.cells = 0;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let k = 0; k < memberCount; k += 1) {
      const p = members[k];
      if (px[p] < minX) minX = px[p];
      if (px[p] > maxX) maxX = px[p];
      if (py[p] < minY) minY = py[p];
      if (py[p] > maxY) maxY = py[p];
      if (pz[p] < minZ) minZ = pz[p];
      if (pz[p] > maxZ) maxZ = pz[p];
    }
    if (memberCount === 0) {
      minX = minY = minZ = -1;
      maxX = maxY = maxZ = 1;
    }
    const half = Math.max(1, maxX - minX, maxY - minY, maxZ - minZ) * 0.5 * 1.0001;
    this.allocate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, half);
    for (let k = 0; k < memberCount; k += 1) this.insert(members[k], px[members[k]], py[members[k]], pz[members[k]]);
    for (let c = 0; c < this.cells; c += 1) {
      const m = this.mass[c];
      if (m === 0) continue;
      this.comX[c] /= m;
      this.comY[c] /= m;
      this.comZ[c] /= m;
    }
  }

  accumulate(i: number, strength: number, out: Float64Array): void {
    const { stack, mass, firstChild, head, next, half, cx, cy, cz, comX, comY, comZ, px, py, pz } = this;
    const x = px[i];
    const y = py[i];
    const z = pz[i];
    const theta2 = BARNES_HUT_THETA * BARNES_HUT_THETA;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    let top = 0;
    stack[top++] = 0;
    while (top > 0) {
      const c = stack[--top];
      const m = mass[c];
      if (m === 0) continue;
      const children = firstChild[c];
      if (children < 0) {
        for (let q = head[c]; q >= 0; q = next[q]) {
          if (q === i) continue;
          let dx = x - px[q];
          let dy = y - py[q];
          let dz = z - pz[q];
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < COINCIDENT_D2) {
            dx = (i - q) * 1e-3;
            dy = i < q ? 1e-3 : -1e-3;
            dz = (q - i) * 1e-3;
            d2 = dx * dx + dy * dy + dz * dz;
          }
          const inv = strength / (d2 * Math.sqrt(d2));
          fx += dx * inv;
          fy += dy * inv;
          fz += dz * inv;
        }
        continue;
      }
      const h = half[c];
      const dx = x - comX[c];
      const dy = y - comY[c];
      const dz = z - comZ[c];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (4 * h * h < theta2 * d2 && (Math.abs(x - cx[c]) > h || Math.abs(y - cy[c]) > h || Math.abs(z - cz[c]) > h)) {
        const inv = (strength * m) / (d2 * Math.sqrt(d2));
        fx += dx * inv;
        fy += dy * inv;
        fz += dz * inv;
        continue;
      }
      for (let k = 7; k >= 0; k -= 1) if (mass[children + k] > 0) stack[top++] = children + k;
    }
    out[0] += fx;
    out[1] += fy;
    out[2] += fz;
  }

  private insert(p: number, x: number, y: number, z: number): void {
    let c = 0;
    for (let depth = 0; ; depth += 1) {
      this.mass[c] += 1;
      this.comX[c] += x;
      this.comY[c] += y;
      this.comZ[c] += z;
      const children = this.firstChild[c];
      if (children >= 0) {
        c = children + this.octant(c, x, y, z);
        continue;
      }
      if (this.mass[c] <= OCTREE_LEAF_POINTS || depth >= OCTREE_MAX_DEPTH) {
        this.next[p] = this.head[c];
        this.head[c] = p;
        return;
      }
      const base = this.split(c);
      for (let q = this.head[c]; q >= 0; ) {
        const following = this.next[q];
        const child = base + this.octant(c, this.px[q], this.py[q], this.pz[q]);
        this.mass[child] += 1;
        this.comX[child] += this.px[q];
        this.comY[child] += this.py[q];
        this.comZ[child] += this.pz[q];
        this.next[q] = this.head[child];
        this.head[child] = q;
        q = following;
      }
      this.head[c] = -1;
      c = base + this.octant(c, x, y, z);
    }
  }

  private octant(c: number, x: number, y: number, z: number): number {
    return (x >= this.cx[c] ? 1 : 0) | (y >= this.cy[c] ? 2 : 0) | (z >= this.cz[c] ? 4 : 0);
  }

  private split(c: number): number {
    const quarter = this.half[c] / 2;
    const base = this.cells;
    for (let k = 0; k < 8; k += 1) {
      this.allocate(
        this.cx[c] + (k & 1 ? quarter : -quarter),
        this.cy[c] + (k & 2 ? quarter : -quarter),
        this.cz[c] + (k & 4 ? quarter : -quarter),
        quarter,
      );
    }
    this.firstChild[c] = base;
    return base;
  }

  private allocate(x: number, y: number, z: number, half: number): void {
    if (this.cells === this.capacity) this.grow();
    const c = this.cells++;
    this.cx[c] = x;
    this.cy[c] = y;
    this.cz[c] = z;
    this.half[c] = half;
    this.mass[c] = 0;
    this.comX[c] = 0;
    this.comY[c] = 0;
    this.comZ[c] = 0;
    this.firstChild[c] = -1;
    this.head[c] = -1;
  }

  private grow(): void {
    const capacity = Math.max(64, this.capacity * 2);
    const float = (from: Float64Array) => {
      const to = new Float64Array(capacity);
      to.set(from);
      return to;
    };
    const int = (from: Int32Array) => {
      const to = new Int32Array(capacity);
      to.set(from);
      return to;
    };
    this.cx = float(this.cx);
    this.cy = float(this.cy);
    this.cz = float(this.cz);
    this.half = float(this.half);
    this.mass = float(this.mass);
    this.comX = float(this.comX);
    this.comY = float(this.comY);
    this.comZ = float(this.comZ);
    this.firstChild = int(this.firstChild);
    this.head = int(this.head);
    this.capacity = capacity;
  }
}

export class CollisionHashGrid {
  private cellSize = 1;
  private mask = 0;
  private buckets = new Int32Array(0);
  private next = new Int32Array(0);
  private gx = new Int32Array(0);
  private gy = new Int32Array(0);
  private gz = new Int32Array(0);

  build(px: Float64Array, py: Float64Array, pz: Float64Array, count: number, cellSize: number): void {
    this.cellSize = cellSize;
    let size = 16;
    while (size < count * 2) size *= 2;
    if (this.buckets.length !== size) this.buckets = new Int32Array(size);
    this.buckets.fill(-1);
    this.mask = size - 1;
    if (this.next.length < count) {
      this.next = new Int32Array(count);
      this.gx = new Int32Array(count);
      this.gy = new Int32Array(count);
      this.gz = new Int32Array(count);
    }
    for (let i = 0; i < count; i += 1) {
      const x = Math.floor(px[i] / cellSize);
      const y = Math.floor(py[i] / cellSize);
      const z = Math.floor(pz[i] / cellSize);
      this.gx[i] = x;
      this.gy[i] = y;
      this.gz[i] = z;
      const bucket = this.bucketOf(x, y, z);
      this.next[i] = this.buckets[bucket];
      this.buckets[bucket] = i;
    }
  }

  separate(
    i: number,
    px: Float64Array,
    py: Float64Array,
    pz: Float64Array,
    radius: Float64Array,
    relax: number,
  ): void {
    const ri = radius[i];
    const reach = Math.ceil((2 * ri) / this.cellSize);
    const ox = this.gx[i];
    const oy = this.gy[i];
    const oz = this.gz[i];
    for (let dz = -reach; dz <= reach; dz += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          const x = ox + dx;
          const y = oy + dy;
          const z = oz + dz;
          for (let j = this.buckets[this.bucketOf(x, y, z)]; j >= 0; j = this.next[j]) {
            if (this.gx[j] !== x || this.gy[j] !== y || this.gz[j] !== z) continue;
            const rj = radius[j];
            if (rj > ri || (rj === ri && j <= i)) continue;
            let ex = px[i] - px[j];
            let ey = py[i] - py[j];
            let ez = pz[i] - pz[j];
            let d2 = ex * ex + ey * ey + ez * ez;
            const want = ri + rj;
            if (d2 >= want * want) continue;
            if (d2 < COINCIDENT_D2) {
              ex = (i - j) * 1e-3;
              ey = i < j ? 1e-3 : -1e-3;
              ez = (j - i) * 1e-3;
              d2 = ex * ex + ey * ey + ez * ez;
            }
            const d = Math.sqrt(d2);
            const push = ((want - d) / d) * relax * 0.5;
            px[i] += ex * push;
            py[i] += ey * push;
            pz[i] += ez * push;
            px[j] -= ex * push;
            py[j] -= ey * push;
            pz[j] -= ez * push;
          }
        }
      }
    }
  }

  private bucketOf(x: number, y: number, z: number): number {
    return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & this.mask;
  }
}
