import type { LayoutPoint } from "./library-graph-layout";
import type { LibraryGraph, LibraryGraphSourceState } from "./build-library-graph";

/**
 * **Where the card stands, and which lines flow while it is open.**
 *
 * The two pure halves of "a press on a mark opens a card beside it" live here, away from
 * the surface that renders them and away from the loop that paints the canvas, because
 * both are claims a test can settle without a browser: a rectangle beside a dot never
 * covers the dot, and the lines that carry the drift are exactly this page's citations.
 *
 * The interaction itself is the map's, not this canvas's invention: a press on a node
 * focuses its neighbourhood and hangs a compact surface beside it, and full detail is an
 * explicit action inside that surface (`.claude/rules/forbidden.md`, "Node click →
 * full-screen or full-bleed detail modal" — the popover is the standing rule).
 */

/** The card never grows past this, whatever its content — direction B, 2026-09-12. */
export const LIBRARY_CARD_MAX_WIDTH = 320;

/** Room between the mark's own edge and the card's, in CSS px. */
export const LIBRARY_CARD_GAP = 10;

/** Room kept between the card and the canvas's own edges. */
export const LIBRARY_CARD_INSET = 8;

/** How many neighbours the card lists before it offers the rest behind one control. */
export const LIBRARY_CARD_ROWS = 5;

export type LibraryGraphCardSide = "right" | "left" | "below" | "above";

export interface LibraryGraphCardPlacement {
  left: number;
  top: number;
  side: LibraryGraphCardSide;
  /**
   * The tallest the card may be here, so it scrolls inside instead of leaving the canvas.
   *
   * ⚠️ **Without it the guarantee below is unsatisfiable.** A 220px card beside a mark in
   * the middle of a 460px-tall canvas has 208px under it and 218px over it: *no* placement
   * both clears the mark and stays in the box, so something has to give, and the honest
   * thing to give is the card's own height — the map's inspector has scrolled inside
   * `--map-inspector-max-height` for the same reason since it existed. Measured before
   * this existed: the card's bottom edge stood 11.4px past the canvas at 616×460.
   */
  maxHeight: number;
}

/**
 * The card's place, in the canvas's own CSS pixels.
 *
 * Four rules, in this order, and every one of them is a measurement in
 * `library-graph-card.test.ts`:
 *
 * 1. **Beside the mark, never over it.** The preferred side is the mark's right, so the
 *    card's near edge starts one gap past the mark's own radius; the axis it is placed on
 *    is therefore disjoint from the mark's, and clamping the *other* axis cannot bring the
 *    two together. A card covering the dot a person just pressed is the defect direction B
 *    names first.
 * 2. **Flip rather than spill.** With no room on the right the card goes left; with no room
 *    on either side — a narrow canvas, a mark in the middle — it goes below the mark, and
 *    above it when there is more room there.
 * 3. **Inside the canvas box, scrolling if it must.** The box is the canvas element's own
 *    rect, which begins *below* the caption row and the strip, so a card clamped into it
 *    cannot cover either. That is why this takes the canvas box rather than the window: the
 *    strip needs no special case to be safe from.
 * 4. **Nothing moves the mark.** This returns where the *card* goes. The picture is
 *    untouched (`docs/DECISIONS.md`, 2026-09-08 "The Library graph stands still").
 */
export function placeLibraryGraphCard({
  mark,
  markRadius,
  card,
  box,
  gap = LIBRARY_CARD_GAP,
  inset = LIBRARY_CARD_INSET,
}: {
  /** The mark's centre, in canvas CSS pixels. */
  mark: LayoutPoint;
  /** Its drawn radius — a source's square is measured by its half-extent, as it is drawn. */
  markRadius: number;
  /** The card's measured size. */
  card: { width: number; height: number };
  box: { width: number; height: number };
  gap?: number;
  inset?: number;
}): LibraryGraphCardPlacement {
  const reach = markRadius + gap;
  const clamp = (value: number, min: number, max: number): number =>
    max < min ? min : Math.min(max, Math.max(min, value));
  const horizontal = (width: number): number =>
    clamp(mark.x - width / 2, inset, box.width - inset - width);

  const roomRight = box.width - inset - (mark.x + reach);
  const roomLeft = mark.x - reach - inset;
  const beside = Math.min(card.height, Math.max(0, box.height - inset * 2));
  const besideTop = clamp(mark.y - beside / 2, inset, box.height - inset - beside);

  if (roomRight >= card.width) {
    return { left: mark.x + reach, top: besideTop, side: "right", maxHeight: beside };
  }
  if (roomLeft >= card.width) {
    return {
      left: mark.x - reach - card.width,
      top: besideTop,
      side: "left",
      maxHeight: beside,
    };
  }

  /*
   * Neither side holds the card: place it on the other axis, where the mark's own row is
   * free. The horizontal clamp is the box's, so a mark near a corner still gets a card
   * fully inside the canvas — and because the card is now above or below the mark, that
   * clamp cannot slide it over the dot.
   */
  const roomBelow = Math.max(0, box.height - inset - (mark.y + reach));
  const roomAbove = Math.max(0, mark.y - reach - inset);
  if (roomBelow >= roomAbove) {
    return {
      left: horizontal(card.width),
      top: mark.y + reach,
      side: "below",
      maxHeight: Math.min(card.height, roomBelow),
    };
  }
  const height = Math.min(card.height, roomAbove);
  return {
    left: horizontal(card.width),
    top: mark.y - reach - height,
    side: "above",
    maxHeight: height,
  };
}

/**
 * **The citation lines a card's mark makes knowledge flow along.**
 *
 * One direction for both cases, because there is only one direction in the product: a
 * source is read and a page is written from it. A page's card drifts its citations
 * *inward* — every file it leans on, arriving at the write-up — and a file's card drifts
 * the same lines *outward*, to the pages that were written from it. Same lines, same
 * travel, read from either end.
 *
 * `mentions` is deliberately excluded. A page naming a concept is not knowledge moving
 * into the page; it is the page pointing at the map, and drifting it would say the concept
 * was a source (design-infoviz's standing rule for this canvas: one mark, one fact).
 */
export function libraryGraphFlowEdges(
  graph: Pick<LibraryGraph, "edges">,
  nodeId: string | null,
): { flow: Set<string>; stale: Set<string> } {
  const flow = new Set<string>();
  const stale = new Set<string>();
  if (!nodeId) return { flow, stale };
  for (const edge of graph.edges) {
    if (edge.relation !== "cites") continue;
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    flow.add(edge.id);
    if (edge.certainty === "unverified") stale.add(edge.id);
  }
  return { flow, stale };
}

/** Every citation the folder can no longer vouch for — what the arrival pulse is about. */
export function libraryGraphStaleEdges(graph: Pick<LibraryGraph, "edges">): Set<string> {
  const stale = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.relation === "cites" && edge.certainty === "unverified") stale.add(edge.id);
  }
  return stale;
}

/**
 * One row of the card's neighbourhood list: the mark at the other end of a relation.
 *
 * `state` is a file's compile state, the same word the list beside this canvas prints;
 * `missing` is the one thing a row can say that no `LibrarySourceRow` can, because the row
 * is gone — a page citing a file that has left the folder.
 */
export interface LibraryGraphCardRow {
  /** The graph id, so a row can name the mark it is about. Null when the file is gone. */
  id: string | null;
  label: string;
  state?: LibraryGraphSourceState | null;
  /** A page row's own freshness, when the card is a file's. */
  freshness?: "current" | "partial" | "behind" | "unchecked";
}

/**
 * **What the card says, handed down by the screen that knows it.**
 *
 * `src/widgets/` sits below `src/views/` in the import direction, so this widget cannot
 * reach the Library's model — and it should not: the Summary's first sentence, a file's
 * byte length and which pages cite it are the *folder's* facts, already derived once in
 * `use-library-model.ts`. The widget owns the surface, the anchoring, the keyboard and the
 * motion; the view owns the facts. Same seam, and same reason, as `headerEnd`.
 *
 * Every field is a **fact**, never a rendered string: the wording is the card's, so one
 * screen cannot drift from another's phrasing of the same state.
 */
export interface LibraryGraphCardFacts {
  /** One sentence about the mark: a page's Summary, opening sentence only. */
  sentence?: string | null;
  /**
   * A page's own counts: cited files, citations in its body, concepts named, and how many
   * of those files the folder can no longer vouch for.
   *
   * `cites` is **null when the body has not been read**, never zero — the page text is
   * loaded lazily, and a zero there would be a measurement nobody made.
   */
  counts?: { sources: number; cites: number | null; mentions: number; stale: number };
  /** A file's own facts, in the words the source pane already uses. */
  file?: { format: string; bytes: number; state: LibraryGraphSourceState };
  /** The other end of every relation the mark has, in the model's own order. */
  rows?: readonly LibraryGraphCardRow[];
  /**
   * Whether a draft can be asked for, and why not when it cannot.
   *
   * The door runs the folder's existing Compile brief — there is no second write path and
   * no new agent contract here. When no agent is connected the reason line stands in its
   * place, because a door that cannot open is worse than a sentence saying so.
   */
  refresh?: { onRequest: (() => void) | null; reason: string | null };
  /** Where the file is on disk, when the host can show it. Never a door in the browser. */
  onReveal?: (() => void) | null;
}
