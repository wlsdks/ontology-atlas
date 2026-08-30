import { splitSummaryLines } from './summary-lines';

/**
 * Where each stroke's sentence sits on the canvas, and which sentences give way.
 *
 * ⚠️ **Every stroke at rest says what the dock said** (Direction B, owner, 2026-08-30). The two
 * references the owner pointed at both put a sentence on the line: one as a label mid-stroke, one
 * beside a dashed edge. Ours carried nothing but a count on focus, and the sentences lived in a
 * dock that was closed by default. The dock's own strings are reused verbatim; nothing is
 * generated, and a stroke whose sentence has no room draws no sentence rather than a cropped one.
 *
 * Placement is decided by the axis the chain runs on:
 * - **down** (1512): an adjacent pair's sentence sits in the ground left of the column,
 *   right-aligned to the boxes, on the gap between the two boxes it joins. A skip's sentence sits
 *   right of the column beside its own arc, at the swing point that belongs to that arc alone.
 * - **across** (1920): an adjacent pair's sentence sits above the chain on one of two alternating
 *   tiers, centred on the gap, so neighbours never touch. A skip's sentence sits below its arc.
 *
 * Every candidate gets a character budget from the room it has (same 4.7px glyph the box captions
 * use), then a rectangle; a rectangle that would touch a box or an earlier sentence is dropped,
 * and the drop is stated (`hidden`) so a gate can count it.
 */

type SentenceAxis = 'across' | 'down';

export interface SentenceEdge {
  from: string;
  to: string;
  kind: 'permitted' | 'traffic';
  count?: number;
  columnSpan: number;
  violated: boolean;
}

export interface SentencePlacement {
  key: string;
  from: string;
  to: string;
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end' | 'middle';
  /** Present when the sentence is not drawn, with the reason. */
  hidden?: 'no-room' | 'collision';
  /** The drawn rectangle, for gates. Absent when hidden. */
  rect?: { x: number; y: number; width: number; height: number };
}

export interface SentenceLayoutInput {
  axis: SentenceAxis;
  edges: readonly SentenceEdge[];
  /** Top-left corner of each box, in SVG units. */
  placed: ReadonlyMap<string, { x: number; y: number }>;
  boxW: number;
  boxH: number;
  rowGap: number;
  colGap: number;
  /** From a box's centre line to the apex of a skip's arc, per edge (the canvas's own `swing`). */
  swingOf: (edge: SentenceEdge) => number;
  /** Ground to the left of the column (down) or above the chain (across), in SVG units. */
  leadRoom: number;
  /** Ground right of the column (down) or below the chain (across) past the deepest arc. */
  trailRoom: number;
  sentenceOf: (edge: SentenceEdge) => string;
}

/** The same conservative glyph width the box captions budget with. */
const CHAR_PX = 4.7;
const LINE_H = 12;
/** Air between a sentence and the box or stroke it belongs to. */
const GAP_TO_BOX = 20;
const GAP_TO_ARC = 10;
const TIER_1 = 16;
const TIER_2 = 32;
const MIN_CHARS = 12;

function budgetFor(roomPx: number): number {
  return Math.floor(roomPx / CHAR_PX);
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  pad = 4,
): boolean {
  return (
    a.x < b.x + b.width + pad &&
    a.x + a.width + pad > b.x &&
    a.y < b.y + b.height + pad &&
    a.y + a.height + pad > b.y
  );
}

export function placeEdgeSentences(input: SentenceLayoutInput): SentencePlacement[] {
  const { axis, edges, placed, boxW, boxH, rowGap, colGap, swingOf, leadRoom, trailRoom, sentenceOf } =
    input;
  const boxes = [...placed.values()].map((p) => ({ x: p.x, y: p.y, width: boxW, height: boxH }));
  const taken: { x: number; y: number; width: number; height: number }[] = [];
  const pitch = axis === 'across' ? boxW + colGap : boxH + rowGap;

  /* Rules first, then the busiest traffic: when two sentences compete for one place the one a
     reader needs to see the chain wins. */
  const ordered = [...edges].sort(
    (a, b) =>
      (a.kind === 'permitted' ? 0 : 1) - (b.kind === 'permitted' ? 0 : 1) ||
      a.columnSpan - b.columnSpan ||
      (b.count ?? 0) - (a.count ?? 0),
  );

  const out: SentencePlacement[] = [];
  let tierFlip = 0;
  for (const edge of ordered) {
    const a = placed.get(edge.from);
    const b = placed.get(edge.to);
    const key = `${edge.from}>${edge.to}`;
    const full = sentenceOf(edge);
    if (!a || !b) continue;
    const isSkip = edge.columnSpan > 1;

    let x: number;
    let y: number;
    let anchor: SentencePlacement['anchor'];
    let roomPx: number;
    if (axis === 'down') {
      const sy = a.y + boxH;
      const ty = b.y;
      if (!isSkip) {
        x = Math.min(a.x, b.x) - GAP_TO_BOX;
        y = (sy + ty) / 2 + 4;
        anchor = 'end';
        roomPx = leadRoom - GAP_TO_BOX - 12;
      } else {
        const swingX = Math.max(a.x, b.x) + boxW / 2 + swingOf(edge);
        x = swingX + GAP_TO_ARC;
        y = (sy + ty) / 2 + 4;
        anchor = 'start';
        roomPx = trailRoom - GAP_TO_ARC - 12;
      }
    } else {
      const sx = a.x + boxW;
      const tx = b.x;
      if (!isSkip) {
        const tier = tierFlip % 2 === 0 ? TIER_1 : TIER_2;
        tierFlip += 1;
        x = (sx + tx) / 2;
        y = Math.min(a.y, b.y) - tier;
        anchor = 'middle';
        roomPx = Math.min(2 * pitch - 24, leadRoom > 0 ? 2 * pitch - 24 : 0);
      } else {
        const midY = Math.max(a.y, b.y) + boxH / 2 + swingOf(edge);
        x = (sx + tx) / 2;
        y = midY + 16;
        anchor = 'middle';
        roomPx = Math.min(edge.columnSpan * pitch - 24, trailRoom > 0 ? edge.columnSpan * pitch - 24 : 0);
      }
    }

    const budget = budgetFor(roomPx);
    if (budget < MIN_CHARS) {
      out.push({ key, from: edge.from, to: edge.to, text: full, x, y, anchor, hidden: 'no-room' });
      continue;
    }
    const [text] = splitSummaryLines(full, budget, 1);
    const width = text.length * CHAR_PX;
    const rect = {
      x: anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x,
      y: y - 9,
      width,
      height: LINE_H,
    };
    if (boxes.some((box) => intersects(rect, box)) || taken.some((t) => intersects(rect, t))) {
      out.push({ key, from: edge.from, to: edge.to, text, x, y, anchor, hidden: 'collision' });
      continue;
    }
    taken.push(rect);
    out.push({ key, from: edge.from, to: edge.to, text, x, y, anchor, rect });
  }
  return out;
}
