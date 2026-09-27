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

/**
 * Above this many groups the tangent search gives way to a golden-angle spiral: each placement
 * tests O(k²) tangent candidates against every placed circle, O(k⁴) over the packing; at 48
 * equal groups that measured about 580,000 distance computations, once, on mount.
 */
const TANGENT_SEARCH_MAX_GROUPS = 48;

/** Candidate angles tried around each placed circle when no pair yet exists. */
const RAY_SAMPLES = 24;

interface Circle {
  cx: number;
  cy: number;
  r: number;
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

  order.forEach((entry, position) => {
    let cx = 0;
    let cy = 0;
    if (position > 0) {
      const found = spiral
        ? spiralPosition(entry.r, placed, position)
        : nearestFreePosition(entry.r, placed);
      cx = found.cx;
      cy = found.cy;
    }
    placed.push({ cx, cy, r: entry.r });
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
  placed: readonly Circle[],
  position: number,
): { cx: number; cy: number } {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const angle = position * golden;
  let reach = radius;
  for (const circle of placed) reach = Math.max(reach, Math.hypot(circle.cx, circle.cy) * 0.5);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const cx = Math.cos(angle) * reach;
    const cy = Math.sin(angle) * reach;
    let clear = true;
    for (const circle of placed) {
      if (Math.hypot(cx - circle.cx, cy - circle.cy) < circle.r + radius - 1e-6) {
        clear = false;
        break;
      }
    }
    if (clear) return { cx, cy };
    reach += radius * 0.25;
  }
  return { cx: Math.cos(angle) * reach, cy: Math.sin(angle) * reach };
}
