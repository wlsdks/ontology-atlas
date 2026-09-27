import { cssLengthToPx, rootFontPx } from "@/shared/ui/root-font-size";

/**
 * The canvas ink, resolved from CSS once, since canvas 2D cannot read `var()` (as the map's
 * `read-map-tokens.ts`). `app/globals.css` is the only source, so no literal colour lives
 * here, and a missing token throws, or it renders as an invisible off-system colour.
 */

export interface LibraryGraphInk {
  /** The opaque ground. The canvas is `alpha: false`, so it paints its own. */
  ground: string;
  /** A page, the picture's subject: the brightest ink, since small marks cannot rank by size. */
  page: string;
  /** A raw source: the dimmest ink, since a file is what a page stands on. */
  source: string;
  /** A concept the page reaches into. Drawn as a ring, so this is its stroke. */
  concept: string;
  /**
   * Every unselected edge; the dash alone names the relation, leaving value for selection.
   * A text ink, not a border ink: edges are content, so WCAG 1.4.11's 3:1 applies (5.23:1).
   */
  edge: string;
  /** The one accent: the selected node and every edge that touches it — the base indigo. */
  selected: string;
  /** The selected node's ring: the next step of the same indigo family, never a second hue. */
  selectedRing: string;
  /** A real failed operation. This is not inferred from an absent completion. */
  danger: string;
  /** The one amber: a citation the folder can no longer vouch for, in the strip clause's warning hue. */
  stale: string;
  /**
   * The ground a page clears around itself, a shade above the canvas so many meeting lines
   * read as the page sitting on them, not a hole. One flat fill, never a glow.
   */
  pageHalo: string;
  /** The neutral ring a hovered node wears. Pointing is not choosing. */
  hoverRing: string;
  /** Hover label surface, its hairline, and its ink. */
  labelSurface: string;
  labelBorder: string;
  labelInk: string;
  /** The family the label is set in — the app's own, read from the element. */
  fontFamily: string;
  /** The ink a file's name is set in: one step above the mark, so a 9.5px name is readable. */
  sourceLabel: string;
  /**
   * Name sizes read from the ramp, never copied: `--text-label` for a page (larger steps
   * collide and hide names), `--text-caption` for a file or concept.
   */
  pageLabelPx: number;
  labelPx: number;
  captionPx: number;
}

const TYPE_TOKENS = {
  pageLabelPx: "--text-label",
  labelPx: "--text-label",
  captionPx: "--text-caption",
} as const;

const TOKENS = {
  ground: "--color-canvas",
  page: "--color-text-primary",
  source: "--color-text-quaternary",
  concept: "--color-text-quaternary",
  edge: "--color-text-quaternary",
  selected: "--color-indigo-brand",
  selectedRing: "--color-indigo-accent",
  danger: "--color-status-danger",
  stale: "--color-status-warning",
  pageHalo: "--graph-page-halo",
  sourceLabel: "--color-text-tertiary",
  hoverRing: "--color-border-strong",
  labelSurface: "--color-elevated",
  labelBorder: "--color-border-strong",
  labelInk: "--color-text-primary",
} as const;

/** Thrown, never caught: see `readLibraryGraphInk`. Local because nothing recovers from it. */
class LibraryGraphInkError extends Error {}

/** Resolves every token against a live element, throwing on the first empty one, since `""` draws nothing. */
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
  const ink = {} as Record<string, string | number>;
  for (const [key, token] of Object.entries(TOKENS)) ink[key] = read(token);
  ink.fontFamily = style.fontFamily || "system-ui, sans-serif";
  // The ramp is in `rem`: `parseFloat` would pass the guard below and be off by sixteen, so
  // `cssLengthToPx` resolves it against the live root size.
  const root = rootFontPx();
  for (const [key, token] of Object.entries(TYPE_TOKENS)) {
    const px = cssLengthToPx(read(token), root);
    if (!Number.isFinite(px) || px <= 0) {
      throw new LibraryGraphInkError(
        `library-graph: ${token} resolved to "${read(token)}" — a name cannot be set in it`,
      );
    }
    ink[key] = px;
  }
  return ink as unknown as LibraryGraphInk;
}
