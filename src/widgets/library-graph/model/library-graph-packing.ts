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
 * nothing. On `vault-zero-answers` it was 50% and 226px. A bounding-box fill of 99.8% was
 * reported at the same time and is the number that cannot see this: four marks in four
 * corners fill a box perfectly.
 *
 * No tuning of the forces fixes it, because the defect is not a balance that came out
 * wrong. Two groups with no relation between them have no distance — there is nothing for
 * a force to be right about — so the distance has to be *composed*, and a composition is
 * a layout decision, not a force.
 *
 * ## What this file decides, and what it refuses to decide
 *
 * It places **rectangles**, one per group, and nothing else. Every position *inside* a
 * group is still the springs': the group is carried to its slot by gravity and its own
 * shape arrives untouched, at the one uniform scale `fitToBox` draws everything at. So the
 * property the picture encodes — that two marks close together are close in the folder —
 * survives exactly, and the property it never encoded — that two marks in unrelated
 * clusters are 300 units apart — stops being asserted by accident.
 *
* Columns, and stacked rather than shelved, and the reason is the measurement. A **band** —
 * a horizontal strip of the canvas holding nothing at any x — is the shape of this defect,
 * and a connected group covers its own height *continuously*, because its lines run between
 * its marks. So a column that holds the tallest group covers every row of the picture, and
 * the thin groups beside it are then free to stand wherever they read best. Shelved into
 * **rows** instead, the same four groups measured a 225px band between row one and row two
 * at 1512×901: a three-mark path settles into a 13-unit-tall line, and nothing else was at
 * that height to cover the rows above it.
 *
 * The boxes are the groups' **measured footprints**, not weights, so each cell already has
 * the shape of what goes in it — which is what a squarified treemap cannot promise, and why
 * a wide cluster handed a square cell overflows onto its neighbour.
 *
 * Deterministic throughout: boxes are sorted by height with the caller's order breaking
 * every tie, so the same folder composes the same way on every machine and every visit —
 * the property the whole of this widget is built to keep.
 */

/** A group's measured footprint, in the simulation's own units. */
export interface PackBox {
  width: number;
  height: number;
  /**
   * **Which rows of its own box the group actually covers**, relative to the box's centre.
   *
   * A connected group's lines run between its marks, so its coverage is one span from top to
   * bottom — but a group of *unattached* marks on a ring is a handful of separate spans with
   * nothing between them, and a cluster with an open middle is two. Scoring a box as solid
   * was measured as the reason the search picked arrangements that looked right and drew
   * wrong: the predictor said no gap where the picture had 107px of one. Absent means solid.
   */
  spans?: ReadonlyArray<{ from: number; to: number }>;
  /** The same, across: which columns of its own box the group covers. */
  xSpans?: ReadonlyArray<{ from: number; to: number }>;
}

/** Where that group is held: the centre it is pulled to, and the room it was given. */
export interface PackSlot {
  cx: number;
  cy: number;
  halfWidth: number;
  halfHeight: number;
}

/**
 * Folders with this many groups or fewer get the exhaustive search. `n ** n` at 6 is 46,656
 * arrangements placed and scored once on mount; at 7 it would be 823,543, which is a first
 * frame somebody waits for.
 */
const EXHAUSTIVE_MAX_GROUPS = 6;

/**
 * Packs the groups' footprints into columns of an arrangement of the given aspect, centred
 * on the origin.
 *
 * The returned slots are in the caller's order, not in packing order.
 *
 * @param boxes each group's measured footprint
 * @param aspect the canvas's width ÷ height — the shape the columns are laid out to fill
 * @param gutter the clear space every group keeps from every other one
 */
export function packGroupBoxes(
  boxes: readonly PackBox[],
  aspect: number,
  gutter: number,
): PackSlot[] {
  if (boxes.length === 0) return [];
  const safeAspect = Math.min(8, Math.max(0.125, aspect > 0 ? aspect : 1));
  if (boxes.length === 1) {
    const only = boxes[0]!;
    return [{ cx: 0, cy: 0, halfWidth: only.width / 2, halfHeight: only.height / 2 }];
  }

  // Tallest first, the caller's order breaking ties: the group that sets the picture's
  // height is placed before anything is arranged against it.
  const order = boxes
    .map((box, index) => ({ box, index }))
    .sort((first, second) => second.box.height - first.box.height || first.index - second.index);

  /*
   * **The arrangement is searched for, and it is scored on the band it leaves.**
   *
   * Four forms of this were measured before this one, and the first three all optimised the
   * wrong quantity:
   *
   * 1. an area estimate aimed at "the width a rectangle of the canvas's aspect would have"
   *    put the owner's four groups into three ragged rows, 700 units wide against 900 tall
   *    on a canvas of 1.33, and the fit went height-bound at **41.5%** of the width;
   * 2. a first-fit shelf at a searched target width put all four in one row — 0.97 of the
   *    width against 0.37 of the height;
   * 3. columns **balanced by height** put `vault-zero-answers`'s one tall cluster alone and
   *    its other three groups in the second column, an arrangement of 2.2 against 1.33,
   *    which the stretch then had to spread apart vertically by two thirds;
   * 4. columns chosen by **aspect error alone** found arrangements of a perfect shape and
   *    poor coverage — a 265px band and 0.62 cell occupancy at 1512×901, worse than form 3.
   *
   * The aspect is a means. What a person sees is the **band**: the tallest strip of the
   * picture that holds nothing, on either axis. So every candidate is placed in full —
   * reversal, centring and stretch included — **fitted to the canvas**, and scored on the
   * worst strip it leaves, margins included, with the column count as the tie-break.
   * Optimising the measurement directly is the only form of this that stopped trading one
   * fixture's hole for another's.
   *
   * A group's box counts as **continuous** coverage of its own height, because a connected
   * group's lines run between its marks; that is why a column is the primitive here and a row
   * is not.
   */
  const candidates: Column[][] = [];
  if (order.length <= EXHAUSTIVE_MAX_GROUPS) {
    const count = order.length;
    const slotOf = new Array<number>(count).fill(0);
    const total = count ** count;
    for (let combination = 0; combination < total; combination += 1) {
      let rest = combination;
      for (let position = 0; position < count; position += 1) {
        slotOf[position] = rest % count;
        rest = Math.floor(rest / count);
      }
      candidates.push(assignToColumns(order, slotOf, count, gutter));
    }
  } else {
    /*
     * Above the exhaustive bound: for every column count, each box goes to the column that is
     * shortest when it is placed. A folder with seven groups has enough of them that no single
     * one decides the shape, and the height balance is a good arrangement for the same reason.
     */
    for (let count = 1; count <= order.length; count += 1) {
      const slotOf = new Array<number>(order.length).fill(0);
      const heights = new Array<number>(count).fill(gutter);
      order.forEach((entry, position) => {
        let shortest = 0;
        for (let column = 1; column < count; column += 1) {
          if (heights[column]! < heights[shortest]!) shortest = column;
        }
        slotOf[position] = shortest;
        heights[shortest] += entry.box.height + gutter;
      });
      candidates.push(assignToColumns(order, slotOf, count, gutter));
    }
  }

  let best: PackSlot[] | null = null;
  let bestScore = { empty: Infinity, hole: Infinity, columns: Infinity };
  for (const candidate of candidates) {
    const slots = placeColumns(candidate, boxes.length, gutter, safeAspect);
    const score = scorePlacement(slots, boxes, safeAspect, candidate.length);
    if (
      score.empty < bestScore.empty - 1e-6 ||
      (Math.abs(score.empty - bestScore.empty) <= 1e-6 &&
        (score.hole < bestScore.hole - 1e-6 ||
          (Math.abs(score.hole - bestScore.hole) <= 1e-6 && score.columns < bestScore.columns)))
    ) {
      best = slots;
      bestScore = score;
    }
  }
  return best ?? [];
}

interface Column {
  members: Array<{ index: number; box: PackBox }>;
  /** The widest member plus one gutter — the room the column takes across the picture. */
  width: number;
  /** Every member's height plus one gutter — what the column needs down the picture. */
  height: number;
}

function assignToColumns(
  order: ReadonlyArray<{ box: PackBox; index: number }>,
  slotOf: readonly number[],
  count: number,
  gutter: number,
): Column[] {
  const columns: Column[] = [];
  for (let index = 0; index < count; index += 1) {
    columns.push({ members: [], width: 0, height: gutter });
  }
  order.forEach((entry, position) => {
    const column = columns[slotOf[position]!]!;
    column.members.push(entry);
    column.width = Math.max(column.width, entry.box.width + gutter);
    column.height += entry.box.height + gutter;
  });
  return columns.filter((column) => column.members.length > 0);
}

/** Lays one candidate arrangement out: columns across, members down, then the stretch. */
function placeColumns(
  columns: readonly Column[],
  slotCount: number,
  gutter: number,
  aspect: number,
): PackSlot[] {
  let totalWidth = 0;
  for (const column of columns) totalWidth += column.width;
  const slots: PackSlot[] = Array.from({ length: slotCount }, () => ({
    cx: 0,
    cy: 0,
    halfWidth: 0,
    halfHeight: 0,
  }));
  let left = -totalWidth / 2;
  columns.forEach((column, columnIndex) => {
    const centreX = left + column.width / 2;
    /*
     * **A column's members are stacked contiguously, the column is centred, and every other
     * column stacks in the opposite order.**
     *
     * Justifying the members to the picture's full height — gaps between, none at the ends —
     * was measured and it is worse: with two members per column the whole of a column's slack
     * becomes one gap in its middle, and since candidates tend to give the columns the same
     * shape, every column's gap lands at the same rows. That was a **320px** band at 1512×901
     * on the owner's folder, twice the one this change started from.
     *
     * Contiguous, the only gap inside a column is the gutter — but for the same reason, two
     * columns of `[big cluster, small group]` put their gutters at the same height, which
     * measured **178px** on the same folder. Reversing every other column's order is what
     * separates them: one column's gutter falls where its neighbour has a cluster.
     */
    let content = gutter * Math.max(0, column.members.length - 1);
    for (const member of column.members) content += member.box.height;
    const members = columnIndex % 2 === 1 ? [...column.members].reverse() : column.members;
    let top = -content / 2;
    for (const member of members) {
      slots[member.index] = {
        cx: centreX,
        cy: top + member.box.height / 2,
        halfWidth: member.box.width / 2,
        halfHeight: member.box.height / 2,
      };
      top += member.box.height + gutter;
    }
    left += column.width;
  });
  stretchToAspect(slots, aspect);
  return slots;
}

/**
 * **What a candidate leaves empty, measured on the canvas rather than on itself.**
 *
 * The hole a person sees is a strip of the *canvas*, and `fitToBox` maps the arrangement into
 * the canvas at one uniform scale — so an arrangement whose shape does not match the canvas
 * arrives with a margin, and a margin is a hole like any other. Scoring the arrangement's
 * **own** extent missed exactly that: the best-scoring candidate on `vault-zero-answers` was
 * every group in its own column, which leaves no internal gap and lands as a thin horizontal
 * strip across the middle of the canvas — 0.31 of the height filled, a **292px** band above
 * it.
 *
 * Both axes are scored, and the worse of the two decides. Down the canvas alone was not
 * enough either: on the owner's folder the winner put its two clusters in the right-hand
 * column and its two small groups in the left, which is bandless and leaves **the left half
 * of the picture empty** — 0.625 of a 6×4 grid occupied, against 0.92 for the arrangement
 * beside it.
 */
function scorePlacement(
  slots: readonly PackSlot[],
  boxes: readonly PackBox[],
  aspect: number,
  columns: number,
): { empty: number; hole: number; columns: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const slot of slots) {
    minY = Math.min(minY, slot.cy - slot.halfHeight);
    maxY = Math.max(maxY, slot.cy + slot.halfHeight);
    minX = Math.min(minX, slot.cx - slot.halfWidth);
    maxX = Math.max(maxX, slot.cx + slot.halfWidth);
  }
  const height = maxY - minY;
  const width = maxX - minX;
  if (!(height > 0) || !(width > 0)) return { empty: Infinity, hole: Infinity, columns };
  // The canvas is `aspect` wide and 1 tall; this is the scale `fitToBox` will choose, and
  // these are where the picture's own edges land inside it.
  const scale = Math.min(aspect / width, 1 / height);
  const originX = (aspect - width * scale) / 2;
  const originY = (1 - height * scale) / 2;

  const spansOf = (index: number, axis: "x" | "y"): ReadonlyArray<{ from: number; to: number }> => {
    const slot = slots[index]!;
    const centre = axis === "y" ? slot.cy : slot.cx;
    const half = axis === "y" ? slot.halfHeight : slot.halfWidth;
    const own = axis === "y" ? boxes[index]?.spans : boxes[index]?.xSpans;
    if (!own || own.length === 0) return [{ from: centre - half, to: centre + half }];
    return own.map((span) => ({ from: centre + span.from, to: centre + span.to }));
  };

  /*
   * **The score is the grid the measurement uses.** A 6×4 grid over the canvas, and a cell
   * counts as held when some group covers it on both axes. Scoring the worst *strip* instead
   * was two rounds of trading one fixture for another: it is blind to a quadrant, so the
   * winner on the owner's folder put both clusters in the right-hand column and left the
   * left half of the picture empty at 0.625 occupancy, and correcting for that on the other
   * axis moved the loss to the narrow window instead. The grid is what a person sees, and it
   * is what this gate measures, so it is what the search optimises.
   *
   * A group's two axes are combined as a product, which says a ring of unattached marks holds
   * the cells inside it. The ring is small enough on the grid's scale for that to cost
   * nothing, and the alternative — carrying every mark's position through the packing — would
   * put the whole settle inside this search.
   */
  const gridX = 6;
  const gridY = 4;
  const held = new Set<number>();
  for (let index = 0; index < slots.length; index += 1) {
    const columnsHeld = new Set<number>();
    for (const span of spansOf(index, "x")) {
      const from = originX + (span.from - minX) * scale;
      const to = originX + (span.to - minX) * scale;
      const first = Math.max(0, Math.floor((from / aspect) * gridX));
      const last = Math.min(gridX - 1, Math.floor((to / aspect) * gridX));
      for (let cell = first; cell <= last; cell += 1) columnsHeld.add(cell);
    }
    for (const span of spansOf(index, "y")) {
      const from = originY + (span.from - minY) * scale;
      const to = originY + (span.to - minY) * scale;
      const first = Math.max(0, Math.floor(from * gridY));
      const last = Math.min(gridY - 1, Math.floor(to * gridY));
      for (let row = first; row <= last; row += 1) {
        for (const cell of columnsHeld) held.add(row * gridX + cell);
      }
    }
  }

  const worstGap = (axis: "x" | "y"): number => {
    const spans = slots
      .flatMap((_, index) => spansOf(index, axis))
      .sort((first, second) => first.from - second.from);
    const canvas = axis === "y" ? 1 : aspect;
    const extent = axis === "y" ? height : width;
    let gap = (canvas - extent * scale) / 2 / canvas;
    let reach = axis === "y" ? minY : minX;
    for (const span of spans) {
      if (span.from > reach) gap = Math.max(gap, ((span.from - reach) * scale) / canvas);
      reach = Math.max(reach, span.to);
    }
    return gap;
  };

  return {
    empty: 1 - held.size / (gridX * gridY),
    hole: Math.max(worstGap("y"), worstGap("x")),
    columns,
  };
}

/**
 * **Spreads the groups until the composition has the canvas's shape.**
 *
 * Balanced columns of unequal boxes cannot land on an arbitrary aspect — four groups of four
 * different sizes have a handful of possible arrangements and none of them is 1.33 — and the
 * fit is uniform, so whichever axis is short is a margin nothing ever uses. Measured on the
 * owner's folder before this: an arrangement of 0.85 in a canvas of 1.33, which is 0.58 of
 * the canvas's width at best.
 *
 * So the **centres** are scaled on the deficient axis and the boxes are not. That is the one
 * anisotropic operation in this widget and it is legitimate for the reason the rest of the
 * file is built on: the distance between two groups with no relation between them encodes
 * nothing, so stretching it lies about nothing. Every distance *inside* a group is untouched
 * and still drawn at the one uniform scale `fitToBox` applies.
 *
 * Solved as a fixed point because the extents do not scale with the centres: five passes,
 * which settles this well under a unit.
 */
function stretchToAspect(slots: PackSlot[], aspect: number): void {
  if (slots.length < 2) return;
  const extent = (axis: "x" | "y"): { min: number; max: number } => {
    let min = Infinity;
    let max = -Infinity;
    for (const slot of slots) {
      const centre = axis === "x" ? slot.cx : slot.cy;
      const half = axis === "x" ? slot.halfWidth : slot.halfHeight;
      min = Math.min(min, centre - half);
      max = Math.max(max, centre + half);
    }
    return { min, max };
  };
  for (let pass = 0; pass < 5; pass += 1) {
    const horizontal = extent("x");
    const vertical = extent("y");
    const width = horizontal.max - horizontal.min;
    const height = vertical.max - vertical.min;
    if (width <= 0 || height <= 0) return;
    const current = width / height;
    if (Math.abs(Math.log(current / aspect)) < 0.005) return;
    if (current < aspect) {
      const factor = (aspect * height) / width;
      for (const slot of slots) slot.cx *= factor;
    } else {
      const factor = width / (aspect * height);
      for (const slot of slots) slot.cy *= factor;
    }
  }
}
