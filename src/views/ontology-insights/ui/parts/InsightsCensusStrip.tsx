import type { ReactNode } from "react";
import { useCountUp } from "@/shared/lib/use-count-up";
import { HiddenCountLine } from "@/shared/ui/hidden-count-line";
import { controlClass } from "@/shared/ui/control-class";
import type { CensusHealthSummary } from "../../lib/census-health";
import type { InsightsVerdict } from "../../lib/insights-verdict";

/**
 * **The board's census strip — four equal tiles above the tab bar.**
 *
 * ## Why it moved out of a tab (owner, 2026-09-06)
 *
 * The owner opened this board on the Do-next tab and said the analysis screen was showing work
 * instead of measurement: *"analysis is supposed to show indicators and flow, isn't it? To-do just
 * keeps getting longer and its content only runs sideways."* Measured on the dogfood folder at
 * 1512×949: the whole first screen was eight list rows repeating one sentence, and the only
 * measurement on it was a 11px monospace line in the top-right corner
 * (`102 concepts · 157 relations · 8 domains`) — a number nobody reads before a heading.
 *
 * Meanwhile the three census instruments (concepts, relations, health) lived **inside** the
 * composition tab, so the board's own measurements were only visible to someone who had already
 * chosen to leave the default tab. Moving them above the tab bar makes the measurement the first
 * thing on every tab, and the tabs stay what they are: one question each.
 *
 * ## What the four tiles are, and why nothing here is drawn twice
 *
 * | Tile | Value | Sub-lines |
 * |---|---|---|
 * | concepts | `totalNodes` | the kind census, and the share of concepts held in a domain |
 * | relations | `totalEdges` | the four largest types, what is hidden, and the density gloss |
 * | health | the **verdict word** — never a number | blocking/advisory split, then lone/island/cycle |
 * | last 12 weeks | the weekly bars | this week's count, and the evidence-linked share |
 *
 * The health tile deliberately carries **no total**. The single number a person acts on ("15") is
 * the Do-next tab badge and its list title, and those two already agree through one verdict
 * (`insights-badge-agreement`); a third place printing it would be the exact accident of
 * 2026-08-07 (3), "one screen does not count the same thing two ways". What the tile adds is the
 * one thing the list cannot say at a glance — **whether the folder is blocked or merely advised**,
 * which is the verdict `node $ATLAS/cli/src/index.mjs health` reports.
 *
 * The numbers use the engraved style, reusing the `--topology-v2-numeral-*` tokens the topology
 * canvas uses to engrave node counts, so "the panel and the canvas are one world" holds in the
 * engraved digits too.
 */
export interface InsightsCensusStripLabels {
  concepts: string;
  relations: string;
  health: string;
  orphan: string;
  cycle: string;
  /** The human-readable summary beside the domain membership rate — e.g. "in a domain". */
  membershipLabel: string;
  /** The subline the density ratio was demoted to — e.g. "an average of 2.34 connections per concept" (the ratio is already injected). */
  densityGloss: string;
  evidenceLinked: string;
  /** The same verdict as the "to do" tab's repair queue — the count of separated groups. */
  islands: string;
  /**
   * The remainder sentence for the relation strip, which draws only the four
   * largest types. Takes the difference the line computed, so the sentence and
   * the number can never be written apart.
   */
  relationsHidden: (hidden: number) => string;
  /** Where every relation type is drawn in full — the connections tab of this same page. */
  relationsHiddenRoute: string;
  /** The health tile's value — words, never a number. Same two verdicts the CLI reports. */
  statusHealthy: string;
  statusNeedsAttention: string;
  /** The one fact the list cannot say at a glance: how much of the work blocks an agent. */
  statusBlocking: string;
  statusAdvisory: string;
  /** The fourth tile — the same 12-week window as the freshness tab's heat strip. */
  recentTitle: string;
  recentThisWeek: (count: number) => string;
  /** What the bars are, for a reader who cannot see them. */
  recentBarsAria: (weeks: number, total: number) => string;
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
  /**
   * The **same** count of separated groups the "to do" tab's repair queue uses. Why it sits here
   * too: some people read the large "100%" as "our map is perfectly connected" and moved on. That
   * 100% is the *domain membership rate*, not a connection rate, and the same vault had 62
   * separated groups. Both numbers are placed in one glance.
   */
  islandCount: number;
  /** The single verdict model — the same object the tab badge branches from. */
  verdict: InsightsVerdict;
  /**
   * The 12-week update counts, summed across domains by `computeFreshnessSummary`. They are real
   * document dates, not a decorative wave, and this strip is now their only drawing: the freshness
   * tab kept the per-domain heat strip and gave up its own aggregate line, so one screen does not
   * draw one series twice.
   */
  weeklyTotals: number[];
  /** The summary subline — e.g. "250 elements · 36 capabilities · 6 domains · 3 documents · 1 project". */
  kindsSummary: Array<{ key: string; label: string; count: number }>;
  relationsSummary: Array<{ key: string; label: string; count: number }>;
  /**
   * How many relation types the vault actually holds. `relationsSummary` is
   * capped at the four largest; before 2026-09-05 the rest vanished with no
   * mark, even though the uncapped list was already in scope one component up.
   */
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
      // Four tiles in one row from the width where four ~290px columns still hold their sub-lines;
      // **two below that, never one.** Measured at 390×844: a single stacked column put all four
      // tiles ahead of the tab bar and pushed the list itself entirely off the first screen — the
      // census would then hide the work it exists to frame. Two columns keep the tab bar and the
      // list title on the first screen at 390. The grid keeps every tile in a row at one height
      // whatever its copy length (dimensional regularity).
      className="grid grid-cols-2 gap-[var(--card-gap)] @min-[1200px]/insights:grid-cols-4"
    >
      <CensusTile label={labels.concepts}>
        <BigNum value={totalNodes} />
        <div className="mt-auto flex flex-col gap-1.5">
          <SubStrip items={kindsSummary} />
          <SubStat label={labels.membershipLabel} value={`${health.domainMembershipPct}%`} />
        </div>
      </CensusTile>

      <CensusTile label={labels.relations}>
        <BigNum value={totalEdges} />
        <div className="mt-auto flex flex-col gap-1.5">
          <SubStrip items={relationsSummary} />
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
      </CensusTile>

      {/* The health tile's value is the verdict **in words**. A number here would be the third
          place counting the same work; the words are the fact the number never carried. */}
      <CensusTile label={labels.health}>
        <p
          data-testid="insights-verdict-word"
          className="text-display font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {verdict.status === "healthy" ? labels.statusHealthy : labels.statusNeedsAttention}
        </p>
        <div className="mt-auto flex flex-col gap-1.5">
          <div
            data-testid="insights-verdict-split"
            className="flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]"
          >
            <SubStat label={labels.statusBlocking} value={verdict.blocking} />
            <SubStat label={labels.statusAdvisory} value={verdict.advisory} />
          </div>
          <div className="flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
            <SubStat label={labels.orphan} value={health.orphanCount} />
            <SubStat label={labels.islands} value={islandCount} />
            <SubStat label={labels.cycle} value={health.cycleCount} />
          </div>
        </div>
      </CensusTile>

      <CensusTile label={labels.recentTitle}>
        <WeeklyBars
          weeklyTotals={weeklyTotals}
          ariaLabel={labels.recentBarsAria(
            weeklyTotals.length,
            weeklyTotals.reduce((sum, count) => sum + count, 0),
          )}
        />
        <div className="mt-auto flex flex-col gap-1.5">
          <span className="text-label text-[color:var(--color-text-tertiary)]">
            {labels.recentThisWeek(thisWeek)}
          </span>
          <SubStat label={labels.evidenceLinked} value={`${health.evidenceLinkedPct}%`} />
        </div>
      </CensusTile>
    </div>
  );
}

function CensusTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      data-testid="insights-census-tile"
      className="flex min-w-0 flex-col gap-2.5 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    >
      {/* The tile name is an eyebrow, and a Korean eyebrow carries no tracking — spaced Hangul
          reads as a stutter, not as emphasis. */}
      <div className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function BigNum({ value, unit, suffix }: { value: number | string; unit?: string; suffix?: string }) {
  // #3 — the census signature numbers count up once on mount. tabular-nums keeps
  // the width stable as digits change; reduced-motion snaps to the final value.
  const isNumeric = typeof value === "number";
  const counted = useCountUp(isNumeric ? value : 0);
  const display = isNumeric ? counted : value;
  return (
    <div
      // eslint-disable-next-line no-restricted-syntax -- the census signature's large numeral (40px) deliberately exceeds the top of the type ramp (hero 30px) as a display exception.
      className="font-mono text-[40px] font-[var(--font-weight-strong)] leading-display-tight tabular-nums tracking-[var(--tracking-label)] text-[color:var(--topology-v2-numeral-face)]"
      style={{ textShadow: "0 2px 0 var(--topology-v2-numeral-shadow)" }}
      data-testid="insights-bignum"
    >
      <span aria-hidden="true" data-insights-animated-value>
        {display}
        {suffix ?? ""}
        {unit ? (
          <span className="ml-1.5 text-body tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]" style={{ textShadow: "none" }}>
            {unit}
          </span>
        ) : null}
      </span>
      <span className="sr-only" data-insights-exact-value>
        {value}
        {suffix ?? ""}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

/**
 * The 12-week update series as hairline bars.
 *
 * Why bars and not the freshness tab's polyline: this tile is 260px wide and 40px tall beside three
 * numeral tiles, and a line at that size reads as decoration. A bar per week keeps the week the
 * discrete unit it is, and the most recent week takes the one indigo so "is anything happening
 * right now" is answered without a legend. Every other week is a neutral overlay step — no colour
 * gauge, no second palette.
 */
function WeeklyBars({ weeklyTotals, ariaLabel }: { weeklyTotals: number[]; ariaLabel: string }) {
  if (weeklyTotals.length === 0) return null;
  const max = Math.max(1, ...weeklyTotals);
  const lastIndex = weeklyTotals.length - 1;
  return (
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
            // A week with no update is a **baseline tick**, not a short bar. Giving zero the same
            // minimum height as one update would draw a quiet week and a busy week the same size,
            // which is the one thing a 12-bar strip must never do. Non-zero weeks start at 12% so
            // a single update is still visible beside a 40× larger neighbour.
            height: count === 0 ? "2px" : `${Math.max(12, Math.round((count / max) * 100))}%`,
            backgroundColor:
              index === lastIndex && count > 0
                ? "var(--color-indigo-brand)"
                : count === 0
                  ? "var(--color-overlay-2)"
                  : "var(--color-overlay-3)",
          }}
        />
      ))}
    </div>
  );
}

function SubStat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-label text-[color:var(--color-text-tertiary)]">
      {label}
      <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
        {value}
      </span>
    </span>
  );
}

function SubStrip({ items }: { items: Array<{ key: string; label: string; count: number }> }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          {item.label}
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">
            {item.count}
          </span>
        </span>
      ))}
    </div>
  );
}
