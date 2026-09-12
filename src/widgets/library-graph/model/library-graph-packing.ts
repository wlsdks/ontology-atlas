/**
 * **Where each group of the folder stands** — the composition, decided once, above the
 * physics.
 *
 * ## Why the simulation could not answer this
 *
 * A folder is usually not one graph. The owner's own is four groups: a disputes cluster,
 * a settlement cluster, one page with its single source, and the files nobody has written
 * up yet. Held in one field with one centre, the only force that has anything to say about
 * where two *unconnected* groups go is mutual repulsion, and repulsion's answer is always
 * the same one: as far apart as the field allows. Measured on the installed build at
 * 1512×901 (canvas 1088×819), that answer filled **54%** of a fixed 6×4 grid over the
 * canvas and left a **167px** horizontal band — a third of the picture's height — holding
 * nothing.
 *
 * No tuning of the forces fixes it, because the defect is not a balance that came out
 * wrong. Two groups with no relation between them have no distance — there is nothing for
 * a force to be right about — so the distance has to be *composed*, and a composition is
 * a layout decision, not a force.
 *
 * ## What this file decides, and what it refuses to decide
 *
 * It places **one circle per group**, and nothing else. Every position *inside* a group is
 * still the springs': the group is carried to its place by gravity and its own shape
 * arrives untouched, at the one uniform scale the camera draws everything at. So the
 * property the picture encodes — that two marks close together are close in the folder —
 * survives exactly, and the property it never encoded — that two marks in unrelated
 * clusters are 300 units apart — stops being asserted by accident.
 *
 * ## Around the centre, never against the canvas
 *
 * ⚠️ **This file used to search for an arrangement scored on how much of the canvas it
 * covered.** Every assignment of up to six groups into columns was placed in full, fitted
 * to the canvas and scored on the emptiest strip it left; the winner was whichever
 * arrangement held the most of a 6×4 grid over the canvas. That is a *fill* objective, and
 * the owner's verdict on the build it produced is why it is gone: a composition chosen to
 * cover a 1920px window is a different composition from the one chosen to cover a 1040px
 * window, so one folder had as many shapes as the person had window sizes — and on a wide
 * window the search bought its coverage by pushing unrelated clusters apart until the
 * picture was a ring of balloons around an empty middle.
 *
 * What replaces it asks the canvas nothing at all. The groups are packed **around the
 * centre**, biggest first, each one placed at the position closest to the centre that
 * touches what is already there without overlapping it. The result is a compact rosette
 * whose shape is the folder's and only the folder's: the same on every window, on every
 * machine and on every visit, which is exactly what a person is being asked to learn. The
 * camera's job is then the whole of the canvas's involvement — see `fitLibraryView`.
 *
 * Deterministic throughout: groups are sorted by footprint radius with the caller's order
 * breaking every tie, and every candidate position is derived from already-placed circles
 * in that same order.
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
 * Above this many groups the tangent search is skipped for a golden-angle spiral.
 *
 * The search is O(k³) in the number of groups — every pair of placed circles offers two
 * tangent positions, and each candidate is tested against every placed circle. At 48 that
 * is about 110,000 tests once, on mount; a folder of several hundred one-page groups would
 * pay eight million for a composition nobody can tell apart from the spiral's.
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
 * Packs the groups' footprints around the origin, biggest first.
 *
 * The returned slots are in the caller's order, not in packing order.
 *
 * @param boxes each group's measured footprint
 * @param gutter the clear space every group keeps from every other one
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

  // Biggest first, the caller's order breaking ties: the group that decides the middle of
  // the picture is placed before anything is arranged against it.
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

  /*
   * **Recentred on the rosette's own middle.** The first circle sits at the origin, so a
   * folder whose biggest group is much smaller than the rest of it would hand the camera a
   * picture whose centre of mass is off to one side; the fit would then centre the bounding
   * box and leave the eye landing somewhere the folder is not. Shifting every slot by the
   * packed extent's centre costs nothing and is what the "centre of mass within 15% of the
   * canvas centre" measurement is stated against.
   */
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
 * The position closest to the centre where a circle of this radius fits.
 *
 * Every candidate is **tangent to what is already there**, which is what makes the result
 * compact rather than merely non-overlapping: tangent to two placed circles where a pair
 * exists, and tangent to one along a ray from the centre otherwise. The winner is whichever
 * valid candidate's own centre is nearest the origin, with the candidate order breaking
 * ties, so the rosette grows outward one ring at a time.
 */
function nearestFreePosition(radius: number, placed: readonly Circle[]): { cx: number; cy: number } {
  let best: { cx: number; cy: number } | null = null;
  let bestDistance = Infinity;
  const consider = (cx: number, cy: number): void => {
    for (const circle of placed) {
      const gap = Math.hypot(cx - circle.cx, cy - circle.cy) - (circle.r + radius);
      // A hair of tolerance: a tangent point is exactly zero in exact arithmetic and a few
      // ULPs negative in floating point, and rejecting it would leave no candidate at all.
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
    // Tangent to one, along the ray from the origin through it — the ring's own direction,
    // plus a fan around it so a first placement has somewhere to go.
    for (let sample = 0; sample < RAY_SAMPLES; sample += 1) {
      const angle = (sample / RAY_SAMPLES) * Math.PI * 2;
      consider(first.cx + Math.cos(angle) * (first.r + radius), first.cy + Math.sin(angle) * (first.r + radius));
    }
    for (let b = a + 1; b < placed.length; b += 1) {
      const second = placed[b]!;
      // The two points tangent to both: the classic circle-circle intersection of the loci
      // at radius (r_i + r) and (r_j + r).
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
  // Nothing tangent fits — only reachable when `placed` is empty, which the caller excludes.
  return best ?? { cx: 0, cy: 0 };
}

/**
 * The fallback above {@link TANGENT_SEARCH_MAX_GROUPS}: a golden-angle spiral, pushed out
 * until it clears everything already placed.
 *
 * The same spiral `seedPositions` uses, for the same reason — it is the arrangement that
 * distributes points around a centre with no two of them on a line, and it needs no search.
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
