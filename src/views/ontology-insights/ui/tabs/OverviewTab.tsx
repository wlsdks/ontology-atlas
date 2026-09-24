import { Link } from "@/i18n/navigation";
import { OntologyMapKindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { getOntologyKindTone } from "@/entities/ontology-class";
import { DomainCapacityBar, DomainCapacityLegend } from "@/widgets/domain-capacity-bar";
import { InsightsBar } from "../parts/InsightsBar";
import type { DomainCapacityRow } from "../../lib/domain-capacity";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { INSIGHTS_LIST, INSIGHTS_LIST_ROW } from "../parts/insights-list";

export interface OverviewTabLabels {
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
  kindRows: Array<{ kind: string; count: number }>;
  domainRows: DomainCapacityRow[];
  kindLabel: (kind: string) => string;
  /** Required — no row is left quietly without a way back. */
  domainLink: OverviewTabDomainLink;
  labels: OverviewTabLabels;
}

/**
 * The "composition" tab — the kind distribution (a coloured stacked bar plus glyph and large
 * meters) and domain capacity (a two-segment capability/element stacked meter). The two cards are
 * sized by their content and share one height as grid peers; rows stack at the board's list
 * rhythm (`insights-list.ts`) and each caption sits on the shared bottom line.
 *
 * **The census instruments left this tab on 2026-09-06.** Concepts, relations and health now sit
 * in the board's four-tile strip above the tab bar (`InsightsCensusStrip`), where they are the
 * first thing on *every* tab rather than a reward for leaving the default one. Drawing them here
 * as well would be the same fact twice on one screen, so this tab answers only its own question:
 * what kinds exist, and how full each domain is.
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
  kindRows,
  domainRows,
  kindLabel,
  domainLink,
  labels,
}: OverviewTabProps) {
  const kindMax = kindRows[0]?.count ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] @min-[960px]/insights:grid-cols-2">
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
          {/*
            * Rows pack from the top at the board's list rhythm (`insights-list.ts`) instead of
            * spreading evenly. Four kinds stretched to the domain card's nine rows stood about 100px apart at
            * 1512x900, so the card read as four islands; packed, a row here sits level with a row
            * beside it (design sweep, 2026-09-23).
            */}
          <div className={`mt-2 mb-2.5 ${INSIGHTS_LIST}`}>
            {kindRows.map((row, i) => {
              const width = kindMax > 0 ? Math.max(2, Math.round((row.count / kindMax) * 100)) : 0;
              return (
                <div key={row.kind} className={`flex items-center gap-3 ${INSIGHTS_LIST_ROW}`}>
                  <span className="flex w-[var(--insights-row-label-w)] flex-none items-center gap-2 text-body-lg text-[color:var(--color-text-secondary)]">
                    <OntologyMapKindGlyph kind={row.kind} size={16} />
                    {kindLabel(row.kind)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                    <InsightsBar pct={width} color={getOntologyKindTone(row.kind).fill} index={i} />
                  </span>
                  <span className="w-10 flex-none text-right font-mono text-title tabular-nums text-[color:var(--map-numeral-face)]">
                    {row.count}
                  </span>
                </div>
              );
            })}
          </div>
          {/* `mt-auto`: the two cards in this row share one height, so their captions share
              one bottom line instead of one of them floating mid-card. */}
          <p className="mt-auto border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
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
             * tab of the board's then-five with none). This empty state in particular is the most common first
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
            <div className="mt-3.5 mb-2.5 flex min-h-0 flex-col">
              {/* The key to the bar's two pieces appears once per card — repeating it per row is noise. */}
              <DomainCapacityLegend
                labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
              />
              {/* Rows stack at the board's list rhythm rather than spreading to fill the card:
                  three domains stood ~79px apart for 8px bars when they were spread evenly. */}
              <div className={`mt-1 ${INSIGHTS_LIST}`}>
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
                 * `py-3` is the board's list inset, the same on every row, so **all rows share one height**
                 * (dimensional regularity — six rows must share one height for boundary positions
                 * to be compared side by side). Horizontally it matches the hub rows'
                 * `-mx-1.5 px-1.5`, so only the hover surface extends 6px past the card inset while
                 * the text and bar axes stay in line with the caption and the key.
                 */}
                {domainRows.map((row) => (
                  // The divider sits on this plain cell, on the card's padding line; the link
                  // inside bleeds 6px for its hover surface only (`insights-list.ts`).
                  <div key={row.id}>
                  <Link
                    href={domainLink.href(row.id)}
                    aria-label={domainLink.ariaLabel(row)}
                    data-testid="insights-domain-row-link"
                    className={controlClass({ hoverSurface: 'lift',
                      shape: "row",
                      size: "sm",
                      className: "-mx-1.5 block w-auto px-1.5 py-3",
                    })}
                  >
                    <DomainCapacityBar
                      row={row}
                      labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
                    />
                  </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* This caption is **how to read the bar** ("capability on the left, element on the
              right…"). In the empty state that bar is not on screen, yet the caption remained —
              prose explaining a picture that is not there is noise, not information. It is attached
              only when there are rows. */}
          {domainRows.length > 0 ? (
            <p className="mt-auto border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
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
      <span className="ml-auto font-mono text-body tabular-nums text-[color:var(--map-numeral-face)]">
        {count}
      </span>
    </div>
  );
}
