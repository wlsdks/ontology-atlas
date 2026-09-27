import type { LayoutPoint } from "./library-graph-layout";
import type { LibraryGraph, LibraryGraphSourceState } from "./build-library-graph";

/**
 * The pure halves of the mark card, testable without a browser: where it stands (never
 * over its mark) and which lines flow while it is open. The popover shape is the standing
 * rule (`.claude/rules/forbidden.md`).
 */

/** The card never grows past this, whatever its content. */
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
   * The tallest the card may be here, scrolling inside past it: in a short canvas no
   * placement both clears the mark and stays in the box, so the card's height gives.
   */
  maxHeight: number;
}

/**
 * The card's place in canvas CSS pixels (each rule tested in `library-graph-card.test.ts`):
 * beside the mark, never over it, right first; flip left, then below or above, whichever
 * has more room; clamped into the canvas box, which lies below the caption row and strip,
 * scrolling if it must. The mark never moves (`docs/DECISIONS.md`, "The Library graph
 * stands still").
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

  // Neither side fits: above or below, where the horizontal clamp cannot slide it over the dot.
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
 * The citations touching a card's mark, which drift file → page from either end. Mentions
 * never drift, or a named concept would read as a source.
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
 * One row of the card's neighbourhood list. `state` is a file's compile state; null means
 * the cited file has left the folder.
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
 * The folder's facts for the card, from `use-library-model.ts`, which a widget cannot
 * import. Facts, never rendered strings, so the wording stays the card's.
 */
export interface LibraryGraphCardFacts {
  /** One sentence about the mark: a page's Summary, opening sentence only. */
  sentence?: string | null;
  /**
   * A page's counts: cited files, citations in its body, concepts named, stale files. The
   * body loads lazily, so `cites` is null until it is read, never zero.
   */
  counts?: { sources: number; cites: number | null; mentions: number; stale: number };
  /** A file's own facts, in the words the source pane already uses. */
  file?: { format: string; bytes: number; state: LibraryGraphSourceState };
  /** The other end of every relation the mark has, in the model's own order. */
  rows?: readonly LibraryGraphCardRow[];
  /**
   * Whether a draft can be asked for through the existing Compile brief (no second write
   * path), and the reason shown instead when no agent is connected.
   */
  refresh?: { onRequest: (() => void) | null; reason: string | null };
  /**
   * Shows where the file is: Finder in the app, a copy of the granted file in the browser
   * (`.claude/rules/surfaces.md`, "Reveal a file in Finder"). One door; the host picks the word.
   */
  onReveal?: (() => void) | null;
  /** True when `onReveal` hands over a copy rather than revealing a place, so the door says so. */
  revealsCopy?: boolean;
}
