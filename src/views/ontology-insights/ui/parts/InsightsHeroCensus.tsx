import type { ReactNode } from "react";
import { useCountUp } from "@/shared/lib/use-count-up";
import { HiddenCountLine } from "@/shared/ui/hidden-count-line";
import { controlClass } from "@/shared/ui/control-class";
import type { CensusHealthSummary } from "../../lib/census-health";

/**
 * The hero instruments of the overview tab — three segments (concepts, relations, health). The
 * numbers use the engraved style, reusing the `--topology-v2-numeral-*` tokens the topology canvas
 * uses to engrave node counts, so "the panel and the canvas are one world" holds in the engraved
 * digits too.
 */
export interface InsightsHeroCensusLabels {
  concepts: string;
  relations: string;
  health: string;
  orphan: string;
  cycle: string;
  /** The human-readable summary beside the health segment's main number (domain membership rate) — e.g. "well connected". */
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
}

export function InsightsHeroCensus({
  totalNodes,
  totalEdges,
  health,
  islandCount,
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
  labels: InsightsHeroCensusLabels;
}) {
  const relationsShown = relationsSummary.length;
  return (
    <div className="flex flex-col items-stretch gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-4 sm:flex-row sm:gap-0">
      <HeroSegment label={labels.concepts}>
        <BigNum value={totalNodes} />
        <SubStrip items={kindsSummary} />
      </HeroSegment>
      <HeroSegment label={labels.relations}>
        <BigNum value={totalEdges} />
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
      </HeroSegment>
      {/* The health segment — the main number is the membership rate (the share of concepts held in
          a domain) plus a "well connected" summary, rather than the density ratio (2.34
          edges/concept). The density ratio is demoted to the `densityGloss` subline, keeping jargon
          out of the main number. */}
      <HeroSegment label={labels.health}>
        <BigNum value={health.domainMembershipPct} suffix="%" unit={labels.membershipLabel} />
        <div className="mt-auto flex flex-col gap-1.5">
          <span className="text-label text-[color:var(--color-text-quaternary)]">{labels.densityGloss}</span>
          <div className="flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
            <HealthStat label={labels.orphan} value={health.orphanCount} />
            <HealthStat label={labels.islands} value={islandCount} />
            <HealthStat label={labels.cycle} value={health.cycleCount} />
            <HealthStat label={labels.evidenceLinked} value={`${health.evidenceLinkedPct}%`} />
          </div>
        </div>
      </HeroSegment>
    </div>
  );
}

function HeroSegment({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5 border-t border-[color:var(--color-divider)] px-6 py-0.5 pt-3 first:border-t-0 first:pt-0.5 sm:border-t-0 sm:border-l sm:pt-0.5 sm:first:border-l-0">
      <div className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">{label}</div>
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

function HealthStat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">{value}</span>
    </span>
  );
}

function SubStrip({ items }: { items: Array<{ key: string; label: string; count: number }> }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-3.5 text-label text-[color:var(--color-text-tertiary)]">
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          {item.label}
          <span className="font-mono text-label tabular-nums text-[color:var(--topology-v2-numeral-face)]">{item.count}</span>
        </span>
      ))}
    </div>
  );
}
