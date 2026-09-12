import { cssLengthToPx, rootFontPx } from "@/shared/ui/root-font-size";

/**
 * The canvas ink, resolved from CSS once.
 *
 * Canvas 2D cannot read a `var()`, so the tokens have to be resolved to strings — the
 * same adapter the map's `read-map-tokens.ts` is, and for the same reason. Two
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
  /**
   * A page — what somebody wrote, and **the subject of this picture**.
   *
   * `--color-text-primary`, the brightest ink the product has. It was
   * `--color-text-secondary` while the marks were large enough to carry hierarchy by size
   * alone; at a fixed 10–18px band on a folder of three hundred files, size can no longer
   * separate the subject from its furniture and value has to.
   */
  page: string;
  /**
   * A raw source: a file kept verbatim. `--color-text-quaternary`, the dimmest ink here —
   * a file is what a page stands on, never what the picture is about.
   */
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
  /** A real failed operation. This is not inferred from an absent completion. */
  danger: string;
  /**
   * **The one amber on this canvas**, and it says exactly one thing: this citation is
   * one the folder can no longer vouch for.
   *
   * `--color-status-warning`, the product's own warning signal, so the dot in a broken
   * citation's gap is the same hue as the `N sources changed` clause the strip above the
   * picture prints. No token is minted here — the rule this file opens with holds.
   */
  stale: string;
  /**
   * **The ground a page mark clears around itself.**
   *
   * A ring of this colour is laid down one line width wider than the mark, so every
   * citation running underneath stops at the disc instead of crossing it. It is
   * `--graph-page-halo` — a token of its own rather than `--color-canvas` reused — because
   * at three hundred marks the ring is doing a second job: with eight or ten lines meeting
   * one page, a halo in the flat ground colour cuts a hole in the picture, and one a shade
   * above it reads as the page *sitting on* the lines rather than as a bite taken out of
   * them. It is not a glow: one flat colour, one width, never animated, and the mark itself
   * is painted over it.
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
   * **The two type steps the names are set in**, `--text-label` for a page and
   * `--text-caption` for a file or a concept — read from the ramp, never copied as a number.
   *
   * ⚠️ A page's name was briefly `--text-body`, which is the step this widget took on
   * 2026-09-12 when twelve marks stood on a 1088×819 field and eleven pixels of grey read as
   * an afterthought. Three hundred documents is the case that number was never measured
   * against: at `--text-body` the page names alone collide 41 times on the 300 fixture and
   * the collision pass hides a third of them, so the step *costs* names. Back to
   * `--text-label`, and a file's name — which only ever appears zoomed in or pointed at —
   * drops to `--text-caption`, so a page's name is the larger of the two wherever both are
   * on the canvas.
   *
   * Both are resolved from CSS rather than written as literals because a literal copy of a
   * ramp step is the drift `motion-token-mirror.contract.test.ts` exists to stop, one
   * namespace over.
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
  const ink = {} as Record<string, string | number>;
  for (const [key, token] of Object.entries(TOKENS)) ink[key] = read(token);
  ink.fontFamily = style.fontFamily || "system-ui, sans-serif";
  // ⚠️ **A ramp step is a length in a unit, not a number.** Since 2026-09-12 the ramp is
  // declared in `rem` so a browser's text-only zoom reaches it, and `--text-label` reads back
  // as `"0.6875rem"`; `Number.parseFloat` on that returns 0.6875 — finite, positive, and off
  // by sixteen, so the guard below passes and the canvas draws its names at two thirds of a
  // pixel. `cssLengthToPx` resolves the unit against the root the page is rendering at, which
  // also means all three steps now follow the reader here exactly as they do in the DOM.
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
