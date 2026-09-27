"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { formatDate } from "@/shared/lib/format-date";
import { EvidenceOnlyBadge, HiddenCountLine, OntologyMapKindGlyph } from "@/shared/ui";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui/control-class";
import { RecentNodeRow } from "@/widgets/recent-node-row";
import type { DomainFreshnessRow, RecentUpdateRow } from "../../lib/freshness";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { INSIGHTS_LIST, INSIGHTS_LIST_ROW } from "../parts/insights-list";

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
  /** The same door the composition tab offers for this fact. */
  noDomainsAction: string;
  stale: string;
  currentWeek: string;
  unknownDate: string;
  daysAgo: (days: number) => string;
  older: string;
  /** Heat strip time axis ends: left is past, right is present. */
  axisStart: string;
  axisEnd: string;
  /** Cell tooltip, "N weeks ago · M updates" (weeksAgo >= 1). */
  weekCell: (weeksAgo: number, count: number) => string;
  /** This week's cell tooltip, "this week · M updates". */
  weekCellCurrent: (count: number) => string;
  recentUpdatesTitle: string;
  noRecentUpdates: string;
  /** The capped concept list's remainder sentence, from the difference. */
  recentHidden: (hidden: number) => string;
  /** Where the rest are readable: every vault document, each with its own dates. */
  recentHiddenRoute: string;
  staleCountLabel: string;
  /** Shares its copy with the connections tab. */
  evidenceShow: (count: number) => string;
  evidenceHide: string;
  /** Why this date is not that node's own. */
  evidenceCaption: string;
  evidenceTruncated: (shown: number, total: number) => string;
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

interface FreshnessTabRecentLink {
  /** A recently updated row deep-links to its node on the map (`buildOntologyNodeHref`, as the relations tab's hub rows). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

export interface FreshnessTabProps {
  domainRows: DomainFreshnessRow[];
  recent: RecentUpdateRow[];
  /** How many concept rows carry a date in all; `recent` is capped, so the overflow is stated. */
  recentTotal: number;
  /** The folded evidence layer, already separated by `computeFreshnessSummary`. */
  recentEvidence: RecentUpdateRow[];
  recentEvidenceTotal: number;
  staleCount: number;
  kindLabel: (kind: string) => string;
  recentLink: FreshnessTabRecentLink;
  labels: FreshnessTabLabels;
}

/**
 * Tab 3, freshness: heat-strip cells aggregate real vault `updatedAt` values (`computeFreshnessSummary`).
 * Only this week's cell is indigo; the rest use the neutral ramp.
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
  // These two cards are the detail under the growth figure: they keep their panels so every card shares one text
  // start line, and the figure's full-width row and first place carry the demotion (outline: one `h2`, two `h3`).
  // The strip stays out of the protagonist frame because it is derived from file dates, which rank below Git's.
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  return (
    // Stacked, not paired: the heat strip takes a full row, and the recent list lays its rows in two columns from 960.
    <div className="flex min-h-0 flex-col gap-[var(--card-gap)]">
      <section
        aria-label={labels.domainFreshnessTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="flex items-baseline gap-2">
          <InsightsSectionTitle level={3} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
            {labels.domainFreshnessTitle}
          </InsightsSectionTitle>
          <span className="ml-auto text-label text-[color:var(--color-text-quaternary)]">{labels.windowCaption}</span>
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
          <div className="mt-2 mb-2.5 flex flex-col">
            <div className={INSIGHTS_LIST}>
            {domainRows.map((row) => (
              // Row hover aids the horizontal scan with the hub rows' -mx/px offset, so cell and axis positions do not move.
              // The divider sits on this plain cell; the row bleeds 6px for its hover surface only (`insights-list.ts`).
              <div key={row.domainId}>
              <div
                data-testid="insights-freshness-domain-row"
                className={`-mx-1.5 flex items-center gap-2 rounded-chip px-1.5 transition-colors hover:bg-[color:var(--color-overlay-1)] ${INSIGHTS_LIST_ROW}`}
              >
                <span
                  className={
                    "flex w-[var(--insights-row-label-w)] flex-none items-center gap-1.5 truncate text-label " +
                    (row.stale ? "text-[color:var(--color-text-quaternary)]" : "text-[color:var(--color-text-secondary)]")
                  }
                >
                  <OntologyMapKindGlyph kind="domain" size={12} />
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
                      // A `flex-1` cell, not a `max-w` cap: a cap bunches the strip left and misaligns the "this week" label with the last cell.
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
                <span className="w-12 flex-none text-right text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                  {row.daysAgo !== null ? labels.daysAgo(row.daysAgo) : labels.unknownDate}
                </span>
              </div>
              </div>
            ))}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-caption text-[color:var(--color-text-quaternary)]">
              <span className="w-[var(--insights-row-label-w)] flex-none" aria-hidden />
              <span className="flex flex-1 items-center justify-between">
                <span>{labels.axisStart}</span>
                <span>{labels.axisEnd}</span>
              </span>
              <span className="w-12 flex-none" aria-hidden />
            </div>
          </div>
        )}
        <div className="mt-auto flex items-center justify-end gap-1.5 border-t border-[color:var(--color-divider)] pt-2.5 text-caption text-[color:var(--color-text-quaternary)]">
          <span>{labels.older}</span>
          {([0, 1, 2, 3] as const).map((level) => (
            <i key={level} className="h-2.5 w-2.5 flex-none rounded-micro" style={{ backgroundColor: LEVEL_BACKGROUND[level] }} />
          ))}
          <span>·</span>
          <i className="h-2.5 w-2.5 flex-none rounded-micro" style={{ backgroundColor: "var(--color-indigo-brand)" }} />
          <span>{labels.currentWeek}</span>
        </div>
        {/* Only the per-domain heat strip stays here (which area moved); the total series is the census strip's fourth tile,
           so one screen does not draw one series twice. */}
      </section>

      <section
        aria-label={labels.recentUpdatesTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <div className="flex items-baseline gap-2">
          <InsightsSectionTitle level={3} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
            {labels.recentUpdatesTitle}
          </InsightsSectionTitle>
        </div>
        <div className="mt-2 mb-2.5 flex flex-col">
          {recent.length === 0 ? (
            <p className="py-2 text-body text-[color:var(--color-text-quaternary)]">{labels.noRecentUpdates}</p>
          ) : (
            <div
              data-testid="insights-recent-rows"
              // The second column's first row drops its divider like the first column's.
              className="grid grid-cols-1 @min-[960px]/insights:grid-cols-2 @min-[960px]/insights:gap-x-[var(--card-gap)] @min-[960px]/insights:[&>*:nth-child(2)]:border-t-0"
            >
            {recent.map((row) => (
              <RecentNodeRow
                key={row.nodeId}
                kind={row.kind}
                title={row.title}
                subtitle={`${kindLabel(row.kind)}${row.domainTitle ? ` · ${row.domainTitle}` : ""}`}
                // Rendered with `formatDate` in the local day; UTC would show the previous day for an update near midnight in KST.
                trailing={formatDate(row.updatedAt)}
                href={recentLink.href(row.nodeId)}
                ariaLabel={recentLink.ariaLabel(row.title)}
                testId="insights-freshness-row-link"
              />
            ))}
            </div>
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

        {/* The evidence layer, the same quiet toggle and copy as the connections tab's impact ranking. A derived name is a
           vault fact, and this is the one place its "create a document" promotion path shows. */}
        {recentEvidenceTotal > 0 ? (
          <div className="mt-2 border-t border-[color:var(--color-divider)] pt-1">
            <button
              type="button"
              aria-expanded={evidenceOpen}
              data-testid="insights-freshness-evidence-toggle"
              onClick={() => setEvidenceOpen((open) => !open)}
              // The same ramp call as the other tabs' quiet toggles, plus the hover ink the ramp omits and the margin pairing
              // the `px-2` inset.
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
                    // The single fact separating two derived rows that share a title.
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
        <div className="mt-auto flex items-center justify-between border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          <span>{labels.staleCountLabel}</span>
          <span className="font-mono text-body tabular-nums text-[color:var(--map-numeral-face)]">{staleCount}</span>
        </div>
      </section>
    </div>
  );
}

