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
   * Is this a name written only as evidence (no document of its own)? Hubs do not reorder — pushing
   * something genuinely well connected downward makes the answer to "what is central right now?"
   * wrong. Instead the row quietly states that it has no document yet.
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
  /**
   * The one door each empty card offers. Both cards are empty for the same
   * reason — no relation has been written yet — so both send the reader to the
   * one screen where a relation can be written, the same address the
   * composition and boundaries tabs already use for their own empty states.
   */
  emptyAction: string;
  hubTruncated: (shown: number, total: number) => string;
  hubDegreeCaption: string;
  /** The evidence-layer badge — from the **same i18n key** as the impact ranking (one set of copy). */
  evidenceBadge: string;
  evidenceBadgeHint: string;
}

interface ConnectionsTabHubLink {
  /** Clicking a hub row deeplinks to that node on the map (`buildOntologyNodeHref`). */
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
 * The `connections` tab — it answers "which concepts are central, and how far does a change
 * spread?". The three cards (relation types · hubs · impact ranking) stack at full width and share
 * one anatomy so they read alike: head (title + total) → chart or rows → one footnote.
 *
 * Two ink reductions are reflected here.
 * ① The "most depended upon" card was deleted — measured against the dogfood vault, all top five
 *    rows had a count of 1, so there was no ranking (dependency edges were 6% of the total). A table
 *    with no signal spends only the reader's time.
 * ② The hub ego thumbnails were deleted — all six rows were the same wheel shape, so the
 *    distinguishing information lived only in the number (Tufte: erase non-data ink). What remains
 *    is the kind glyph, title, relative bar, and number, and the row height halved.
 *
 * "Concepts whose change spreads furthest" on the second line (full width) is the hub's counterpart —
 * where hubs say "what is central right now", the impact ranking says "how far do I have to re-read
 * if I touch it". Two faces of one question, so they live in one tab.
 *
 * The two cards treat the evidence layer differently because their questions differ. The impact
 * ranking asks about risk, so it pushes document-less derived concepts into a folded layer below;
 * hubs ask "what actually has many connections", so the order is left alone and the fact is stated
 * with a badge only — reordering here would make the answer itself wrong.
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
  // This full-graph walk belongs to this tab alone. Keeping it below the conditional tab mount
  // lets Brief and the other views arrive without paying the O(nodes × reachable graph) cost.
  const impact = useMemo(
    () => buildImpactRanking(impactNodes, impactEdges, impactLimit),
    [impactNodes, impactEdges, impactLimit],
  );
  // `hubs` is already sorted by degree descending — `hubs[0]` is the maximum within this list.
  const hubDegreeMax = hubs.reduce((m, h) => Math.max(m, h.degree), 0);

  return (
    /*
     * ⚠️ **Three full-width cards, no side-by-side pair.** Relation types (three or four rows)
     * stood beside the hubs (six rows) and the shared row height left a 100-120px blank band
     * above the short card's caption at 1512x949 (review, 2026-09-25). Spreading the rows was
     * rejected once already, and so was stretching the card. The type rows also drew a second
     * bar for the share the stacked bar above them already showed, so the card is now that one
     * stacked bar with its key: a band, as tall as what it says. The hubs take the full width
     * and fold into two columns, the same grammar the impact ranking under them uses.
     */
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--card-gap)]">
      <section
        aria-label={labels.relationTypesTitle}
        data-testid="connections-relation-types"
        className="flex min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.relationTypesTitle} count={totalEdges} />
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
          /* The key names each segment once: its swatch, the count and the share. Items sit on
             one row and wrap on a narrow board. The map's line mark is not repeated here: the
             map draws only two lines (solid containment, dashed everything else), so two types
             wore the same dashed mark and the key told them apart by the label alone (review,
             2026-09-25, round 4). The swatch is a literal sample of the segment instead. */
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
        {/* The hub total is already stated by the truncation copy below ("top 6 / 289 total") — the
            same figure is not printed twice in one card. */}
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
                    /*
                     * A bare divider row, like the impact ranking's. `row` has no border, and the
                     * -mx/px pair lets only the hover surface pass the card inset; the divider sits
                     * on the cell around it, on the card's padding line (`insights-list.ts`).
                     */
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
        {/* The truncation copy is appended to the footnote to keep it one line — an optional slot
            that shifts the card height would give two cards in the same grid different anatomies. */}
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

function CardHead({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <InsightsSectionTitle level={2} className="text-body-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">{label}</InsightsSectionTitle>
      {count === undefined ? null : (
        <span className="ml-auto font-mono text-body tabular-nums text-[color:var(--map-numeral-face)]">
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * The single door out of an empty relations card.
 *
 * Both cards on this tab used to end in prose that named the remedy ("connect
 * concepts on the map") without offering it, while the composition and
 * boundaries tabs already linked to exactly that screen from their own empty
 * states. The sibling with the link was right; these two were the copies that
 * lost it.
 */
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
