import { Link } from "@/i18n/navigation";
import { OntologyMapKindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { getOntologyKindTone } from "@/entities/ontology-class";
import { DomainCapacityBar, DomainCapacityLegend } from "@/widgets/domain-capacity-bar";
import type { DomainCapacityRow } from "../../lib/domain-capacity";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { INSIGHTS_LIST_TWO_COLUMN, insightsTwoColumnCell } from "../parts/insights-list";
import { ShareStack } from "../parts/ShareStack";

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
 * The "composition" tab — what kinds exist (one share band) and how full each domain is (a
 * two-segment capability/element meter per domain). Both cards take the full width and are as
 * tall as what they say, the same grammar the relations tab uses.
 *
 * ⚠️ **No side-by-side pair** (review, 2026-09-25). Kinds (four or five rows) stood beside the
 * domains (any number of taller rows); the shared row height left a 41-103px blank band above
 * the kinds caption at 1040-1512, and whichever card was shorter would carry that band for any
 * other vault. The kind rows also drew a second bar for the share the stacked bar above them
 * already showed, so kinds is now that stacked bar with its key (`ShareStack`), and the domain
 * rows fold into two columns once the board is wide enough.
 *
 * **The census instruments left this tab on 2026-09-06.** Concepts, relations and health now sit
 * in the board's four-tile strip above the tab bar (`InsightsCensusStrip`), where they are the
 * first thing on *every* tab rather than a reward for leaving the default one. Drawing them here
 * as well would be the same fact twice on one screen, so this tab answers only its own question:
 * what kinds exist, and how full each domain is.
 *
 * **The kind palette survives only in the "kinds" card.** Five kinds cannot be separated by a
 * single indigo, and the key ties each segment to its name, so here colour carries identity
 * beside the glyph. The two-segment bar in "domain capacity" already carries identity through
 * order, unit words, and the adjacent number, so it uses the app's shared bar grammar (neutral +
 * one indigo + a 1px seam) (`DomainCapacityBar`, 2026-07-26). The distinguishing rule is
 * `docs/DESIGN-SYSTEM.md` "Three ambers, three rules".
 */
export function OverviewTab({
  totalNodes,
  kindRows,
  domainRows,
  kindLabel,
  domainLink,
  labels,
}: OverviewTabProps) {
  // See the domain list below: two columns only when folding leaves no hole.
  const foldDomains = domainRows.length % 2 === 0 || domainRows.length >= 7;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      <section
        aria-label={labels.kindCensusTitle}
        className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.kindCensusTitle} />
        <ShareStack
          total={totalNodes}
          testId="insights-kind-stack"
          segmentTestId="insights-kind-stack-segment"
          keyTestId="insights-kind-key"
          items={kindRows.map((row) => ({
            id: row.kind,
            label: kindLabel(row.kind),
            count: row.count,
            color: getOntologyKindTone(row.kind).fill,
            mark: <OntologyMapKindGlyph kind={row.kind} size={16} className="flex-none" />,
          }))}
        />
        <p className="border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-body text-[color:var(--color-text-quaternary)]">
          {labels.kindGlyphCaption}
        </p>
      </section>

      <section
        aria-label={labels.domainCapacityTitle}
        className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.domainCapacityTitle} />
        {domainRows.length === 0 ? (
          /*
           * **The "composition" tab had zero pressable controls** (census 2026-08-12 — the only
           * tab of the board's then-five with none). This empty state in particular is the most common first
           * screen: a freshly created vault has no domains. Saying only "there are none" without
           * offering a way to create one is what this repository named "no next step". It uses
           * the same grammar as the boundaries tab's empty state
           * (`domain-coupling-empty-action`).
           */
          <div className="mt-3.5 flex flex-col items-start">
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
          <div className="mt-3 mb-2.5 flex min-w-0 flex-col">
            {/* The key to the bar's two pieces appears once per card — repeating it per row is noise. */}
            <DomainCapacityLegend
              labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
            />
            {/*
              * ⚠️ **Fold only when the fold leaves no hole.** Three domains in two columns left a
              * 650x60 empty cell beside the third bar (review, 2026-09-25, round 4). The odd row
              * cannot span both columns: its bar would be drawn twice as long as its neighbours'
              * for the same count. A short odd list stays one column; from seven rows the one
              * empty cell is a list's ragged end, not a hole in a four-cell card.
              */}
            <div className={foldDomains ? `mt-1 ${INSIGHTS_LIST_TWO_COLUMN}` : 'mt-1 grid auto-rows-min content-start'}>
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
               * (dimensional regularity — rows must share one height for boundary positions
               * to be compared side by side). Horizontally it matches the hub rows'
               * `-mx-1.5 px-1.5`, so only the hover surface extends 6px past the card inset while
               * the text and bar axes stay in line with the caption and the key. The divider sits
               * on the plain cell around it, on the card's padding line (`insights-list.ts`).
               *
               * The breakdown sits under the domain name (`breakdownPlacement="title"`), so each
               * bar ends 12px from the number it counts.
               */}
              {domainRows.map((row, i) => (
                <div key={row.id} className={foldDomains ? insightsTwoColumnCell(i) : i === 0 ? '' : 'border-t border-[color:var(--color-divider)]'}>
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
                      breakdownPlacement="title"
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
          <p className="border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-body text-[color:var(--color-text-quaternary)]">
            {labels.domainCapacityCaption}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/**
 * A card's name. It carries no total: the census tile above the tab bar prints the concept count
 * and the count per kind, domains included, and a second copy at the card's far corner was the
 * same number twice in one viewport (review, 2026-09-25, round 5).
 */
function CardHead({ label }: { label: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">{label}</InsightsSectionTitle>
    </div>
  );
}
