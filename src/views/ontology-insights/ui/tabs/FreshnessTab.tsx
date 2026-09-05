"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { formatDate } from "@/shared/lib/format-date";
import { EvidenceOnlyBadge, HiddenCountLine, TopologyV2KindGlyph } from "@/shared/ui";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui/control-class";
import { RecentNodeRow } from "@/widgets/recent-node-row";
import type { DomainFreshnessRow, RecentUpdateRow } from "../../lib/freshness";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

const LEVEL_BACKGROUND: Record<0 | 1 | 2 | 3, string> = {
  0: "var(--color-overlay-1)",
  1: "var(--color-overlay-2)",
  2: "var(--color-overlay-3)",
  3: "var(--color-border-strong)",
};

export interface FreshnessTabLabels {
  domainFreshnessTitle: string;
  windowCaption: string;
  noDomains: string;
  /**
   * The same door the composition tab already offers for this identical fact.
   * Stating "there are no domains" and stopping is the copy that lost its
   * sibling's link (2026-09-05 empty-state audit).
   */
  noDomainsAction: string;
  stale: string;
  currentWeek: string;
  unknownDate: string;
  daysAgo: (days: number) => string;
  older: string;
  /** Direction labels for the heat strip's time axis — left (past) / right (present). */
  axisStart: string;
  axisEnd: string;
  /** Cell tooltip — "N weeks ago · M updates" (weeksAgo ≥ 1). */
  weekCell: (weeksAgo: number, count: number) => string;
  /** This week's cell tooltip — "this week · M updates". */
  weekCellCurrent: (count: number) => string;
  recentUpdatesTitle: string;
  noRecentUpdates: string;
  /** The remainder sentence for the capped concept list, formatted from the difference. */
  recentHidden: (hidden: number) => string;
  /** Where the rest are readable — every vault document, each carrying its own dates. */
  recentHiddenRoute: string;
  staleCountLabel: string;
  /** The toggle opening and closing the evidence layer — it shares its copy with the "connections" tab. */
  evidenceShow: (count: number) => string;
  evidenceHide: string;
  /** The evidence layer's caption — why this date is not that node's own. */
  evidenceCaption: string;
  evidenceTruncated: (shown: number, total: number) => string;
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

interface FreshnessTabRecentLink {
  /** Clicking a recently-updated row deeplinks to that node on the map (`buildOntologyNodeHref`,
   *  the same source as the relations tab's hub rows). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

export interface FreshnessTabProps {
  domainRows: DomainFreshnessRow[];
  recent: RecentUpdateRow[];
  /**
   * How many concept rows carry a date in all. `recent` is capped, and until
   * 2026-09-05 the overflow was dropped without a word — while the evidence
   * layer directly below stated its own truncation.
   */
  recentTotal: number;
  /** The evidence layer — the folded area. `computeFreshnessSummary` already separates it. */
  recentEvidence: RecentUpdateRow[];
  recentEvidenceTotal: number;
  staleCount: number;
  kindLabel: (kind: string) => string;
  recentLink: FreshnessTabRecentLink;
  labels: FreshnessTabLabels;
}

/**
 * Tab 3, freshness — the heat-strip grammar. Cell values are not a hardcoded array but aggregations
 * `computeFreshnessSummary` derives from real vault document `updatedAt` values. Only this week's
 * cell is indigo; the rest use the neutral ramp.
 */
export function FreshnessTab({
  domainRows,
  recent,
  recentTotal,
  recentEvidence,
  recentEvidenceTotal,
  staleCount,
  kindLabel,
  recentLink,
  labels,
}: FreshnessTabProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] @min-[960px]/insights:grid-cols-2">
      <section
        aria-label={labels.domainFreshnessTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="flex items-baseline gap-2">
          <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
            {labels.domainFreshnessTitle}
          </InsightsSectionTitle>
          <span className="ml-auto font-mono text-label text-[color:var(--color-text-quaternary)]">{labels.windowCaption}</span>
        </div>
        {domainRows.length === 0 ? (
          <div className="mt-3.5 flex flex-1 flex-col items-start">
            <p className="text-body text-[color:var(--color-text-quaternary)]">{labels.noDomains}</p>
            <Link
              href="/topology/?workbench=create"
              data-testid="freshness-no-domains-action"
              className={controlClass({
                shape: "link",
                tone: "accent",
                hoverInk: "strong",
                className: "mt-2.5 rounded-chip hover:underline",
              })}
            >
              {labels.noDomainsAction}
            </Link>
          </div>
        ) : (
          <div className="mt-3.5 flex flex-1 flex-col justify-evenly gap-1.5">
            {domainRows.map((row) => (
              // Row hover highlight — it aids the 700px horizontal scan (label → 12 cells → date)
              // using the same -mx/px offset pattern as the existing hub and recently-updated rows,
              // so the cell and axis alignment is unchanged (content x positions do not move).
              <div
                key={row.domainId}
                data-testid="insights-freshness-domain-row"
                className="-mx-1.5 flex items-center gap-2 rounded-chip px-1.5 transition-colors hover:bg-[color:var(--color-overlay-1)]"
              >
                <span
                  className={
                    "flex w-[136px] flex-none items-center gap-1.5 truncate text-label " +
                    (row.stale ? "text-[color:var(--color-text-quaternary)]" : "text-[color:var(--color-text-secondary)]")
                  }
                >
                  <TopologyV2KindGlyph kind="domain" size={12} />
                  <span className="truncate">{row.domainTitle}</span>
                  {row.stale ? (
                    <span className="flex-none rounded-micro border border-dashed border-[color:var(--color-border-strong)] px-1 text-caption text-[color:var(--color-text-quaternary)]">
                      {labels.stale}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-1 gap-[3px]">
                  {row.weeks.map((week, i) => (
                    <i
                      key={i}
                      // A cell is one week's update count. A `max-w` cap would bunch the strip to
                      // the left and misalign the axis label below ("this week") with the last cell —
                      // filling with `flex-1` shares one width with the axis, legend, and date columns.
                      title={
                        week.isCurrentWeek
                          ? labels.weekCellCurrent(week.count)
                          : labels.weekCell(row.weeks.length - 1 - i, week.count)
                      }
                      // eslint-disable-next-line no-restricted-syntax -- the 3px hairline radius on a 14px-tall weekly freshness bar would become a pill at chip (6px), so it is an exception outside the ramp.
                      className="h-3.5 flex-1 rounded-[3px]"
                      style={{
                        backgroundColor: week.isCurrentWeek
                          ? "var(--color-indigo-brand)"
                          : LEVEL_BACKGROUND[week.level],
                      }}
                    />
                  ))}
                </span>
                <span className="w-12 flex-none text-right font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {row.daysAgo !== null ? labels.daysAgo(row.daysAgo) : labels.unknownDate}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-caption text-[color:var(--color-text-quaternary)]">
              <span className="w-[136px] flex-none" aria-hidden />
              <span className="flex flex-1 items-center justify-between">
                <span>{labels.axisStart}</span>
                <span>{labels.axisEnd}</span>
              </span>
              <span className="w-12 flex-none" aria-hidden />
            </div>
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-[color:var(--color-divider)] pt-2.5 text-caption text-[color:var(--color-text-quaternary)]">
          <span>{labels.older}</span>
          {([0, 1, 2, 3] as const).map((level) => (
            <i key={level} className="h-2.5 w-2.5 flex-none rounded-micro" style={{ backgroundColor: LEVEL_BACKGROUND[level] }} />
          ))}
          <span>·</span>
          <i className="h-2.5 w-2.5 flex-none rounded-micro" style={{ backgroundColor: "var(--color-indigo-brand)" }} />
          <span>{labels.currentWeek}</span>
        </div>
        {/*
          * **The aggregate trend line left this card on 2026-09-06.** The same 12-week series is
          * now the board's fourth census tile, drawn above the tab bar and therefore on screen at
          * the same time as this card. One screen does not draw one series twice
          * (2026-08-07 (3)). What stays here is the per-domain heat strip, which is a different
          * fact: *which* area moved, not how much moved in total.
          */}
      </section>

      <section
        aria-label={labels.recentUpdatesTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="flex items-baseline gap-2">
          <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
            {labels.recentUpdatesTitle}
          </InsightsSectionTitle>
        </div>
        <div className="mt-2 flex flex-1 flex-col">
          {recent.length === 0 ? (
            <p className="py-2 text-body text-[color:var(--color-text-quaternary)]">{labels.noRecentUpdates}</p>
          ) : (
            recent.map((row) => (
              <RecentNodeRow
                key={row.nodeId}
                kind={row.kind}
                title={row.title}
                subtitle={`${kindLabel(row.kind)}${row.domainTitle ? ` · ${row.domainTitle}` : ""}`}
                // The date is rendered in the local timezone (`formatDate`). `toISOString()`
                // rendered in UTC, so an update near midnight showed the previous day
                // (03:12 KST is the day before in UTC).
                trailing={formatDate(row.updatedAt)}
                href={recentLink.href(row.nodeId)}
                ariaLabel={recentLink.ariaLabel(row.title)}
                testId="insights-freshness-row-link"
              />
            ))
          )}
          <HiddenCountLine
            data-testid="insights-recent-hidden"
            className="mt-1.5"
            total={recentTotal}
            shown={recent.length}
            label={labels.recentHidden}
            route={
              <Link
                href="/docs"
                data-testid="insights-recent-hidden-route"
                className={controlClass({ shape: "link", size: "sm", hoverInk: "secondary" })}
              >
                {labels.recentHiddenRoute}
              </Link>
            }
          />
        </div>

        {/* The evidence layer — the same quiet toggle and the same copy as the impact ranking on the
            "connections" tab. Pushed down rather than deleted: a derived name is a vault fact too,
            and this is the only place the "create a document" promotion path is visible. */}
        {recentEvidenceTotal > 0 ? (
          <div className="mt-2 border-t border-[color:var(--color-divider)] pt-1">
            <button
              type="button"
              aria-expanded={evidenceOpen}
              data-testid="insights-freshness-evidence-toggle"
              onClick={() => setEvidenceOpen((open) => !open)}
              // **The same ramp call** as the quiet toggles on the "to do" and "connections" tabs —
              // the same kind of truncation must look the same. What remains is the hover ink the
              // ramp deliberately omits and the negative margin pairing with the inset (`px-2`).
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
                {evidenceOpen ? labels.evidenceHide : labels.evidenceShow(recentEvidenceTotal)}
              </span>
            </button>
            {evidenceOpen ? (
              <div className="insights-disclosure-in">
                {recentEvidence.map((row) => (
                  <RecentNodeRow
                    key={`${row.nodeId}:${row.ref ?? ""}`}
                    kind={row.kind}
                    title={row.title}
                    subtitle={
                      <>
                        <EvidenceOnlyBadge
                          label={labels.evidenceBadge}
                          hint={labels.evidenceBadgeHint}
                          className="mr-1.5"
                        />
                        {kindLabel(row.kind)}
                        {row.domainTitle ? ` · ${row.domainTitle}` : ""}
                      </>
                    }
                    trailing={formatDate(row.updatedAt)}
                    // The single fact separating two rows when two derived nodes share a title.
                    trailingSecondary={row.ref}
                    href={recentLink.href(row.nodeId)}
                    ariaLabel={recentLink.ariaLabel(row.title)}
                    testId="insights-freshness-evidence-row-link"
                  />
                ))}
                <p className="pt-1.5 text-label leading-label text-[color:var(--color-text-quaternary)]">
                  {recentEvidenceTotal > recentEvidence.length
                    ? `${labels.evidenceTruncated(recentEvidence.length, recentEvidenceTotal)} · `
                    : ""}
                  {labels.evidenceCaption}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-2.5 flex items-center justify-between border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          <span>{labels.staleCountLabel}</span>
          <span className="font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">{staleCount}</span>
        </div>
      </section>
    </div>
  );
}

