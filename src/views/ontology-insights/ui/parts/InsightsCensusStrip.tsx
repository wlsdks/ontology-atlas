import {
  CensusBigNumber,
  CensusSubStat,
  CensusSubStrip,
  CensusTile,
} from "@/shared/ui/census-tile";
import { HiddenCountLine } from "@/shared/ui/hidden-count-line";
import { controlClass } from "@/shared/ui/control-class";
import type { CensusHealthSummary } from "../../lib/census-health";
import type { InsightsVerdict } from "../../lib/insights-verdict";

/**
 * The board's census strip: four equal tiles above the tab bar, so the measurement is the first thing on every tab
 * and each tab stays one question. Tiles: concepts (kind census, domain share), relations (four largest types,
 * hidden count, density), health (a verdict word, never a number), and the freshness window's weekly bars.
 * The health tile has no total: the Do-next badge and list title already carry it through one verdict
 * (`insights-badge-agreement`); the tile adds only blocked versus advised, the CLI `health` verdict.
 * Numerals reuse the map's `--map-numeral-*` tokens.
 */
export interface InsightsCensusStripLabels {
  concepts: string;
  relations: string;
  health: string;
  orphan: string;
  cycle: string;
  /** Beside the domain membership rate, e.g. "in a domain". */
  membershipLabel: string;
  /** The density ratio's subline, e.g. "an average of 2.34 connections per concept". */
  densityGloss: string;
  evidenceLinked: string;
  /** The same count of separated groups the to-do repair queue uses. */
  islands: string;
  /** Takes the difference the line computed, so sentence and number cannot disagree. */
  relationsHidden: (hidden: number) => string;
  /** The connections tab of this page, where every relation type is drawn. */
  relationsHiddenRoute: string;
  /** Words, never a number: the same two verdicts the CLI reports. */
  statusHealthy: string;
  statusNeedsAttention: string;
  /** How much of the work blocks an agent. */
  statusBlocking: string;
  statusAdvisory: string;
  /** The fourth tile: the freshness tab's window. */
  recentTitle: string;
  recentThisWeek: (count: number) => string;
  /** What the bars are, for a reader who cannot see them. */
  recentBarsAria: (weeks: number, total: number) => string;
  /** End labels under the bars, so they read as time rather than a shape. */
  recentBarsStart?: (weeks: number) => string;
  recentBarsEnd?: string;
}

export function InsightsCensusStrip({
  totalNodes,
  totalEdges,
  health,
  islandCount,
  verdict,
  weeklyTotals,
  kindsSummary,
  relationsSummary,
  relationsTotal,
  onSeeAllRelations,
  labels,
}: {
  totalNodes: number;
  totalEdges: number;
  health: CensusHealthSummary;
  /** The to-do queue's island count, beside the membership rate so "100% in a domain" is not read as "fully connected". */
  islandCount: number;
  /** The single verdict, the same object the tab badge reads. */
  verdict: InsightsVerdict;
  /**
   * Weekly update counts summed across domains by `computeFreshnessSummary`, from real document dates;
   * this strip is their only drawing.
   */
  weeklyTotals: number[];
  /** The kind census subline, e.g. "250 elements, 36 capabilities, 6 domains". */
  kindsSummary: Array<{ key: string; label: string; count: number }>;
  relationsSummary: Array<{ key: string; label: string; count: number }>;
  /** How many relation types the vault holds; `relationsSummary` is capped at four, so the rest is stated as hidden. */
  relationsTotal: number;
  /** Switches this page to the connections tab, where every type is listed. */
  onSeeAllRelations: () => void;
  labels: InsightsCensusStripLabels;
}) {
  const relationsShown = relationsSummary.length;
  const thisWeek = weeklyTotals.length > 0 ? weeklyTotals[weeklyTotals.length - 1] : 0;
  return (
    <div
      data-testid="insights-census-strip"
      // Four tiles in a row from 960, two below that, never one: one stacked column pushes the list off the first screen
      // at 390. One panel with a 1px divider grid, the divider colour on the grid inside, or the surface-vocabulary
      // ratchet fails.
      className="overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
    >
      <div className="grid grid-cols-2 gap-px bg-[color:var(--color-divider)] @min-[960px]/insights:grid-cols-4">
      <BandCell><CensusTile testId="insights-census-tile" surface="bare" label={labels.concepts}>
        <CensusBigNumber testId="insights-bignum" value={totalNodes} scale="section" tone="primary" />
        <div className="mt-auto flex flex-col gap-1.5">
          <CensusSubStrip items={kindsSummary} />
          <CensusSubStat label={labels.membershipLabel} value={`${health.domainMembershipPct}%`} />
        </div>
      </CensusTile></BandCell>

      <BandCell><CensusTile testId="insights-census-tile" surface="bare" label={labels.relations}>
        <CensusBigNumber testId="insights-bignum" value={totalEdges} scale="section" tone="primary" />
        <div className="mt-auto flex flex-col gap-1.5">
          <CensusSubStrip items={relationsSummary} />
          <HiddenCountLine
            data-testid="insights-relations-hidden"
            total={relationsTotal}
            shown={relationsShown}
            label={labels.relationsHidden}
            route={
              <button
                type="button"
                onClick={onSeeAllRelations}
                data-testid="insights-relations-hidden-route"
                className={controlClass({ shape: "link", size: "sm", hoverInk: "secondary" })}
              >
                {labels.relationsHiddenRoute}
              </button>
            }
          />
          <span className="text-label text-[color:var(--color-text-quaternary)]">
            {labels.densityGloss}
          </span>
        </div>
      </CensusTile></BandCell>

      {/* The verdict in words: a number here would be a third place counting the same work. */}
      <BandCell><CensusTile testId="insights-census-tile" surface="bare" label={labels.health}>
        <p
          data-testid="insights-verdict-word"
          className="break-keep text-display font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {verdict.status === "healthy" ? labels.statusHealthy : labels.statusNeedsAttention}
        </p>
        <div className="mt-auto flex flex-col gap-1.5">
          <div
            data-testid="insights-verdict-split"
            className="flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]"
          >
            <CensusSubStat label={labels.statusBlocking} value={verdict.blocking} />
            <CensusSubStat label={labels.statusAdvisory} value={verdict.advisory} />
          </div>
          <div className="flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
            <CensusSubStat label={labels.orphan} value={health.orphanCount} />
            <CensusSubStat label={labels.islands} value={islandCount} />
            <CensusSubStat label={labels.cycle} value={health.cycleCount} />
          </div>
        </div>
      </CensusTile></BandCell>

      <BandCell><CensusTile testId="insights-census-tile" surface="bare" label={labels.recentTitle}>
        <WeeklyBars
          weeklyTotals={weeklyTotals}
          ariaLabel={labels.recentBarsAria(
            weeklyTotals.length,
            weeklyTotals.reduce((sum, count) => sum + count, 0),
          )}
          startLabel={labels.recentBarsStart?.(weeklyTotals.length)}
          endLabel={labels.recentBarsEnd}
        />
        <div className="mt-auto flex flex-col gap-1.5">
          <span className="text-label text-[color:var(--color-text-tertiary)]">
            {labels.recentThisWeek(thisWeek)}
          </span>
          <CensusSubStat label={labels.evidenceLinked} value={`${health.evidenceLinkedPct}%`} />
        </div>
      </CensusTile></BandCell>
      </div>
    </div>
  );
}
/** One band cell inside the shared panel. */
function BandCell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col bg-[color:var(--color-panel)] p-[var(--card-pad)]">{children}</div>;
}

/** The weekly series as bars: the latest week in indigo, the rest neutral, so no legend is needed. */
function WeeklyBars({ weeklyTotals, ariaLabel, startLabel, endLabel }: { weeklyTotals: number[]; ariaLabel: string; startLabel?: string; endLabel?: string }) {
  if (weeklyTotals.length === 0) return null;
  const max = Math.max(1, ...weeklyTotals);
  const lastIndex = weeklyTotals.length - 1;
  return (
    <div className="flex flex-col gap-1">
    <div
      role="img"
      aria-label={ariaLabel}
      data-testid="insights-weekly-bars"
      className="flex h-10 items-end gap-1"
    >
      {weeklyTotals.map((count, index) => (
        <span
          key={index}
          data-testid="insights-weekly-bar"
          data-weekly-count={count}
          className="flex-1 rounded-micro"
          style={{
            // A week with no update is a 2px baseline tick, so quiet and busy weeks never draw the same size; non-zero weeks
            // start at 12% so one update shows beside a much larger neighbour.
            height: count === 0 ? "2px" : `${Math.max(12, Math.round((count / max) * 100))}%`,
            // Tertiary ink: overlay values fall under the 3:1 a graphical mark needs on the panel.
            backgroundColor:
              index === lastIndex && count > 0
                ? "var(--color-indigo-brand)"
                : count === 0
                  ? "var(--color-text-quaternary)"
                  : "var(--color-text-tertiary)",
          }}
        />
      ))}
    </div>
    {startLabel && endLabel ? (
      <div aria-hidden="true" data-testid="insights-weekly-ends" className="flex justify-between text-label text-[color:var(--color-text-tertiary)]">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    ) : null}
    </div>
  );
}
