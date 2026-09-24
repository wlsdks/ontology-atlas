import { useState, type CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import { OntologyMapKindGlyph } from "@/shared/ui";
import { relationTypeIndigo } from "../../lib/relation-type-tone";
import type {
  DomainCouplingBoundaryRow,
  DomainCouplingGrid,
  DomainCouplingPairRow,
} from "../../lib/domain-coupling-rows";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { INSIGHTS_LIST, INSIGHTS_LIST_ROW } from "../parts/insights-list";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/page-frame";
import { controlClass } from '@/shared/ui/control-class';

export interface DomainCouplingCardLabels {
  title: string;
  /**
   * The unit of the card heading's number. When two cards side by side put 55 (cross
   * relations) and 6 (domains) in the same slot, 55 reads as a domain count without a unit word.
   */
  countUnit: string;
  boundaryCountUnit: string;
  emptyTitle: string;
  emptyDescription: string;
  /** The next step offered in the empty state — an explanation with nowhere to go is an empty room. */
  emptyAction: string;
  emptyActionHref: string;
  boundaryTitle: string;
  boundarySelfLabel: string;
  boundaryCrossLabel: string;
  boundaryCaption: string;
  /** One line under the grid — how to read the colour and the diagonal. */
  gridCaption: string;
  /** What the detail slot says when no cell is selected. */
  gridSelectHint: string;
  /** When domains exceed the limit — "top 6 / 9 domains total". */
  gridTruncated: (shown: number, total: number) => string;
  /** Cross relations involving domains outside the grid — a footnote, so nothing is quietly reduced. */
  gridHiddenCross: (count: number) => string;
  gridCellAria: (from: string, to: string, count: number) => string;
  gridSelfAria: (domain: string, count: number) => string;
}

interface DomainCouplingCardLink {
  /** Clicking either end node of an example edge deeplinks to that node on the map (the same contract as rows in other tabs). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

export interface DomainCouplingCardProps {
  domainCount: number;
  crossDomainEdgeCount: number;
  /** The actual connections a grid cell expands to — the cell → pair lookup table. */
  pairs: DomainCouplingPairRow[];
  grid: DomainCouplingGrid;
  boundaries: DomainCouplingBoundaryRow[];
  /** Total domains that have connections — stated in a footnote when the list is truncated at the limit. */
  boundaryTotalCount: number;
  isColdStart: boolean;
  edgeTypeLabel: (type: string) => string;
  nodeLink: DomainCouplingCardLink;
  labels: DomainCouplingCardLabels;
}

/**
 * "Domain coupling" — the UI consumer of `computeDomainCouplingMatrix` (shared/lib, already
 * used by MCP `domain_matrix`). The computation is reused as is; only the shape changes.
 *
 * Left: a domain × domain **heat grid**. Standing the pairs up as a vertical list gives 22
 * rows, and such a list states only "pairs that are entangled" while never showing
 * "combinations that are not" — even though where the boundary broke is this card's question.
 * A grid shows empty cells as facts too, and folds 22 rows into a 6×6 that fits one screen.
 * Saturation is value variation within a single indigo (zero new hues), and a number stays in
 * each cell so colour is not the only channel. The diagonal (connections inside one domain) is
 * not a crossing, so it is neutral.
 * Right: the self/cross ratio per domain ("boundary pressure") — arithmetic over the same
 * matrix's `domains[]`. The bar draws exactly one value: **the cross share**. It once drew the
 * total (`self+cross`) and sorted by the total, while the caption told readers "a higher cross
 * share means the boundary is leaking" — measured 2026-07-26 against the dogfood vault, those
 * two orderings were nearly inverse, so anyone skimming the bars read the worst domain as the
 * safest. The caption is the promise and the picture follows it. The total is stated verbatim
 * by the numbers on the same row (`inside N · cross M`).
 *
 * Cold start — with fewer than two domains or zero cross edges, one explicit empty state is
 * drawn instead of an empty or misleading grid.
 */
export function DomainCouplingCard({
  domainCount,
  crossDomainEdgeCount,
  pairs,
  grid,
  boundaries,
  boundaryTotalCount,
  isColdStart,
  edgeTypeLabel,
  nodeLink,
  labels,
}: DomainCouplingCardProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const pairByKey = new Map<string, DomainCouplingPairRow>(
    pairs.map((pair) => [`${pair.fromId}->${pair.toId}`, pair]),
  );
  const selected = selectedKey ? pairByKey.get(selectedKey) ?? null : null;

  if (isColdStart) {
    return (
      /*
       * **An empty state is a stage** (measured 2026-08-12). Before the height chain was joined,
       * this card sat at the top at 1368 wide × 118 tall with 614px of dead space below it — the
       * same illness as the empty skills screen (a band of three inks spread to the walls, with a
       * hole beneath). The same prescription applies: the content is gathered to the stage width
       * (`PAGE_COLUMN_STAGE`, the same 640 as the assembly entrance and the skills empty state),
       * and the remaining height is owned by this wrapper, which centres it.
       */
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
      <section
        aria-label={labels.title}
        data-testid="domain-coupling-empty"
        className={`${PAGE_COLUMN_STAGE} rounded-panel border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] text-center`}
      >
        <p className="text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{labels.emptyTitle}</p>
        <p className="mt-1.5 text-body text-[color:var(--color-text-tertiary)]">{labels.emptyDescription}</p>
        <Link
          href={labels.emptyActionHref}
          data-testid="domain-coupling-empty-action"
          className={controlClass({ hoverInk: 'strong', shape: "link", tone: "accent", className: "mt-3 rounded-chip hover:underline" })}
        >
          {labels.emptyAction}
        </Link>
      </section>
      </div>
    );
  }

  return (
    // The width split is inverted. The grid is at most 6×6, so the width it needs is determined
    // within 34rem (name 14rem + 6 × 2.75rem cells + gaps + card padding), while the boundary
    // pressure bars read their share differences better the wider they get. Giving the wider side
    // to the grid empties the grid's right edge (measured 2026-07-26: 45% of the card width) and
    // shortens the bars.
    //
    // Why a fixed 34rem rather than `auto`: an `auto` track absorbs the leftover space and its
    // ceiling is max-content, so **the length of one caption sentence below the card** ends up
    // deciding the card width (measured 746px). Dimensions are a design decision, not a byproduct
    // of sentence length.
    <div className="grid min-h-0 grid-cols-1 gap-[var(--card-gap)] @min-[960px]/insights:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] @min-[960px]/insights:grid-rows-[auto_auto_auto] @min-[960px]/insights:gap-y-0">
      <section
        aria-label={labels.title}
        className={PEER_CARD}
      >
        <CardHead label={labels.title} unit={labels.countUnit} count={crossDomainEdgeCount} />
        {/*
          * ⚠️ **The selection sits beside the grid, the reading key on the card's floor.** Under
          * the grid the selection slot left the matrix ~90px short of the card's right edge and a
          * 200px gap between each name and its first cell (review, 2026-09-25), and its 76px floor
          * lifted this card's caption 30px off the line the card beside it ends on. The pane
          * beside the grid is where "here" in the hint points; it wraps under the grid on a
          * narrow card. The one caption closes the card on the same floor as its neighbour.
          */}
        <div className="@container/coupling mt-2.5 mb-2.5 flex min-w-0 flex-wrap items-start gap-x-5 gap-y-3">
          <CouplingGrid
            grid={grid}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            hasPair={(key) => pairByKey.has(key)}
            labels={labels}
          />
          <div data-testid="domain-coupling-selection" className="min-w-[12rem] flex-1 pt-6">
            {selected ? (
              <SelectedPairDetail pair={selected} edgeTypeLabel={edgeTypeLabel} nodeLink={nodeLink} />
            ) : (
              <p className="break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">{labels.gridSelectHint}</p>
            )}
          </div>
        </div>
        <p className="border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-body text-[color:var(--color-text-quaternary)]">
          {grid.totalDomainCount > grid.domains.length
            ? `${labels.gridTruncated(grid.domains.length, grid.totalDomainCount)} · `
            : ""}
          {grid.hiddenCrossEdgeCount > 0 ? `${labels.gridHiddenCross(grid.hiddenCrossEdgeCount)} · ` : ""}
          {labels.gridCaption}
        </p>
      </section>

      <section
        aria-label={labels.boundaryTitle}
        className={PEER_CARD}
      >
        <CardHead label={labels.boundaryTitle} unit={labels.boundaryCountUnit} count={domainCount} />
        <div className={`mt-2 mb-2.5 ${INSIGHTS_LIST}`}>
          {boundaries.map((row) => {
            // The bar is the cross share itself (0–100%). No max-value normalization, because the
            // share is already on a 0–100 scale — dividing again by the list's maximum would
            // produce a "100% bar" somewhere that is not actually 100%.
            const crossPct = Math.round(row.crossRatio * 100);
            const width = crossPct > 0 ? Math.max(2, crossPct) : 0;
            return (
              <div key={row.id} className={`flex flex-col justify-center gap-1.5 ${INSIGHTS_LIST_ROW}`}>
                <div className="flex items-center gap-2 text-body text-[color:var(--color-text-secondary)]">
                  <OntologyMapKindGlyph kind="domain" size={14} className="flex-none" />
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  <span className="flex-none text-label tabular-nums text-[color:var(--color-text-quaternary)]">
                    {labels.boundarySelfLabel} {row.selfEdges} · {labels.boundaryCrossLabel} {row.crossEdges} ({crossPct}%)
                  </span>
                </div>
                <span
                  aria-hidden
                  className="block h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${width}%`, backgroundColor: "var(--color-indigo-a66)" }}
                  />
                </span>
              </div>
            );
          })}
        </div>
        <p className="border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-body text-[color:var(--color-text-quaternary)]">
          {boundaryTotalCount > boundaries.length
            ? `${labels.gridTruncated(boundaries.length, boundaryTotalCount)} · `
            : ""}
          {labels.boundaryCaption}
        </p>
      </section>
    </div>
  );
}

/**
 * ⚠️ **The two peer cards share one anatomy by construction** (review, 2026-09-25). Each card
 * placed its caption with `mt-auto`, so the caption *bottoms* met but a two-line caption beside a
 * one-line one put the two rules 20px apart (y≈639 vs 659 at 1512), and the shorter body left a
 * 30px band above the right caption. On a two-column board each card now spans the three rows of
 * its parent (head, body, caption) as a subgrid: the rules sit on one line, the bodies end on one
 * line, and a card taller than its content cannot occur because no row stretches past the tallest
 * content in it. The parent's row gap is 0 there, so the card's own margins are its rhythm.
 */
const PEER_CARD =
  "flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] @min-[960px]/insights:row-span-3 @min-[960px]/insights:grid @min-[960px]/insights:grid-rows-subgrid @min-[960px]/insights:gap-y-0";

/**
 * A cell's saturation — four indigo alpha steps. Colour is for skimming (where is it noisy?);
 * the exact number is stated by the digit inside the cell. Speaking in colour alone makes the
 * card disappear for someone who cannot read the contrast.
 */
function crossCellTone(count: number, maxCross: number): string | undefined {
  if (count <= 0) return undefined;
  const ratio = maxCross > 0 ? count / maxCross : 1;
  if (ratio <= 0.25) return "var(--color-indigo-a22)";
  if (ratio <= 0.5) return "var(--color-indigo-a32)";
  if (ratio <= 0.75) return "var(--color-indigo-a46)";
  return "var(--color-indigo-a66)";
}

/**
 * The density of a diagonal cell (connections inside one domain) — **neutral**, three steps,
 * scaled to its own maximum.
 *
 * It was once a single `--color-overlay-2` regardless of value. So the two largest numbers in
 * the grid (dogfood: 14 and 10) were the palest cells, and the caption's "the darker the cell,
 * the more …" became false along the diagonal (measured 2026-07-26). Making it respond to the
 * value makes the caption true on both channels.
 *
 * The ramp stops at `--color-overlay-3` (0.10) for contrast. One step further
 * (`--color-border-strong`, 0.14) still leaves `text-secondary` at 6.51:1 on that background,
 * but the cell border (divider) is swallowed by it and the grid lines disappear. The three
 * steps 0.02/0.06/0.10 give secondary text 9.21 / 8.36 / 7.43:1, comfortably above AA (4.5:1).
 */
function selfCellTone(count: number, maxSelf: number): string | undefined {
  if (count <= 0) return undefined;
  const ratio = maxSelf > 0 ? count / maxSelf : 1;
  if (ratio <= 0.34) return "var(--color-overlay-1)";
  if (ratio <= 0.67) return "var(--color-overlay-2)";
  return "var(--color-overlay-3)";
}

function CouplingGrid({
  grid,
  selectedKey,
  onSelect,
  hasPair,
  labels,
}: {
  grid: DomainCouplingGrid;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  hasPair: (key: string) => boolean;
  labels: DomainCouplingCardLabels;
}) {
  // Column headers are numbers — six domain names laid on their side require turning your head
  // to read, and the name is already beside the row header with the same number.
  //
  // The name column is never `1fr`: left to share the card it eats the whole width, putting
  // hundreds of px between the name and the cells so reading one row drags the eye across the screen.
  //
  // The cell size once had two steps (`--coupling-cell`): 28px on narrow screens to prevent
  // horizontal overflow, 44px from lg so the card is filled by the grid —
  // measured 2026-07-26, a 404×197 grid sat inside a 735px card leaving 45% of the right side
  // empty, and that gap made the screen read as unfinished. What grew is data ink, not
  // whitespace (the digits move up one ramp step, 11px → 12.5px).
  //
  // ⚠️ **The cell is sized by the card, not by a breakpoint** (2026-09-25). Two fixed steps
  // (28 / 44px) left three domains as a 180px block in a 510px card, with 84px of dead card under
  // it at 1512 and 215px at 1920. The cell now takes the card's inline size shared out over the
  // columns and clamped: few domains draw large, countable cells that fill the card, and
  // six still fit a phone without horizontal scroll.
  //
  // ⚠️ **One grid, the name column as wide as the longest name** (review, 2026-09-25). Each row
  // was its own grid, so the name column could only be a fixed cap (14rem) and short names stood
  // ~200px from their first cell. The rows are now subgrids of one grid, so `fit-content` sizes
  // the name column once for every row. The cell takes what the card has left after the names
  // (budgeted at 7rem) and the selection pane beside it (12rem), shared over the columns and
  // clamped to 28-52px; when the pane cannot fit, it wraps under the grid.
  const n = Math.max(1, grid.domains.length);
  const template = `fit-content(10rem) repeat(${grid.domains.length}, var(--coupling-cell))`;
  const cell = `clamp(1.75rem, calc((100cqw - 7rem - 12rem - 1.25rem - ${n * 2}px) / ${n}), 3.25rem)`;

  return (
    <div
      role="grid"
      aria-label={labels.title}
      data-testid="domain-coupling-grid"
      className="grid max-w-full gap-0.5"
      style={{ "--coupling-cell": cell, gridTemplateColumns: template } as CSSProperties}
    >
      <div role="row" className="col-span-full grid grid-cols-subgrid items-center">
        {/* The empty header above the name column. `sr-only` is absolute and drops out of the grid
            flow, shifting every column by one — so this is an empty cell that occupies space. */}
        <span role="columnheader" aria-label={labels.title} />
        {grid.domains.map((domain, index) => (
          <span
            key={domain.id}
            role="columnheader"
            title={domain.title}
            className="text-center font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {index + 1}
          </span>
        ))}
      </div>
      {grid.domains.map((from, rowIndex) => (
        <div
          key={from.id}
          role="row"
          className="col-span-full grid grid-cols-subgrid items-center"
        >
          <span
            role="rowheader"
            title={from.title}
            className="flex min-w-0 items-center gap-1.5 pr-2 text-body text-[color:var(--color-text-secondary)]"
          >
            <span className="font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]">
              {rowIndex + 1}
            </span>
            <span className="min-w-0 truncate">{from.title}</span>
          </span>
          {grid.domains.map((to, colIndex) => {
            const count = grid.cells[rowIndex][colIndex];
            const isDiagonal = rowIndex === colIndex;
            const key = `${from.id}->${to.id}`;
            const selectable = !isDiagonal && count > 0 && hasPair(key);
            const label = isDiagonal
              ? labels.gridSelfAria(from.title, count)
              : labels.gridCellAria(from.title, to.title, count);
            const tone = isDiagonal
              ? selfCellTone(count, grid.maxSelf)
              : crossCellTone(count, grid.maxCross);
            // A dashed border says "this cell is a different scale" through a channel other than
            // colour (the charter: category distinctions use border style, not colour). A diagonal
            // cell with value 0 is dashed too, so «no crossing» and «no internal connection» stay
            // distinguishable.
            // ⚠️ **The width must be stated explicitly.** A clickable cell uses `shape: 'icon'`,
            // and that shape emits **hard dimensions** (`w-7` = 28px) — the height is overridden by
            // the `h-` below, but nothing overrode the width, so it stayed 28. Clickability is
            // decided by the data (only when the value > 0 and a pair exists), so one grid mixed
            // 44×44 and 28×44: measured 2026-08-09, **17 square cells and 19 rectangular** out of 36.
            // A grid is a promise that cells are the same size, and once broken the reader reads
            // size as data.
            const shared = `flex h-[var(--coupling-cell)] w-[var(--coupling-cell)] items-center justify-center rounded-micro border font-mono text-body tabular-nums ${
              isDiagonal
                ? "border-dashed border-[color:var(--color-border-strong)]"
                : "border-[color:var(--color-divider)]"
            }`;
            if (!selectable) {
              return (
                <span
                  key={key}
                  role="gridcell"
                  aria-label={label}
                  // A cell carrying a number must exceed AA on any background — quaternary fell
                  // short at 3.97:1 against the darkest diagonal.
                  className={`${shared} ${
                    count > 0
                      ? "text-[color:var(--color-text-secondary)]"
                      : "text-[color:var(--color-text-quaternary)]"
                  }`}
                  style={{ backgroundColor: tone }}
                >
                  {count > 0 ? count : ""}
                </span>
              );
            }
            const isSelected = selectedKey === key;
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-label={label}
                aria-selected={isSelected}
                data-testid="domain-coupling-cell"
                onClick={() => onSelect(isSelected ? null : key)}
                className={controlClass({
                  shape: "icon",
                  /*
                   * ⚠️ **The ink must be stated explicitly.** This cell carries a coloured
                   * background through `style` (`tone`), so falling back to the value layer's
                   * default ink (tertiary) drops the contrast to **2.43:1** — it was dropped once
                   * during a move and the `a11y-vault-backed` ratchet caught it (2026-08-06). Here,
                   * «which background it sits on» decides the ink.
                   */
                  className: `${shared} text-[color:var(--color-text-primary)] hover:border-[color:var(--color-indigo-a46)] ${
                    isSelected ? "ring-1 ring-inset ring-[color:var(--color-indigo-accent)]" : ""
                  }`,
                })}
                style={{ backgroundColor: tone }}
              >
                {count}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SelectedPairDetail({
  pair,
  edgeTypeLabel,
  nodeLink,
}: {
  pair: DomainCouplingPairRow;
  edgeTypeLabel: (type: string) => string;
  nodeLink: DomainCouplingCardLink;
}) {
  return (
    <div data-testid="domain-coupling-pair" className="flex flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
          {pair.fromTitle}
          <span className="mx-1.5 text-[color:var(--color-text-quaternary)]">→</span>
          {pair.toTitle}
        </span>
        {pair.relationCounts.map((rc) => (
          <span
            key={rc.type}
            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 text-label text-[color:var(--color-text-tertiary)]"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: relationTypeIndigo(rc.type) }}
            />
            {edgeTypeLabel(rc.type)} × {rc.count}
          </span>
        ))}
      </div>
      {/* A 10px vertical gap (`gap-2.5`) is the value required by the WCAG 2.5.8 (AA) spacing
          exception. The links on this row are `text-label` (11px/16px) with a natural height of
          16px, below the 24px main rule. Qualifying for the exception requires **a 24px-diameter
          circle that does not meet a neighbouring target**, so centre-to-centre distance must be
          at least 24px — with `gap-1` (4px) it was 16 + 4 = **20.0px** (measured 2026-08-04,
          1512×900 static export). At 10px it becomes 26.0px and clears the exception.

          Two reasons the other branch (raising the height to 24px to satisfy the main rule) was
          not taken: ① a changed row height makes the detail slot this card reserves jump by 24px
          per click (widening the gap alone costs 12px); ② the link height floor is being
          redesigned separately in the value layer (`control-class`), and settling one site here
          first would split the spec in two.

          ⚠️ Widening only the hit area with `.touch-hit-expand` is **forbidden**. At a 26px row
          pitch a 44px expansion overlaps neighbours by 18px, and in DOM order a later row steals
          the earlier row's tap — "too small to press" becomes "pressed it and something else
          opened". Gate: `tests/e2e/dense-row-target-size.spec.ts`. */}
      <div className="flex flex-col gap-2.5">
        {pair.examples.map((example) => (
          <div
            key={example.id}
            className="flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]"
          >
            <Link
              href={nodeLink.href(example.fromId)}
              aria-label={nodeLink.ariaLabel(example.fromTitle)}
              data-testid="domain-coupling-example-link"
              className={controlClass({ shape: "link", tone: "muted", className: "min-w-0 truncate rounded-micro hover:text-[color:var(--color-text-primary)] hover:underline" })}
            >
              {example.fromTitle}
            </Link>
            <span className="flex-none">→</span>
            <Link
              href={nodeLink.href(example.toId)}
              aria-label={nodeLink.ariaLabel(example.toTitle)}
              data-testid="domain-coupling-example-link"
              className={controlClass({ shape: "link", tone: "muted", className: "min-w-0 truncate rounded-micro hover:text-[color:var(--color-text-primary)] hover:underline" })}
            >
              {example.toTitle}
            </Link>
            <span className="flex-none text-[color:var(--color-text-quaternary)]">
              ({edgeTypeLabel(example.type)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardHead({ label, unit, count }: { label: string; unit: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">{label}</InsightsSectionTitle>
      <span className="ml-auto flex items-baseline gap-1.5">
        <span className="text-label text-[color:var(--color-text-quaternary)]">{unit}</span>
        <span className="font-mono text-body tabular-nums text-[color:var(--map-numeral-face)]">
          {count}
        </span>
      </span>
    </div>
  );
}
