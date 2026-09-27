import { splitSummaryLines } from './summary-lines';

/**
 * Where each stroke's sentence sits (dock strings verbatim): beside or left of a downward chain, on
 * alternating tiers above an across one, skips beyond their arc. A candidate that touches a box or an
 * earlier sentence is dropped and reported as `hidden`, never cropped.
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
   * Whether the stroke is drawn now (a skip appears only on selection or when violated); default true.
   * An undrawn stroke places last and holds no ground.
   */
  drawn?: boolean;
}

export interface SentencePlacement {
  key: string;
  /** A rule and a measurement can join the same pair, so the kind is part of the placement's identity; keyed on the pair alone, React leaves a stale sentence. */
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
   * Where an adjacent pair's sentence sits on a downward chain: `lead` left of the column (compact
   * ladder), or `connector` beside the arrow it describes, in the gap between the two faces.
   */
  adjacentSeat?: 'lead' | 'connector';
  /** Ground beside the arrow that a `connector` sentence may use, in SVG units. */
  connectorRoom?: number;
  /**
   * Which side of the arrow a `connector` sentence reads on. The observation lane reads left because
   * its right side is where the skip arcs travel.
   */
  connectorSide?: 'right' | 'left' | 'split';
  /** Rectangles another lane already holds; a later lane gives way, as a later sentence does. */
  occupied?: readonly { x: number; y: number; width: number; height: number }[];
  sentenceOf: (edge: SentenceEdge) => string;
  /**
   * The role a reader is pointing at or has chosen. Its strokes' sentences place first, so a
   * skip revealed by focus is never silenced by a resting sentence that has receded anyway.
   */
  focus?: string | null;
}

/** Edge-sentence glyph width; captions use 4.8 and a wider script set (summary-lines.ts). */
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

  /* O(E log E + E·(E + C·(B + E))) for E edges, B boxes, C budget retries: greedy first-fit over flat rectangle arrays, no spatial index. */
  /* Drawn first, then focus, rules, shorter spans, busier traffic: the sentence a reader needs wins a contested place. */
  const touchesFocus = (e: SentenceEdge) => focus !== null && (e.from === focus || e.to === focus);
  const isDrawn = (e: SentenceEdge) => e.drawn !== false;
  /*
   * A skip's sentence sits outside every drawn arc whose run covers its midpoint, not only its own:
   * arcs are the one obstacle the rectangle check cannot see.
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
        /* When a rule and traffic join the same roles, the rule reads on the left and the traffic on the right, or the rule wins the collision and hides the count. */
        const isTraffic = edge.kind === 'traffic';
        if (adjacentSeat === 'connector') {
          /* Beside the arrow: the words start right of the lower face's centre line and run over the gap. */
          const centre = Math.min(a.x, b.x) + boxW / 2;
          /* `split`, the one-lane ladder: the rule reads right of the arrow and the count left of it. */
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
    const fitAt = (chars: number) => {
      const [text] = splitSummaryLines(full, chars, 1);
      const width = estimatedTextWidth(text);
      const rect = {
        x: anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x,
        y: y - 9,
        width,
        height: LINE_H,
      };
      const collides =
        width > roomPx ||
        boxes.some((box) => intersects(rect, box)) ||
        taken.some((item) => intersects(rect, item));
      return { text, rect, collides };
    };
    let chars = budget;
    let fit = fitAt(chars);
    /* Two nested focused skips can share a baseline: tighten only the later budget until both clear. */
    while (fit.collides && chars > MIN_CHARS) fit = fitAt(--chars);
    const { text, rect } = fit;
    if (fit.collides) {
      out.push({ key, kind: edge.kind, from: edge.from, to: edge.to, text, x, y, anchor, hidden: 'collision' });
      continue;
    }
    if (isDrawn(edge)) taken.push(rect);
    out.push({ key, kind: edge.kind, from: edge.from, to: edge.to, text, x, y, anchor, rect });
  }
  return out;
}
