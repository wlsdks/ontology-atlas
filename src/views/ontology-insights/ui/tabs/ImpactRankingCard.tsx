"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Radar } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { EmptyState, EvidenceOnlyBadge, OntologyMapKindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import type { ImpactRankingRow } from "../../lib/impact-ranking";
import { InsightsBar } from "../parts/InsightsBar";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { INSIGHTS_LIST_TWO_COLUMN, insightsTwoColumnCell } from "../parts/insights-list";

export interface ImpactRankingLabels {
  title: string;
  caption: string;
  directLabel: string;
  transitiveLabel: string;
  empty: string;
  emptyHint: string;
  /** The empty card's one door: the screen where a relation is written. */
  emptyAction: string;
  truncated: (shown: number, total: number) => string;
  /** Opens the evidence layer; the count is in the label so the scale is not hidden. */
  evidenceShow: (count: number) => string;
  evidenceHide: string;
  /** What the same number means in the evidence layer. */
  evidenceCaption: string;
  evidenceTruncated: (shown: number, total: number) => string;
  /** The row badge label, with a one-line hover title naming the promotion path. */
  evidenceBadge: string;
  evidenceBadgeHint: string;
  unknownTitle: string;
  unknownDetail: (declared: number, rationale: number) => string;
  structureLink: string;
}

export interface ImpactRankingLink {
  href: (nodeId: string) => string;
  ariaLabel: (row: { title: string; direct: number; total: number }) => string;
  /** An evidence row's accessible name reads the citation count, not risk. */
  evidenceAriaLabel: (row: { title: string; total: number }) => string;
}

export interface ImpactRankingCardProps {
  rows: ImpactRankingRow[];
  rankedCount: number;
  evidenceRows: ImpactRankingRow[];
  evidenceRankedCount: number;
  declaredDependencyEdges?: number;
  declaredWithRationaleEdges?: number;
  kindLabel: (kind: string) => string;
  nodeLink: ImpactRankingLink;
  labels: ImpactRankingLabels;
  /** Its place in the consumer's grid. */
  className?: string;
}

/**
 * "Concepts whose change spreads furthest", from `buildImpactRanking`, which walks `buildOntologyReachability` with
 * MCP `blast_radius` semantics. The bar is two indigo values: darker direct, lighter indirect. Concepts with their
 * own document rank above; the folded layer holds names other documents merely cited, where the same number means
 * citations (a test file cited widely is protection, not risk). The evidence stays because the "create a document"
 * promotion path is visible only here.
 */
export function ImpactRankingCard({
  rows,
  rankedCount,
  evidenceRows,
  evidenceRankedCount,
  declaredDependencyEdges = 0,
  declaredWithRationaleEdges = 0,
  kindLabel,
  nodeLink,
  labels,
  className,
}: ImpactRankingCardProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  // One ruler for both layers, so the same total draws the same length; the first row fills 100%.
  const max = [...rows, ...evidenceRows].reduce((m, row) => Math.max(m, row.total), 0);

  return (
    <section
      aria-label={labels.title}
      data-testid="insights-impact-ranking"
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
          {labels.title}
        </InsightsSectionTitle>
        {/* What the two segments mean is stated once, in the head. */}
        <span className="ml-auto flex items-center gap-3 text-label text-[color:var(--color-text-quaternary)]">
          <SegmentKey color="var(--color-indigo-a66)" label={labels.directLabel} />
          <SegmentKey color="var(--color-indigo-a32)" label={labels.transitiveLabel} />
        </span>
      </div>

      <div
        data-testid="insights-impact-qualification"
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-dashed border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2"
      >
        <span className="font-[var(--font-weight-signature)] text-body text-[color:var(--color-text-primary)]">
          {labels.unknownTitle}
        </span>
        <span className="text-label text-[color:var(--color-text-quaternary)]">
          {labels.unknownDetail(declaredDependencyEdges, declaredWithRationaleEdges)}
        </span>
        <Link
          href="/topology/"
          // A standalone action in a wrapping row, so the WCAG 2.5.5 inline exception does not apply: `atlas-touch-floor`
          // gives a coarse pointer the floor, and `ml-auto` means growing it pushes nothing.
          className={controlClass({ shape: "link", tone: "secondary", className: "atlas-touch-floor ml-auto underline decoration-[color:var(--color-border-soft)] underline-offset-4 hover:text-[color:var(--color-text-primary)]" })}
        >
          {labels.structureLink}
        </Link>
      </div>

      {/* Two columns, because the card spans two cards' width: folding keeps the hub card's row measure. Ranks read in
         DOM order, left to right then top to bottom. */}
      <div className={`mt-2 flex-1 ${INSIGHTS_LIST_TWO_COLUMN}`}>
        {rows.length === 0 ? (
          <div className="@min-[960px]/insights:col-span-2">
            <EmptyState
              size="compact"
              icon={<Radar aria-hidden />}
              skeleton
              title={labels.empty}
              description={labels.emptyHint}
              // The hint names the remedy, so the door goes to it, the address the sibling empty states use.
              action={
                <Link
                  href="/topology/?workbench=create"
                  data-testid="impact-ranking-empty-action"
                  className={controlClass({
                    shape: "link",
                    tone: "accent",
                    hoverInk: "strong",
                    className: "rounded-chip hover:underline",
                  })}
                >
                  {labels.emptyAction}
                </Link>
              }
            />
          </div>
        ) : (
          rows.map((row, i) => (
            <ImpactRow
              key={row.id}
              row={row}
              index={i}
              max={max}
              href={nodeLink.href(row.id)}
              ariaLabel={nodeLink.ariaLabel(row)}
              secondary={kindLabel(row.kind)}
              testId="insights-impact-row-link"
            />
          ))
        )}
      </div>

      {evidenceRankedCount > 0 ? (
        <div className="mt-2 border-t border-[color:var(--color-divider)] pt-1">
          {/* A quiet toggle; the content grows downward only, leaving the rows above in place. */}
          <button
            type="button"
            aria-expanded={evidenceOpen}
            data-testid="insights-impact-evidence-toggle"
            onClick={() => setEvidenceOpen((open) => !open)}
            // The card's only control, so the ramp's `row`/`sm` widens the inset to 8 at the same 28px, like the other tabs' quiet toggles.
            className={controlClass({
              shape: "row",
              size: "sm",
              className:
                "-mx-2 hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]",
            })}
          >
            {evidenceOpen ? (
              <ChevronDown aria-hidden size={ICON_SIZE.sm} className="flex-none" />
            ) : (
              <ChevronRight aria-hidden size={ICON_SIZE.sm} className="flex-none" />
            )}
            <span className="min-w-0 truncate">
              {evidenceOpen ? labels.evidenceHide : labels.evidenceShow(evidenceRankedCount)}
            </span>
          </button>
          {evidenceOpen ? (
            // The insights crossfade (`--motion-fast`); reduced motion disables it globally.
            <div className="insights-disclosure-in">
              <div className={INSIGHTS_LIST_TWO_COLUMN}>
                {evidenceRows.map((row, i) => (
                  <ImpactRow
                    key={row.id}
                    row={row}
                    index={i}
                    max={max}
                    href={nodeLink.href(row.id)}
                    ariaLabel={nodeLink.evidenceAriaLabel(row)}
                    secondary={row.ref ?? kindLabel(row.kind)}
                    secondaryMono
                    badge={{ label: labels.evidenceBadge, hint: labels.evidenceBadgeHint }}
                    testId="insights-impact-evidence-row-link"
                  />
                ))}
              </div>
              <p className="pt-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]">
                {evidenceRankedCount > evidenceRows.length
                  ? `${labels.evidenceTruncated(evidenceRows.length, evidenceRankedCount)} · `
                  : ""}
                {labels.evidenceCaption}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
        {rankedCount > rows.length ? `${labels.truncated(rows.length, rankedCount)} · ` : ""}
        {labels.caption}
      </p>
    </section>
  );
}

/** Both layers use the same row parts and line heights, so row height does not differ by layer. */
function ImpactRow({
  row,
  index,
  max,
  href,
  ariaLabel,
  secondary,
  secondaryMono,
  badge,
  testId,
}: {
  row: ImpactRankingRow;
  index: number;
  max: number;
  href: string;
  ariaLabel: string;
  secondary: string;
  secondaryMono?: boolean;
  badge?: { label: string; hint: string };
  testId: string;
}) {
  // The full bar is the total relative to this list; the darker direct part uses the same ruler, so both compare in one bar.
  const totalPct = max > 0 ? Math.max(6, Math.round((row.total / max) * 100)) : 0;
  const directPct =
    max > 0 && row.direct > 0 ? Math.max(3, Math.round((row.direct / max) * 100)) : 0;
  return (
    // The divider sits on the cell, on the card's padding line; the row bleeds 6px for hover only (`insights-list.ts`).
    // Each column's first row drops it.
    <div className={insightsTwoColumnCell(index)}>
    <Link
      href={href}
      aria-label={ariaLabel}
      data-testid={testId}
      className={controlClass({
        shape: "row",
        size: "sm",
        className: "-mx-1.5 gap-3 px-1.5 py-2.5 hover:bg-[color:var(--color-overlay-1)]",
      })}
    >
      <OntologyMapKindGlyph kind={row.kind} size={16} className="flex-none" />
      <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-primary)]">
        {row.title}
      </span>
      {badge ? <EvidenceOnlyBadge label={badge.label} hint={badge.hint} /> : null}
      <span
        className={cn(
          "hidden flex-none truncate text-label text-[color:var(--color-text-quaternary)] sm:inline",
          secondaryMono && "font-mono sm:w-40",
        )}
      >
        {secondary}
      </span>
      <span
        aria-hidden
        className="relative block h-1.5 w-24 flex-none overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
      >
        <span className="absolute inset-0">
          <InsightsBar pct={totalPct} color="var(--color-indigo-a32)" index={index} />
        </span>
        <span className="absolute inset-0">
          <InsightsBar pct={directPct} color="var(--color-indigo-a66)" index={index} />
        </span>
      </span>
      <span className="w-9 flex-none text-right font-mono text-body tabular-nums text-[color:var(--map-numeral-face)]">
        {row.total}
      </span>
    </Link>
    </div>
  );
}

function SegmentKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-1.5 w-4 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
