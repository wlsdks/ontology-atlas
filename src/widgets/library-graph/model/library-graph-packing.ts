/**
 * Where each group of the folder stands, composed once above the physics: unrelated groups
 * have no distance for a force to get right, and repulsion alone pushes them to the walls.
 * One circle per group; positions inside a group stay the springs'.
 *
 * Packed around the centre, never scored against the canvas, so one folder has one shape at
 * every window size: biggest first, each at the free position nearest the origin tangent to
 * what is placed. Deterministic: sorted by radius, caller order breaking ties.
 */

/** A group's measured footprint, in the simulation's own units. */
export interface PackBox {
  width: number;
  height: number;
}

/** Where that group is held: the centre it is pulled to, and the room it was given. */
export interface PackSlot {
  cx: number;
  cy: number;
  halfWidth: number;
  halfHeight: number;
}

/** Above 48 groups, spatial spiral queries replace O(k⁴) tangent search. */
const TANGENT_SEARCH_MAX_GROUPS = 48;

/** Candidate angles tried around each placed circle when no pair yet exists. */
const RAY_SAMPLES = 24;

interface Circle {
  cx: number;
  cy: number;
  r: number;
}

interface CircleLevel {
  size: number;
  rows: Map<number, Map<number, Circle[]>>;
}

class CircleIndex {
  private levels: CircleLevel[] = [];
  private levelBySize = new Map<number, CircleLevel>();

  add(circle: Circle): void {
    const size = 2 ** Math.ceil(Math.log2(Math.max(1, circle.r * 2)));
    let level = this.levelBySize.get(size);
    if (!level) {
      level = { size, rows: new Map() };
      this.levelBySize.set(size, level);
      this.levels.push(level);
    }
    const rows = level.rows;
    const x = Math.floor(circle.cx / size);
    const y = Math.floor(circle.cy / size);
    let row = rows.get(x);
    if (!row) rows.set(x, (row = new Map()));
    const cell = row.get(y);
    if (cell) cell.push(circle);
    else row.set(y, [circle]);
  }

  collisionAt(cx: number, cy: number, radius: number): Circle | null {
    // Descending radii keep each level's query within at most nine cells.
    for (const { size, rows } of this.levels) {
      const reach = radius + size / 2;
      const maxX = Math.floor((cx + reach) / size);
      const maxY = Math.floor((cy + reach) / size);
      for (let x = Math.floor((cx - reach) / size); x <= maxX; x += 1) {
        const row = rows.get(x);
        if (!row) continue;
        for (let y = Math.floor((cy - reach) / size); y <= maxY; y += 1) {
          for (const circle of row.get(y) ?? []) {
            if (Math.hypot(cx - circle.cx, cy - circle.cy) < circle.r + radius - 1e-6) return circle;
          }
        }
      }
    }
    return null;
  }
}

/** The radius of the circle that holds a footprint, plus its share of the clear space. */
function radiusOf(box: PackBox, gutter: number): number {
  return Math.hypot(Math.max(1, box.width), Math.max(1, box.height)) / 2 + gutter / 2;
}

/**
 * Packs the groups' footprints around the origin, biggest first; slots come back in the
 * caller's order. `gutter` is the clear space between any two groups.
 */
export function packGroupsAroundCentre(boxes: readonly PackBox[], gutter: number): PackSlot[] {
  if (boxes.length === 0) return [];
  const slotFor = (box: PackBox, cx: number, cy: number): PackSlot => ({
    cx,
    cy,
    halfWidth: Math.max(1, box.width) / 2,
    halfHeight: Math.max(1, box.height) / 2,
  });
  if (boxes.length === 1) return [slotFor(boxes[0]!, 0, 0)];

  // Biggest first, caller order breaking ties, so the middle is placed before anything against it.
  const order = boxes
    .map((box, index) => ({ box, index, r: radiusOf(box, gutter) }))
    .sort((first, second) => second.r - first.r || first.index - second.index);

  const placed: Circle[] = [];
  const out = new Array<PackSlot>(boxes.length);
  const spiral = order.length > TANGENT_SEARCH_MAX_GROUPS;
  const index = spiral ? new CircleIndex() : null;
  let halfReach = 0;

  order.forEach((entry, position) => {
    let cx = 0;
    let cy = 0;
    if (position > 0) {
      const found = spiral
        ? spiralPosition(entry.r, halfReach, position, index!)
        : nearestFreePosition(entry.r, placed);
      cx = found.cx;
      cy = found.cy;
    }
    const circle = { cx, cy, r: entry.r };
    placed.push(circle);
    index?.add(circle);
    halfReach = Math.max(halfReach, Math.hypot(cx, cy) * 0.5);
    out[entry.index] = slotFor(entry.box, cx, cy);
  });

  // Recentred on the packed extent's middle, or the first circle at the origin leaves the picture off-centre.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const circle of placed) {
    minX = Math.min(minX, circle.cx - circle.r);
    maxX = Math.max(maxX, circle.cx + circle.r);
    minY = Math.min(minY, circle.cy - circle.r);
    maxY = Math.max(maxY, circle.cy + circle.r);
  }
  const shiftX = (minX + maxX) / 2;
  const shiftY = (minY + maxY) / 2;
  for (const slot of out) {
    slot.cx -= shiftX;
    slot.cy -= shiftY;
  }
  return out;
}

/**
 * The free position nearest the centre for a circle of this radius. Candidates are tangent
 * to placed circles (to pairs, and to single circles on sampled rays), so the result is
 * compact; candidate order breaks ties.
 */
function nearestFreePosition(radius: number, placed: readonly Circle[]): { cx: number; cy: number } {
  let best: { cx: number; cy: number } | null = null;
  let bestDistance = Infinity;
  const consider = (cx: number, cy: number): void => {
    for (const circle of placed) {
      const gap = Math.hypot(cx - circle.cx, cy - circle.cy) - (circle.r + radius);
      // Tolerance for tangent points landing a few ULPs negative, or no candidate survives.
      if (gap < -1e-6) return;
    }
    const distance = Math.hypot(cx, cy);
    if (distance < bestDistance - 1e-9) {
      bestDistance = distance;
      best = { cx, cy };
    }
  };

  for (let a = 0; a < placed.length; a += 1) {
    const first = placed[a]!;
    // Tangent to one circle, at sampled angles around it.
    for (let sample = 0; sample < RAY_SAMPLES; sample += 1) {
      const angle = (sample / RAY_SAMPLES) * Math.PI * 2;
      consider(first.cx + Math.cos(angle) * (first.r + radius), first.cy + Math.sin(angle) * (first.r + radius));
    }
    for (let b = a + 1; b < placed.length; b += 1) {
      const second = placed[b]!;
      // Tangent to both: intersect the loci at radius (r_i + r) and (r_j + r).
      const dx = second.cx - first.cx;
      const dy = second.cy - first.cy;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1e-9) continue;
      const reachA = first.r + radius;
      const reachB = second.r + radius;
      if (distance > reachA + reachB || distance < Math.abs(reachA - reachB)) continue;
      const along = (distance * distance + reachA * reachA - reachB * reachB) / (2 * distance);
      const heightSquared = reachA * reachA - along * along;
      if (heightSquared < 0) continue;
      const height = Math.sqrt(heightSquared);
      const midX = first.cx + (dx / distance) * along;
      const midY = first.cy + (dy / distance) * along;
      const offX = (-dy / distance) * height;
      const offY = (dx / distance) * height;
      consider(midX + offX, midY + offY);
      consider(midX - offX, midY - offY);
    }
  }
  // Only reachable with nothing placed, which the caller excludes.
  return best ?? { cx: 0, cy: 0 };
}

/**
 * Above {@link TANGENT_SEARCH_MAX_GROUPS}: the `seedPositions` golden-angle spiral, pushed
 * out until clear of everything placed; no search.
 */
function spiralPosition(
  radius: number,
  halfReach: number,
  position: number,
  index: CircleIndex,
): { cx: number; cy: number } {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const angle = position * golden;
  let reach = Math.max(radius, halfReach);
  const step = radius * 0.25;
  for (let attempt = 0; attempt < 400;) {
    const cx = Math.cos(angle) * reach;
    const cy = Math.sin(angle) * reach;
    const collision = index.collisionAt(cx, cy, radius);
    if (!collision) return { cx, cy };
    const margin = collision.r + radius - 1e-6 - Math.hypot(cx - collision.cx, cy - collision.cy);
    const skip = Math.min(400 - attempt, Math.max(1, Math.floor(margin / step)));
    // Every skipped step remains inside this circle; repeated additions preserve the seed geometry.
    for (let i = 0; i < skip; i += 1) reach += step;
    attempt += skip;
  }
  const fallbackX = Math.cos(angle) * reach;
  const fallbackY = Math.sin(angle) * reach;
  if (!index.collisionAt(fallbackX, fallbackY, radius)) return { cx: fallbackX, cy: fallbackY };
  reach = Math.max(reach, 2 * radius * Math.sqrt(position));
  for (;;) {
    const cx = Math.cos(angle) * reach;
    const cy = Math.sin(angle) * reach;
    const collision = index.collisionAt(cx, cy, radius);
    if (!collision) return { cx, cy };
    const margin = collision.r + radius - 1e-6 - Math.hypot(cx - collision.cx, cy - collision.cy);
    reach += step * Math.max(1, Math.floor(margin / step));
  }
}
