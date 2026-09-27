import { useMemo } from "react";
import { Waypoints } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  EmptyState,
  EvidenceOnlyBadge,
  OntologyMapKindGlyph,
} from "@/shared/ui";
import {
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { relationTypeFill, relationTypeIndigo } from "../../lib/relation-type-tone";
import { buildImpactRanking } from "../../lib/impact-ranking";
import { InsightsBar } from "../parts/InsightsBar";
import {
  ImpactRankingCard,
  type ImpactRankingLabels,
  type ImpactRankingLink,
} from "./ImpactRankingCard";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { ShareStack } from "../parts/ShareStack";
import { INSIGHTS_LIST_ROW, INSIGHTS_LIST_TWO_COLUMN, insightsTwoColumnCell } from "../parts/insights-list";
import { controlClass } from '@/shared/ui/control-class';

export interface ConnectionHubRow {
  id: string;
  title: string;
  kind: string;
  degree: number;
  /**
   * A name written only as evidence (no document of its own). Hubs keep their order, since demoting a genuinely
   * connected node would make "what is central" wrong; the row states the fact instead.
   */
  evidenceOnly: boolean;
}

export interface ConnectionsTabLabels {
  relationTypesTitle: string;
  relationTypesCaption: string;
  noRelationTypes: string;
  noRelationTypesHint: string;
  hubsTitle: string;
  noHubs: string;
  noHubsHint: string;
  /** Both empty cards send the reader to the one screen where a relation is written, as the other tabs' empty states do. */
  emptyAction: string;
  hubTruncated: (shown: number, total: number) => string;
  hubDegreeCaption: string;
  /** Same i18n key as the impact ranking's evidence badge. */
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

interface ConnectionsTabHubLink {
  /** A hub row deep-links to its node on the map (`buildOntologyNodeHref`). */
  href: (nodeId: string) => string;
  ariaLabel: (title: string) => string;
}

interface ConnectionsTabBaseProps {
  edgeTypeRows: Array<{ type: string; count: number }>;
  totalEdges: number;
  edgeTypeLabel: (type: string) => string;
  hubs: ConnectionHubRow[];
  hubTotalCount: number;
  kindLabel: (kind: string) => string;
  hubLink: ConnectionsTabHubLink;
  labels: ConnectionsTabLabels;
  impactLink: ImpactRankingLink;
  impactLabels: ImpactRankingLabels;
}

export interface ConnectionsTabProps extends ConnectionsTabBaseProps {
  impactNodes: readonly KnowledgeGraphNode[];
  impactEdges: readonly KnowledgeGraphEdge[];
  impactLimit: number;
}

/**
 * The connections tab: which concepts are central, and how far a change spreads. Three full-width cards (relation
 * types, hubs, impact ranking) share one anatomy: head, chart or rows, one footnote. Hubs keep their order and only
 * badge document-less names; the impact ranking asks about risk, so it folds those names into a layer below.
 */
export function ConnectionsTab({
  edgeTypeRows,
  totalEdges,
  edgeTypeLabel,
  hubs,
  hubTotalCount,
  kindLabel,
  hubLink,
  labels,
  impactNodes,
  impactEdges,
  impactLimit,
  impactLink,
  impactLabels,
}: ConnectionsTabProps) {
  // The full-graph impact walk, O(nodes x reachable graph), runs only while this tab is mounted.
  const impact = useMemo(
    () => buildImpactRanking(impactNodes, impactEdges, impactLimit),
    [impactNodes, impactEdges, impactLimit],
  );
  const hubDegreeMax = hubs.reduce((m, h) => Math.max(m, h.degree), 0);

  return (
    // Three full-width cards, no side-by-side pair: a shared row height left a blank band above the shorter card.
    // The relation types are one stacked bar with its key; the hubs fold into two columns like the impact ranking.
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      <section
        aria-label={labels.relationTypesTitle}
        data-testid="connections-relation-types"
        className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.relationTypesTitle} />
        {edgeTypeRows.length === 0 ? (
          <div className="mt-3 flex flex-col">
            <EmptyState
              size="compact"
              icon={<Waypoints aria-hidden />}
              skeleton
              title={labels.noRelationTypes}
              description={labels.noRelationTypesHint}
              action={<EmptyRelationAction label={labels.emptyAction} testId="connections-relation-types-empty-action" />}
            />
          </div>
        ) : (
          // The key names each segment once with a literal swatch of it, its count and share; items wrap on a narrow board.
          // The map's line marks are not reused, since the map draws only solid and dashed lines.
          <ShareStack
            total={totalEdges}
            keyTestId="connections-relation-type-key"
            segmentTestId="connections-relation-type-segment"
            items={edgeTypeRows.map((row) => ({
              id: row.type,
              label: edgeTypeLabel(row.type),
              count: row.count,
              color: relationTypeIndigo(row.type),
              fill: relationTypeFill(row.type),
            }))}
          />
        )}
        <p className="mt-auto border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-body text-[color:var(--color-text-quaternary)]">
          {labels.relationTypesCaption}
        </p>
      </section>

      <section
        aria-label={labels.hubsTitle}
        className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        {/* The truncation copy below already states the hub total. */}
        <CardHead label={labels.hubsTitle} />
        {hubs.length === 0 ? (
          <div className="mt-2 mb-2.5 flex flex-col">
            <EmptyState
              size="compact"
              icon={<Waypoints aria-hidden />}
              skeleton
              title={labels.noHubs}
              description={labels.noHubsHint}
              action={<EmptyRelationAction label={labels.emptyAction} testId="connections-hubs-empty-action" />}
            />
          </div>
        ) : (
          <div className={`mt-2 mb-2.5 ${INSIGHTS_LIST_TWO_COLUMN}`}>
            {hubs.map((hub, i) => {
              const meterPct = hubDegreeMax > 0 ? Math.max(6, Math.round((hub.degree / hubDegreeMax) * 100)) : 0;
              return (
                <div key={hub.id} className={insightsTwoColumnCell(i)}>
                  <Link
                    href={hubLink.href(hub.id)}
                    aria-label={hubLink.ariaLabel(hub.title)}
                    data-testid="insights-hub-row-link"
                    // A bare divider row like the impact ranking's: the -mx/px pair lets only the hover surface pass the card inset,
                    // and the divider sits on the cell around it (`insights-list.ts`).
                    className={controlClass({ shape: "row", size: "md", hoverSurface: "lift", className: `-mx-1.5 w-auto gap-3 px-1.5 ${INSIGHTS_LIST_ROW}` })}
                  >
                    <OntologyMapKindGlyph kind={hub.kind} size={16} className="flex-none" />
                    <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-primary)]">
                      {hub.title}
                    </span>
                    {hub.evidenceOnly ? (
                      <EvidenceOnlyBadge
                        label={labels.evidenceBadge}
                        hint={labels.evidenceBadgeHint}
                      />
                    ) : null}
                    <span className="hidden flex-none text-label text-[color:var(--color-text-quaternary)] sm:inline">
                      {kindLabel(hub.kind)}
                    </span>
                    <span
                      aria-hidden
                      className="h-1.5 w-14 flex-none overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
                    >
                      <InsightsBar pct={meterPct} color="var(--color-indigo-a66)" index={i} />
                    </span>
                    <span className="w-9 flex-none text-right font-mono text-body tabular-nums text-[color:var(--map-numeral-face)]">
                      {hub.degree}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
        {/* The truncation copy joins the footnote on one line, so the card's anatomy matches its grid neighbours. */}
        <p className="mt-auto border-t border-[color:var(--color-divider)] pt-2.5 text-label leading-body text-[color:var(--color-text-quaternary)]">
          {hubTotalCount > hubs.length ? `${labels.hubTruncated(hubs.length, hubTotalCount)} · ` : ""}
          {labels.hubDegreeCaption}
        </p>
      </section>

      <ImpactRankingCard
        rows={impact.rows}
        rankedCount={impact.rankedCount}
        evidenceRows={impact.evidenceRows}
        evidenceRankedCount={impact.evidenceRankedCount}
        declaredDependencyEdges={impact.declaredDependencyEdges}
        declaredWithRationaleEdges={impact.declaredWithRationaleEdges}
        kindLabel={kindLabel}
        nodeLink={impactLink}
        labels={impactLabels}
      />
    </div>
  );
}

/** A card's name without a total: the census strip already prints the relation count. */
function CardHead({ label }: { label: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">{label}</InsightsSectionTitle>
    </div>
  );
}

/** The one door out of an empty relations card: the screen where relations are written. */
function EmptyRelationAction({ label, testId }: { label: string; testId: string }) {
  return (
    <Link
      href="/topology/?workbench=create"
      data-testid={testId}
      className={controlClass({
        shape: "link",
        tone: "accent",
        hoverInk: "strong",
        className: "rounded-chip hover:underline",
      })}
    >
      {label}
    </Link>
  );
}
