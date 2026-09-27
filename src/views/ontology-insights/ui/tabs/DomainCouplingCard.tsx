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
  /** The unit word for the heading's number, so a cross-relation count beside a domain count is not misread. */
  countUnit: string;
  boundaryCountUnit: string;
  emptyTitle: string;
  emptyDescription: string;
  /** The next step offered in the empty state. */
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
  /** When domains exceed the limit: "top 6 / 9 domains total". */
  gridTruncated: (shown: number, total: number) => string;
  /** Cross relations involving domains outside the grid, stated so nothing is quietly dropped. */
  gridHiddenCross: (count: number) => string;
  gridCellAria: (from: string, to: string, count: number) => string;
  gridSelfAria: (domain: string, count: number) => string;
}

interface DomainCouplingCardLink {
  /** Either end node of an example edge deep-links to that node on the map. */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

export interface DomainCouplingCardProps {
  domainCount: number;
  crossDomainEdgeCount: number;
  /** The links a grid cell expands to, keyed by cell. */
  pairs: DomainCouplingPairRow[];
  grid: DomainCouplingGrid;
  boundaries: DomainCouplingBoundaryRow[];
  /** Domains with connections, stated in a footnote when the list is truncated. */
  boundaryTotalCount: number;
  isColdStart: boolean;
  edgeTypeLabel: (type: string) => string;
  nodeLink: DomainCouplingCardLink;
  labels: DomainCouplingCardLabels;
}

/**
 * Domain coupling, drawn from `computeDomainCouplingMatrix` (also behind MCP `domain_matrix`).
 * Left, a domain x domain heat grid: empty cells are facts too, and each cell keeps its number so colour is
 * not the only channel; the diagonal (inside one domain) is neutral. Right, boundary pressure per domain:
 * the bar draws the cross share the caption names, not the total. Cold start draws one empty state instead.
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
      // The empty state is centred at the stage width (`PAGE_COLUMN_STAGE`) in the remaining height.
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
    // The grid needs at most 34rem, while the pressure bars read better wider, so the grid gets the fixed track.
    // Not `auto`: an auto track grows to max-content, letting one caption sentence decide the card width.
    <div className="grid min-h-0 grid-cols-1 gap-[var(--card-gap)] @min-[960px]/insights:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] @min-[960px]/insights:grid-rows-[auto_auto_auto] @min-[960px]/insights:gap-y-0">
      <section
        aria-label={labels.title}
        className={PEER_CARD}
      >
        <CardHead label={labels.title} unit={labels.countUnit} count={crossDomainEdgeCount} />
        {/* The selection pane sits beside the grid (wrapping under it on a narrow card) and the caption on the card's floor,
           so this card's caption lines up with its neighbour's. */}
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
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{labels.gridSelectHint}</p>
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
            // The bar is the cross share itself (0-100%); normalising by the list's maximum would draw a false 100% bar.
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
 * On a two-column board each peer card spans its parent's three rows (head, body, caption) as a subgrid, so the
 * caption rules and body ends line up. The parent's row gap is 0 there, so the card's margins are its rhythm.
 */
const PEER_CARD =
  "flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] @min-[960px]/insights:row-span-3 @min-[960px]/insights:grid @min-[960px]/insights:grid-rows-subgrid @min-[960px]/insights:gap-y-0";

/** Four indigo alpha steps for skimming; the digit in the cell states the exact number. */
function crossCellTone(count: number, maxCross: number): string | undefined {
  if (count <= 0) return undefined;
  const ratio = maxCross > 0 ? count / maxCross : 1;
  if (ratio <= 0.25) return "var(--color-indigo-a22)";
  if (ratio <= 0.5) return "var(--color-indigo-a32)";
  if (ratio <= 0.75) return "var(--color-indigo-a46)";
  return "var(--color-indigo-a66)";
}

/**
 * Diagonal cells (inside one domain) are neutral, three steps scaled to their own maximum, so the caption's
 * "darker means more" holds there too. The ramp stops at `--color-overlay-3`: a darker step swallows the grid lines.
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
  // Column headers are numbers; the name sits beside the row header with the same number.
  // One grid of row subgrids, so `fit-content` sizes the name column once. The cell shares what the card has left
  // after names (7rem) and the selection pane (12rem) over the columns, clamped to 28-52px.
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
        {/* `sr-only` is absolute and would drop out of the grid flow, shifting every column, so this is an empty cell. */}
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
            // A dashed border marks the diagonal's different scale through a channel other than colour, also at 0.
            // The width is explicit because `shape: 'icon'` emits `w-7`; without it clickable cells turn rectangular.
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
                  // A numbered cell must pass AA on any background; quaternary falls short on the darkest diagonal.
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
                  // The ink is explicit because the cell carries a background through `style`; the default tertiary ink fails
                  // contrast there (the `a11y-vault-backed` ratchet checks it).
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
      {/* `gap-2.5` keeps 24px between link centres, the WCAG 2.5.8 spacing exception for these 16px links; raising the
         height instead would make the detail slot jump per click. A `.touch-hit-expand` would overlap neighbours and let
         a later row steal the tap. Gate: the coupling-detail state in `tests/e2e/a11y-vault-backed.spec.ts`. */}
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
