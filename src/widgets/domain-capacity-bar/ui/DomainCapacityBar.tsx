import { TopologyV2KindGlyph } from "@/shared/ui";

export interface DomainCapacityBarRow {
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
}

export interface DomainCapacityBarLabels {
  capabilityUnit: string;
  elementUnit: string;
}

export interface DomainCapacityBarProps {
  row: DomainCapacityBarRow;
  labels: DomainCapacityBarLabels;
  /** Responsive width utility classes for the title column — callers place
   * this row in containers of different widths (a dense insights list vs. a
   * full-width project card), so the title column is the one thing left
   * tunable per call site. Defaults to the insights list's column width. */
  titleWidthClassName?: string;
}

/**
 * One domain's **composition** — the ratio between words (capabilities) and evidence
 * (elements).
 *
 * ## This bar does not state size (2026-08-09, owner's choice)
 *
 * Length used to be **size** (the largest domain filled the whole track). But the
 * number immediately to its right was already answering that, and measured, length
 * taught almost nothing new:
 *
 * - The fill ratios were **100 / 94 / 88 / 82 / 76 / 65 / 53 / 47%** — even the
 *   smallest domain filled nearly half the track. With values clustered between 8 and
 *   17, that compression follows directly from the data as long as the denominator is
 *   the maximum.
 * - Meanwhile the bar group used **414 of the card's 685px height (60%)**.
 *
 * So the track was changed to **fill completely, with only the boundary position to
 * read**. What the bar now answers is 「are there many words but thin evidence, or the
 * reverse」 — a fact that previously required mental arithmetic on two numbers. Size is
 * handled entirely by the number column on the right.
 *
 * **Zero new data** — it draws from the two numbers the row already held. Measured: in
 * this repository's vault the boundary spreads between **8% and 60%** (from a domain
 * of 1 capability : 11 elements to one at 3 : 2).
 *
 * ⚠️ **What would show this judgement to be wrong** — if real vaults all have similar
 * composition ratios and the boundary stands in one place, this ink becomes as
 * meaningless as the old length. The example vault (storefront) is in fact 38–57% and
 * nearly flat — which means the demo does not show the variety the product is trying
 * to reveal, and that is homework for the example data rather than for this bar.
 *
 * Two screens share this part (`/ontology/insights`' composition tab and `/projects`
 * cards) — **their meanings must not diverge, so fixes happen in the part.**
 *
 * The colouring follows the app's shared bar grammar — **neutrals plus one indigo**.
 * Capabilities are the primary series, so indigo (`--color-indigo-brand`); elements
 * are neutral (`--color-text-quaternary`); and the boundary is carried not by colour
 * but by a **1px seam** (a gap that lets the track colour show through).
 *
 * Why the kind tones (amber/eucalyptus) were dropped — composited over the track those
 * two measure 1.14:1 in luminance contrast, so they never separated by brightness at
 * all, only by hue. And that hue pair (orange–green) happens to be the axis red-green
 * colour blindness separates worst — for roughly 8% of men this bar was already
 * monochrome. Meanwhile which side is capabilities was already stated three times
 * over by **order** (capabilities always left), **the unit word**, and **the number
 * beside it**. Colour carried no fact and was duplicate ink (Tufte data-ink), so it
 * was removed.
 *
 * Why the seam is essential — indigo and neutral measure 1.12:1 against each other
 * too, so an adjacent boundary is invisible by colour. A 1px seam is a
 * colour-independent separator, guaranteeing "a bar of two values" in colour
 * blindness, greyscale and high-contrast mode (a path WCAG 1.4.11 recognises). It
 * exists only when both values are above 0 — with one value there is nothing to split.
 *
 * No minimum-width floor is applied — a constant floor inflates small values and
 * creates a lie factor. The value of a segment that vanishes below 1px is carried by
 * the number beside it.
 *
 * Decision record: `.qa-scratch/domain-bar-color-2026-07-26.md`. The charter boundary
 * is `docs/DESIGN-SYSTEM.md` "Three ambers, three rules" — the kind palette survives
 * only where colour is the **only** channel carrying identity (the kind census's
 * unlabelled stack, map dots, tree chips).
 */
export function DomainCapacityBar({
  row,
  labels,
  titleWidthClassName = "sm:w-[220px]",
}: DomainCapacityBarProps) {
  // The denominator is **this row's own sum**, not the list's maximum. So the track is
  // always full and what gets compared between rows is not length but **where the
  // boundary sits**.
  const filled = row.capabilityCount + row.elementCount;
  const capWidth = filled > 0 ? (row.capabilityCount / filled) * 100 : 0;
  const elWidth = filled > 0 ? (row.elementCount / filled) * 100 : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5" data-testid="domain-capacity-bar-row">
      <span
        className={`flex w-full shrink-0 items-center gap-2 truncate text-body-lg text-[color:var(--color-text-secondary)] ${titleWidthClassName}`}
      >
        <TopologyV2KindGlyph kind="domain" size={15} />
        <span className="truncate">{row.title}</span>
      </span>
      {/* The track is `aria-hidden` — the same fact (capability N · element M) sits as
          text immediately to its right, so reading it out makes a screen-reader user
          hear the same numbers twice. The 1px seam between the two segments is a flex
          gap. Segments render only when their value is above 0, so the seam exists only
          when both values do — a domain with one side at 0 (say 「words but zero
          evidence」) becomes **a single solid colour**, and that is the state this bar
          says loudest. */}
      <span
        aria-hidden
        data-testid="domain-capacity-bar-track"
        className="flex h-2 min-w-[48px] flex-1 gap-px overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
      >
        {capWidth > 0 ? (
          <span
            data-testid="domain-capacity-bar-capability"
            className="block h-full bg-[color:var(--color-indigo-brand)]"
            style={{ width: `${capWidth}%` }}
          />
        ) : null}
        {elWidth > 0 ? (
          <span
            data-testid="domain-capacity-bar-element"
            className="block h-full bg-[color:var(--color-text-quaternary)]"
            style={{ width: `${elWidth}%` }}
          />
        ) : null}
      </span>
      {/* The tail column is **fixed width**. Leaving the width to the content lets the
          text-width difference between `Capability 4 · Element 110` and `Capability 2 · Element 5` set the
          length of the `flex-1` track beside it, splitting an axis six rows must share
          into three lengths (measured 2026-07-26: 929.8 / 935.5 / 941.2px — an 11.4px
          staircase at the right edge). A domain with smaller values then got a longer
          axis, distorting the comparison value itself by up to 1.2%.
          The 「Connections」 (connections) tab's impact ranking already uses this grammar (fixed
          track plus fixed number column), so its column-width discipline is taken
          verbatim. 192px fits all nine current English Storefront tails without clipping.
          `tabular-nums` is applied to both rows so the digit positions do not shift either. */}
      <span
        data-testid="domain-capacity-bar-tail"
        className="w-[192px] flex-none text-right"
      >
        <span className="block font-mono text-title tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {row.total}
        </span>
        <span
          data-testid="domain-capacity-bar-breakdown"
          className="block truncate font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]"
        >
          {labels.capabilityUnit} {row.capabilityCount} · {labels.elementUnit} {row.elementCount}
        </span>
      </span>
    </div>
  );
}

/**
 * The key identifying the bar's two pieces — drawn **once per bar block**.
 *
 * Repeating a swatch per row (6 rows × 2 = 12) turns the key into noise. Omitting it
 * entirely leaves someone seeing it for the first time, after colour was removed, with
 * no way to know "what is the left piece" except inferring from order. So: one line
 * per bar group.
 *
 * Why `aria-hidden` — this line is the key to a bar graphic that is itself
 * `aria-hidden`. Hiding the graphic and reading out only the key leaves a screen
 * reader with two words and no context. The same fact is carried as text by each row's
 * `Capability N · Element M` caption.
 *
 * It always renders when the bar does — appearing and disappearing makes the space
 * above the bar wobble (dimension regularity).
 */
export function DomainCapacityLegend({
  labels,
  className = "",
}: {
  labels: DomainCapacityBarLabels;
  className?: string;
}) {
  return (
    <p
      aria-hidden
      data-testid="domain-capacity-legend"
      className={`flex items-center gap-3.5 whitespace-nowrap text-label text-[color:var(--color-text-tertiary)] ${className}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]" />
        {labels.capabilityUnit}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-text-quaternary)]" />
        {labels.elementUnit}
      </span>
    </p>
  );
}
