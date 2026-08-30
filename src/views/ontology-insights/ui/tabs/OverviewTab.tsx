import { Link } from "@/i18n/navigation";
import { TopologyV2KindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { getOntologyKindTone } from "@/entities/ontology-class";
import { DomainCapacityBar, DomainCapacityLegend } from "@/widgets/domain-capacity-bar";
import { InsightsHeroCensus, type InsightsHeroCensusLabels } from "../parts/InsightsHeroCensus";
import { InsightsBar } from "../parts/InsightsBar";
import type { CensusHealthSummary } from "../../lib/census-health";
import type { DomainCapacityRow } from "../../lib/domain-capacity";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

export interface OverviewTabLabels extends InsightsHeroCensusLabels {
  kindCensusTitle: string;
  domainCapacityTitle: string;
  noDomains: string;
  /** The empty state's second line — what a domain is and what creating one gets you. */
  noDomainsBody: string;
  /** The next step offered in the empty state — the same grammar as the boundaries tab (an explanation with nowhere to go is an empty room). */
  noDomainsAction: string;
  kindGlyphCaption: string;
  domainCapacityCaption: string;
  capabilityUnit: string;
  elementUnit: string;
}

/**
 * Domain row → map deeplink. It has **the same shape** as `ConnectionsTabHubLink` on the
 * "connections" tab — rows on both tabs do the same job (open that concept on the map), so the
 * contract must be one.
 */
interface OverviewTabDomainLink {
  /** `buildOntologyNodeHref` — the origin marker (`via=insights:composition`) rides along too. */
  href: (nodeId: string) => string;
  /**
   * The bar is `aria-hidden`, so **the row's figures must be carried in the link name** (the same
   * discipline as `impactRowAriaLabel` on the "connections" tab). Hence the whole row is passed,
   * not just the title.
   */
  ariaLabel: (row: DomainCapacityRow) => string;
}

export interface OverviewTabProps {
  totalNodes: number;
  totalEdges: number;
  health: CensusHealthSummary;
  /** The number of separated groups, from the same verdict as the repair queue. */
  islandCount: number;
  kindRows: Array<{ kind: string; count: number }>;
  domainRows: DomainCapacityRow[];
  edgeTypeSummary: Array<{ key: string; label: string; count: number }>;
  kindLabel: (kind: string) => string;
  /** Required — no row is left quietly without a way back. */
  domainLink: OverviewTabDomainLink;
  labels: OverviewTabLabels;
}

/**
 * Tab 1, overview — the hero instruments (concepts/relations/health), the kind distribution (a
 * coloured stacked bar plus glyph and large meters), and domain capacity (a two-segment
 * capability/element stacked meter). Section gap 28px, card gap 20px, and cards fill the height
 * with `flex:1` (no empty bands).
 *
 * **The kind palette survives only in the left "kinds" card.** The pieces of the top stacked strip
 * have no labels, so colour is the only channel linking a piece to the row below it, and five
 * kinds cannot be separated by a single indigo — this is a place where colour is the **only**
 * channel carrying identity. Conversely the two-segment bar in "domain capacity" on the right
 * already carries identity through order, unit words, and the adjacent number, so it moved down to
 * the app's shared bar grammar (neutral + one indigo + a 1px seam) (`DomainCapacityBar`,
 * 2026-07-26). The distinguishing rule is `docs/DESIGN-SYSTEM.md` "Three ambers, three rules".
 */
export function OverviewTab({
  totalNodes,
  totalEdges,
  health,
  islandCount,
  kindRows,
  domainRows,
  edgeTypeSummary,
  kindLabel,
  domainLink,
  labels,
}: OverviewTabProps) {
  const kindMax = kindRows[0]?.count ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--section-gap)]">
      <InsightsHeroCensus
        totalNodes={totalNodes}
        totalEdges={totalEdges}
        health={health}
        islandCount={islandCount}
        kindsSummary={kindRows.map((r) => ({ key: r.kind, label: kindLabel(r.kind), count: r.count }))}
        relationsSummary={edgeTypeSummary}
        labels={labels}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-2">
        <section
          aria-label={labels.kindCensusTitle}
          className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
        >
          <CardHead label={labels.kindCensusTitle} count={totalNodes} />
          <div
            aria-hidden
            data-testid="insights-kind-stack"
            className="mt-3 flex h-2.5 w-full gap-px overflow-hidden rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-divider)]"
          >
            {kindRows.map((row) => {
              const share = totalNodes > 0 ? row.count / totalNodes : 0;
              if (share <= 0) return null;
              return (
                <span
                  key={row.kind}
                  data-testid="insights-kind-stack-segment"
                  style={{ flexGrow: share, backgroundColor: getOntologyKindTone(row.kind).fill }}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-1 flex-col justify-evenly gap-1">
            {kindRows.map((row, i) => {
              const width = kindMax > 0 ? Math.max(2, Math.round((row.count / kindMax) * 100)) : 0;
              return (
                <div key={row.kind} className="flex items-center gap-3 py-0.5">
                  <span className="flex w-[136px] flex-none items-center gap-2 text-body-lg text-[color:var(--color-text-secondary)]">
                    <TopologyV2KindGlyph kind={row.kind} size={16} />
                    {kindLabel(row.kind)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                    <InsightsBar pct={width} color={getOntologyKindTone(row.kind).fill} index={i} />
                  </span>
                  <span className="w-10 flex-none text-right font-mono text-title tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                    {row.count}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
            {labels.kindGlyphCaption}
          </p>
        </section>

        <section
          aria-label={labels.domainCapacityTitle}
          className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
        >
          <CardHead label={labels.domainCapacityTitle} count={domainRows.length} />
          {domainRows.length === 0 ? (
            /*
             * **The "composition" tab had zero pressable controls** (census 2026-08-12 — the only
             * one of the five tabs). This empty state in particular is the most common first
             * screen: a freshly created vault has no domains. Saying only "there are none" without
             * offering a way to create one is what this repository named "no next step". It uses
             * the same grammar as the boundaries tab's empty state
             * (`domain-coupling-empty-action`).
             */
            <div className="mt-3.5 flex flex-1 flex-col items-start">
              <p className="text-body text-[color:var(--color-text-tertiary)]">{labels.noDomains}</p>
              <p className="mt-1.5 max-w-[38em] text-body leading-prose text-[color:var(--color-text-quaternary)]">
                {labels.noDomainsBody}
              </p>
              <Link
                href="/topology/?workbench=create"
                data-testid="domain-capacity-empty-action"
                className={controlClass({ hoverInk: 'strong', shape: "link", tone: "accent", className: "mt-3 rounded-chip hover:underline" })}
              >
                {labels.noDomainsAction}
              </Link>
            </div>
          ) : (
            <div className="mt-3.5 flex min-h-0 flex-1 flex-col">
              {/* The key to the bar's two pieces appears once per card — repeating it per row is noise. */}
              <DomainCapacityLegend
                labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
              />
              <div className="mt-2.5 flex flex-1 flex-col justify-evenly gap-1">
                {/*
                 * **The row is the door to the map** (census 2026-08-12: this tab had zero
                 * pressable controls). **The consumer wraps the link** — the bar component is
                 * shared with the `/projects` cards, where the whole card is already a pressable
                 * surface, so putting a link inside the component would make that one nested
                 * interactive.
                 *
                 * What the wrapping link adds is only **hit area, hover, focus ring, and a finger
                 * floor**; it does not move the row's layout by one pixel: `block`/`w-auto` empty
                 * out the value layer's flex row layout (the bar inside already has its own), and
                 * `py-0` returns the vertical inset to zero so **the row height is unchanged**
                 * (dimensional regularity — six rows must share one height for boundary positions
                 * to be compared side by side). Horizontally it matches the hub rows'
                 * `-mx-1.5 px-1.5`, so only the hover surface extends 6px past the card inset while
                 * the text and bar axes stay in line with the caption and the key.
                 */}
                {domainRows.map((row) => (
                  <Link
                    key={row.id}
                    href={domainLink.href(row.id)}
                    aria-label={domainLink.ariaLabel(row)}
                    data-testid="insights-domain-row-link"
                    className={controlClass({ hoverSurface: 'lift',
                      shape: "row",
                      size: "sm",
                      className: "-mx-1.5 block w-auto px-1.5 py-0",
                    })}
                  >
                    <DomainCapacityBar
                      row={row}
                      labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {/* This caption is **how to read the bar** ("capability on the left, element on the
              right…"). In the empty state that bar is not on screen, yet the caption remained —
              prose explaining a picture that is not there is noise, not information. It is attached
              only when there are rows. */}
          {domainRows.length > 0 ? (
            <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
              {labels.domainCapacityCaption}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function CardHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">{label}</InsightsSectionTitle>
      <span className="ml-auto font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
        {count}
      </span>
    </div>
  );
}
