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
  /**
   * Whether the stroke is drawn right now (a skip appears only on focus or when violated).
   * Defaults to true. A stroke that is not drawn places last and holds no ground, so an
   * invisible sentence never silences a visible one, and its arc is no obstacle to anyone.
   */
  drawn?: boolean;
}

export interface SentencePlacement {
  key: string;
  /**
   * The stroke's kind. A rule and a measurement can join the same pair, and a placement keyed
   * on the pair alone gave two placements one identity: React reconciled the pair's two
   * sentences under one key and, after a selection re-rendered the list, left a stale copy in
   * the DOM on top of the live one (measured 2026-08-30: the rule drawn twice, the count's
   * sentence coloured as a rule).
   */
  kind: SentenceEdge['kind'];
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
  /** Downward skip arcs can leave either side so paired evidence rails never cross each other. */
  skipSide?: 'negative' | 'positive';
  /**
   * Where an adjacent pair's sentence sits on a downward chain. `lead` is the ground left of the
   * column (the compact ladder). `connector` seats it beside the arrow it describes, in the row
   * gap between the two faces it joins, reading to the right — the comparison ladder (2026-09-03:
   * the lead-lane sentence ended 160px from its arrow and read as a floating caption).
   */
  adjacentSeat?: 'lead' | 'connector';
  /** Ground beside the arrow that a `connector` sentence may use, in SVG units. */
  connectorRoom?: number;
  /**
   * Which side of the arrow a `connector` sentence reads on. The contract lane reads to the right,
   * over the gutter; the observation lane reads to the left, into the gutter, because its right
   * side is the lane the skip arcs travel in (e2e, 2026-09-03: the outermost arc ran through the
   * sentence beside the last adjacent arrow).
   */
  connectorSide?: 'right' | 'left' | 'split';
  /**
   * Rectangles another lane already holds, in the same units. The ladder places its two lanes in
   * two calls; without this the rule sentence reading right and the count sentence reading left
   * met in the shared gutter and touched (e2e, 2026-09-03). A later lane gives way, as a later
   * sentence in one lane always did.
   */
  occupied?: readonly { x: number; y: number; width: number; height: number }[];
  sentenceOf: (edge: SentenceEdge) => string;
  /**
   * The role a reader is pointing at or has chosen. Its strokes' sentences place first, so a
   * skip revealed by focus is never silenced by a resting sentence that has receded anyway.
   */
  focus?: string | null;
}

/** The same conservative glyph width the box captions budget with. */
const CHAR_PX = 4.7;
const WIDE_CHAR_PX = 8;
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

function estimatedTextWidth(text: string): number {
  return [...text].reduce(
    (width, character) =>
      width +
      (/[ᄀ-ᇿ㄰-㆏㐀-䶿一-鿿가-힯]/u.test(character)
        ? WIDE_CHAR_PX
        : CHAR_PX),
    0,
  );
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
  const {
    axis,
    edges,
    placed,
    boxW,
    boxH,
    rowGap,
    colGap,
    swingOf,
    leadRoom,
    trailRoom,
    skipSide = 'positive',
    adjacentSeat = 'lead',
    connectorRoom = 0,
    connectorSide = 'right',
    occupied = [],
    sentenceOf,
    focus = null,
  } = input;
  const boxes = [...placed.values()].map((p) => ({ x: p.x, y: p.y, width: boxW, height: boxH }));
  const taken: { x: number; y: number; width: number; height: number }[] = [...occupied];
  const pitch = axis === 'across' ? boxW + colGap : boxH + rowGap;

  /* Rules first, then the busiest traffic: when two sentences compete for one place the one a
     reader needs to see the chain wins. What is not drawn goes last and takes nothing. */
  const touchesFocus = (e: SentenceEdge) => focus !== null && (e.from === focus || e.to === focus);
  const isDrawn = (e: SentenceEdge) => e.drawn !== false;
  /*
   * ⚠️ **A skip's sentence sits outside every arc that passes it, not only its own.** Measured
   * 2026-08-30 (review, 1920, Entities hovered): the sentence beside the shorter of two nested
   * arcs was placed at its own apex, and the longer arc, swinging further out, ran straight
   * through the words. The arcs are the one obstacle the rectangle check could not see. So the
   * swing a sentence keeps clear of is the widest swing of any drawn skip whose run covers the
   * sentence's own midpoint, and the sentence sits just past it.
   */
  const alongOf = (p: { x: number; y: number }) => (axis === 'down' ? p.y : p.x);
  const alongSize = axis === 'down' ? boxH : boxW;
  const clearSwing = (edge: SentenceEdge, mid: number): number => {
    let swing = swingOf(edge);
    for (const other of edges) {
      if (other === edge || other.columnSpan <= 1 || !isDrawn(other)) continue;
      const oa = placed.get(other.from);
      const ob = placed.get(other.to);
      if (!oa || !ob) continue;
      const lo = Math.min(alongOf(oa), alongOf(ob)) + alongSize;
      const hi = Math.max(alongOf(oa), alongOf(ob));
      if (mid > lo && mid < hi) swing = Math.max(swing, swingOf(other));
    }
    return swing;
  };
  const ordered = [...edges].sort(
    (a, b) =>
      (isDrawn(a) ? 0 : 1) - (isDrawn(b) ? 0 : 1) ||
      (touchesFocus(a) ? 0 : 1) - (touchesFocus(b) ? 0 : 1) ||
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
        /*
         * A reviewed rule and measured traffic commonly join the same two roles. Putting both
         * sentences on the left made the rule win the collision test and hid the observation,
         * even after their strokes were drawn apart. The evidence grammar already owns two sides:
         * reviewed policy reads on the left, measured traffic on the right.
         */
        const isTraffic = edge.kind === 'traffic';
        if (adjacentSeat === 'connector') {
          /* Beside the arrow: it leaves the lower face's centre, so the words start just right
             of that line and run over the gap that the two faces leave between them. The
             observation lane seats its measured count the same way (installed app, 2026-09-03:
             the count sentence sat 40px right of the column and was cut to "import…"). */
          const centre = Math.min(a.x, b.x) + boxW / 2;
          /* `split` is the one-lane ladder: the rule reads right of the arrow and the count reads
             left of it, so a pair that carries both never seats them on top of each other. */
          const side =
            connectorSide === 'split' ? (isTraffic ? 'left' : 'right') : connectorSide;
          x = side === 'left' ? centre - GAP_TO_ARC : centre + GAP_TO_ARC;
          y = (sy + ty) / 2 + 4;
          anchor = side === 'left' ? 'end' : 'start';
          roomPx = connectorRoom - GAP_TO_ARC - 12;
        } else {
          x = isTraffic
            ? Math.max(a.x, b.x) + boxW + GAP_TO_BOX
            : Math.min(a.x, b.x) - GAP_TO_BOX;
          y = (sy + ty) / 2 + 4;
          anchor = isTraffic ? 'start' : 'end';
          roomPx = (isTraffic ? trailRoom : leadRoom) - GAP_TO_BOX - 12;
        }
      } else {
        const clear = clearSwing(edge, (sy + ty) / 2);
        const negative = skipSide === 'negative';
        const swingX = negative
          ? Math.min(a.x, b.x) + boxW / 2 - clear
          : Math.max(a.x, b.x) + boxW / 2 + clear;
        x = swingX + (negative ? -GAP_TO_ARC : GAP_TO_ARC);
        y = (sy + ty) / 2 + 4;
        anchor = negative ? 'end' : 'start';
        roomPx =
          (negative ? leadRoom : trailRoom) -
          Math.max(0, clear - boxW / 2) -
          GAP_TO_ARC -
          12;
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
        const midY = Math.max(a.y, b.y) + boxH / 2 + clearSwing(edge, (sx + tx) / 2);
        x = (sx + tx) / 2;
        y = midY + 16;
        anchor = 'middle';
        roomPx = Math.min(edge.columnSpan * pitch - 24, trailRoom > 0 ? edge.columnSpan * pitch - 24 : 0);
      }
    }

    const budget = budgetFor(roomPx);
    if (budget < MIN_CHARS) {
      out.push({ key, kind: edge.kind, from: edge.from, to: edge.to, text: full, x, y, anchor, hidden: 'no-room' });
      continue;
    }
    let fittedBudget = budget;
    let [text] = splitSummaryLines(full, fittedBudget, 1);
    let width = estimatedTextWidth(text);
    let rect = {
      x: anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x,
      y: y - 9,
      width,
      height: LINE_H,
    };
    let collision =
      width > roomPx ||
      boxes.some((box) => intersects(rect, box)) ||
      taken.some((item) => intersects(rect, item));
    /* A focused role can reveal two nested skips on one baseline. Preserve both sentences by
       tightening only the later candidate until their measured script-aware rectangles clear;
       hiding the whole second sentence made a selected stroke less informative than rest. */
    while (collision && fittedBudget > MIN_CHARS) {
      fittedBudget -= 1;
      [text] = splitSummaryLines(full, fittedBudget, 1);
      width = estimatedTextWidth(text);
      rect = {
        x: anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x,
        y: y - 9,
        width,
        height: LINE_H,
      };
      collision =
        width > roomPx ||
        boxes.some((box) => intersects(rect, box)) ||
        taken.some((item) => intersects(rect, item));
    }
    if (collision) {
      out.push({ key, kind: edge.kind, from: edge.from, to: edge.to, text, x, y, anchor, hidden: 'collision' });
      continue;
    }
    if (isDrawn(edge)) taken.push(rect);
    out.push({ key, kind: edge.kind, from: edge.from, to: edge.to, text, x, y, anchor, rect });
  }
  return out;
}
