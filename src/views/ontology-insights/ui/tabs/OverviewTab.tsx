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
  /** The empty state's second line: what a domain is and what creating one gives you. */
  noDomainsBody: string;
  /** The empty state's next step, in the boundaries tab's grammar. */
  noDomainsAction: string;
  kindGlyphCaption: string;
  domainCapacityCaption: string;
  capabilityUnit: string;
  elementUnit: string;
}

/** Domain row to map deep link, the same shape as `ConnectionsTabHubLink`: rows on both tabs open a concept on the map. */
interface OverviewTabDomainLink {
  /** `buildOntologyNodeHref`, which carries the `via=insights:composition` marker. */
  href: (nodeId: string) => string;
  /** The bar is `aria-hidden`, so the link name carries the row's figures; hence the whole row is passed. */
  ariaLabel: (row: DomainCapacityRow) => string;
}

export interface OverviewTabProps {
  totalNodes: number;
  kindRows: Array<{ kind: string; count: number }>;
  domainRows: DomainCapacityRow[];
  kindLabel: (kind: string) => string;
  /** Required, so every row has a way to the map. */
  domainLink: OverviewTabDomainLink;
  labels: OverviewTabLabels;
}

/**
 * The composition tab: kinds as one share band (`ShareStack`) and a capability/element meter per domain. Both cards
 * are full width and as tall as their content, since a side-by-side pair left a blank band in the shorter one.
 * The census (concepts, relations, health) lives in `InsightsCensusStrip` above the tab bar, so it is not repeated here.
 * Only the kinds band uses the kind palette, since five kinds need colour for identity; the domain bar uses the
 * shared neutral-plus-indigo grammar (`docs/DESIGN-SYSTEM.md` "Three ambers, three rules").
 */
export function OverviewTab({
  totalNodes,
  kindRows,
  domainRows,
  kindLabel,
  domainLink,
  labels,
}: OverviewTabProps) {
  // Two columns only when folding leaves no hole (see the domain list below).
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
          // A fresh vault has no domains, so the empty state offers creating one, in the grammar of the boundaries tab
          // (`domain-coupling-empty-action`).
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
            {/* The bar's key appears once per card. */}
            <DomainCapacityLegend
              labels={{ capabilityUnit: labels.capabilityUnit, elementUnit: labels.elementUnit }}
            />
            {/* Fold only when it leaves no hole: an odd row cannot span both columns without drawing its bar twice as long.
               A short odd list stays one column; from seven rows the empty cell is a list's ragged end. */}
            <div className={foldDomains ? `mt-1 ${INSIGHTS_LIST_TWO_COLUMN}` : 'mt-1 grid auto-rows-min content-start'}>
              {/* The row is the door to the map. The consumer wraps the link because the bar is shared with `/projects` cards,
                 which are already pressable. The link adds only hit area, hover, focus ring and a finger floor: `block`/`w-auto`
                 cancel the value layer's flex layout and `py-3` is the list inset, so all rows share one height. The breakdown
                 sits under the name (`breakdownPlacement="title"`), so each bar ends near its number. */}
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
        {/* How to read the bar, attached only when a bar is on screen. */}
        {domainRows.length > 0 ? (
          <p className="border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-body text-[color:var(--color-text-quaternary)]">
            {labels.domainCapacityCaption}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** A card's name without a total: the census strip already prints the concept and per-kind counts. */
function CardHead({ label }: { label: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">{label}</InsightsSectionTitle>
    </div>
  );
}
