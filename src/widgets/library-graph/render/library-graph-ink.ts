/**
 * The canvas ink, resolved from CSS once.
 *
 * Canvas 2D cannot read a `var()`, so the tokens have to be resolved to strings — the
 * same adapter the map's `read-topology-v2-tokens.ts` is, and for the same reason. Two
 * of its rules are kept deliberately:
 *
 * 1. **`app/globals.css` stays the only source.** Nothing here invents a colour, and a
 *    hex literal in this file would be a second palette that no token gate can see.
 * 2. **A missing token throws.** Silently falling back to a default is how a deleted or
 *    mistyped token becomes an invisible off-system colour that still renders.
 *
 * This graph reads only tokens the rest of the product already uses. It defines no
 * `--library-graph-*` names, because a token with one consumer is a value with a longer
 * name, and adding one to `app/globals.css` would be a design-contract change.
 */

export interface LibraryGraphInk {
  /** The opaque ground. The canvas is `alpha: false`, so it paints its own. */
  ground: string;
  /** A page — what somebody wrote. The brightest neutral on the canvas. */
  page: string;
  /** A raw source: a file kept verbatim. */
  source: string;
  /** A concept the page reaches into. Drawn as a ring, so this is its stroke. */
  concept: string;
  /**
   * Every unselected edge, whichever relation it carries.
   *
   * **One ink, one channel.** The relation is said by the dash pattern alone, so value
   * is left free to say the only other thing this picture encodes: whether an edge
   * touches the selection. Giving `cites` and `mentions` two neutral values as well
   * would have spent a channel on a distinction the dash already makes, and made the
   * fainter of the two the hardest mark on the canvas to see.
   *
   * ⚠️ **It is a text ink, not a border ink, and that is deliberate** (design-lead and
   * design-infoviz, 2026-09-06). The first build borrowed the map's edge stratum —
   * `--color-border-strong`, 1.41:1 on this ground — and the council rejected the
   * borrowing: the map quiets thousands of edges, this canvas has eight and **they are
   * the content**. WCAG 1.4.11 asks 3:1 of a graphical object needed to understand what
   * is drawn, and a citation line is exactly that. `--color-text-quaternary` composites
   * to 5.23:1 and is still the dimmest ink on the canvas, below every node mark.
   */
  edge: string;
  /** The one accent: the selected node and every edge that touches it — the base indigo. */
  selected: string;
  /** The selected node's ring: the next step of the same indigo family, never a second hue. */
  selectedRing: string;
  /** The neutral ring a hovered node wears. Pointing is not choosing. */
  hoverRing: string;
  /** Hover label surface, its hairline, and its ink. */
  labelSurface: string;
  labelBorder: string;
  labelInk: string;
  /** The family the label is set in — the app's own, read from the element. */
  fontFamily: string;
}

const TOKENS = {
  ground: "--color-canvas",
  page: "--color-text-secondary",
  source: "--color-text-tertiary",
  concept: "--color-text-quaternary",
  edge: "--color-text-quaternary",
  selected: "--color-indigo-brand",
  selectedRing: "--color-indigo-accent",
  hoverRing: "--color-border-strong",
  labelSurface: "--color-elevated",
  labelBorder: "--color-border-strong",
  labelInk: "--color-text-primary",
} as const;

/** Thrown, never caught: see `readLibraryGraphInk`. Local because nothing recovers from it. */
class LibraryGraphInkError extends Error {}

/**
 * Resolves every token against a live element. Throws on the first empty value, naming
 * it — a canvas drawn in `""` is invisible, and an invisible defect is the expensive one.
 */
export function readLibraryGraphInk(element: Element): LibraryGraphInk {
  const style = getComputedStyle(element);
  const read = (token: string): string => {
    const value = style.getPropertyValue(token).trim();
    if (!value) {
      throw new LibraryGraphInkError(
        `library-graph: ${token} resolved to nothing — the canvas would draw in no colour`,
      );
    }
    return value;
  };
  const ink = {} as Record<string, string>;
  for (const [key, token] of Object.entries(TOKENS)) ink[key] = read(token);
  ink.fontFamily = style.fontFamily || "system-ui, sans-serif";
  return ink as unknown as LibraryGraphInk;
}
