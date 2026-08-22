"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Radar } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { EmptyState, EvidenceOnlyBadge, TopologyV2KindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import type { ImpactRankingRow } from "../../lib/impact-ranking";
import { InsightsBar } from "../parts/InsightsBar";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

export interface ImpactRankingLabels {
  title: string;
  caption: string;
  directLabel: string;
  transitiveLabel: string;
  empty: string;
  emptyHint: string;
  truncated: (shown: number, total: number) => string;
  /** Opens the evidence layer — collapsed state. The count is in the label so the scale is not hidden. */
  evidenceShow: (count: number) => string;
  /** Closes the evidence layer — expanded state. */
  evidenceHide: string;
  /** The evidence layer's caption — what the same number means here. */
  evidenceCaption: string;
  evidenceTruncated: (shown: number, total: number) => string;
  /** The row badge label plus a one-line hover title (including the promotion path). */
  evidenceBadge: string;
  evidenceBadgeHint: string;
  unknownTitle: string;
  unknownDetail: (declared: number, rationale: number) => string;
  structureLink: string;
}

export interface ImpactRankingLink {
  href: (nodeId: string) => string;
  ariaLabel: (row: { title: string; direct: number; total: number }) => string;
  /** The accessible name of an evidence-layer row — it reads the citation count, not a risk level. */
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
  /** Its place in the consumer's grid (e.g. the full width of the second line of a two-column grid). */
  className?: string;
}

/**
 * "Concepts whose change spreads furthest" — the card answering the number-one question a
 * developer or an agent actually asks ("if I change this, what breaks?"). Every value comes from
 * `buildImpactRanking` → `computeOntologyDependents`, and that function shares its semantics with
 * MCP `blast_radius`, so the screen's answer and the agent's cannot diverge.
 *
 * The bar is two segments of value variation within a single indigo — the darker part is what is
 * directly connected, the lighter what is reached indirectly. "Direct/indirect" reads without
 * introducing a new hue. It shares its anatomy (head → rows → one footnote) with the other cards
 * in the same grid.
 *
 * ## Two layers (2026-07-26)
 *
 * Above are **concepts with their own document**; the folded area below holds **evidence, names
 * another document merely wrote down**. Measured against the dogfood vault (289 concepts): before
 * the split, 11 of the top 12 rows were derived code paths such as `Check Package Contracts Test`
 * and `Integration Test` (twice) — put on a meeting screen, the most visible slot held test file names.
 *
 * The point of this card is that the two layers put **different captions on the same number**. In
 * the concept layer 15 means "15 places to re-read if you change this"; in the evidence layer it
 * means "15 concepts cited this file as evidence" — and if that is a test file, it is a signal of
 * protection rather than risk. The computation was right and the words were wrong, so the words
 * were fixed, not the computation.
 *
 * Why the evidence is not deleted: dense traceability is valuable to a developer, and the "create
 * a document" promotion path is visible only here. Hiding is not layering.
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
  // The first row fills 100% and the rest are relative to it — the same reading rule as the hub
  // card. **Both layers use one ruler**: layering is a display-priority distinction and the
  // numbers come from one computation, so separate rulers would draw the same 15 at different
  // lengths in the two lists and make the bar lie.
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
        {/* What the two segments mean is stated once, in the head — repeating it per row adds ink
            and is not read. */}
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
          className={controlClass({ shape: "link", tone: "secondary", className: "ml-auto underline decoration-[color:var(--color-border-soft)] underline-offset-4 hover:text-[color:var(--color-text-primary)]" })}
        >
          {labels.structureLink}
        </Link>
      </div>

      {/* A two-column grid — this card lives at the combined width of the two cards beside it.
          Stretched to one column the row measure doubles and the gap between name and bar widens,
          so the width is folded to keep the same measure as the hub card next to it. Ranks read in
          DOM order, left→right then top→bottom (reading order). */}
      <div className="mt-2 grid flex-1 auto-rows-min content-start gap-x-6 lg:grid-cols-2">
        {rows.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState
              size="compact"
              icon={<Radar aria-hidden />}
              skeleton
              title={labels.empty}
              description={labels.emptyHint}
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
          {/* A quiet toggle — a neutral text button. Opening and closing leaves the rows above in
              place, and the content grows downward only (zero layout shift). */}
          <button
            type="button"
            aria-expanded={evidenceOpen}
            data-testid="insights-impact-evidence-toggle"
            onClick={() => setEvidenceOpen((open) => !open)}
            // A hit area only as wide as 25px of text is narrow, and this is the card's only
            // control — the ramp's `row`/`sm` emits the same 28px while widening the inset from 6
            // to 8. It is the same call as the quiet toggles on the "to do" and "freshness" tabs.
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
            // The entrance uses the insights surface's existing crossfade grammar (120ms opacity,
            // `--motion-fast`). Under prefers-reduced-motion the base layer disables it globally,
            // so it degrades to an instant swap.
            <div className="insights-disclosure-in">
              <div className="grid auto-rows-min content-start gap-x-6 lg:grid-cols-2">
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

/**
 * Both layers use **the same row parts** — glyph · name · (badge) · secondary label · bar · number.
 * Adding the badge and the path leaves the slot count and each slot's line height unchanged, so
 * the row height does not differ by layer (dimensional regularity).
 */
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
  // The bar's full length is the relative size within this list (the same reading rule as the hub
  // card). Over it, "what is directly connected" is drawn in a darker value measured with the same
  // ruler, so the two numbers can be compared in one bar.
  const totalPct = max > 0 ? Math.max(6, Math.round((row.total / max) * 100)) : 0;
  const directPct =
    max > 0 && row.direct > 0 ? Math.max(3, Math.round((row.direct / max) * 100)) : 0;
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      data-testid={testId}
      className={controlClass({
        shape: "row",
        size: "sm",
        className: cn(
          "-mx-1.5 gap-3 border-t border-[color:var(--color-divider)] px-1.5 py-2.5 hover:bg-[color:var(--color-overlay-1)]",
        // The first row of each column drops its divider — with two columns the second column's
        // first row (i=1) is also a column head, and a line above it reads as a truncated table.
          index === 0 && "border-t-0",
          index === 1 && "lg:border-t-0",
        ),
      })}
    >
      <TopologyV2KindGlyph kind={row.kind} size={16} className="flex-none" />
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
      <span className="w-9 flex-none text-right font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
        {row.total}
      </span>
    </Link>
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
