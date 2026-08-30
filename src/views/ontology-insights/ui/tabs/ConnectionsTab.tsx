import { Waypoints } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  EmptyState,
  EvidenceOnlyBadge,
  TopologyV2KindGlyph,
  TopologyV2TraceMark,
} from "@/shared/ui";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import { relationTypeIndigo } from "../../lib/relation-type-tone";
import type { ImpactRanking } from "../../lib/impact-ranking";
import { InsightsBar } from "../parts/InsightsBar";
import {
  ImpactRankingCard,
  type ImpactRankingLabels,
  type ImpactRankingLink,
} from "./ImpactRankingCard";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
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

export interface ConnectionsTabProps {
  edgeTypeRows: Array<{ type: string; count: number }>;
  totalEdges: number;
  edgeTypeLabel: (type: string) => string;
  hubs: ConnectionHubRow[];
  hubTotalCount: number;
  kindLabel: (kind: string) => string;
  hubLink: ConnectionsTabHubLink;
  labels: ConnectionsTabLabels;
  impact: ImpactRanking;
  impactLink: ImpactRankingLink;
  impactLabels: ImpactRankingLabels;
}

/**
 * The `connections` tab — it answers "which concepts are central, and how far does a change
 * spread?". The three cards (relation types ∥ hubs · impact ranking) share one anatomy so they read
 * alike: head (title + total) → chart → rows → one footnote.
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
  impact,
  impactLink,
  impactLabels,
}: ConnectionsTabProps) {
  const edgeMax = edgeTypeRows.reduce((m, r) => Math.max(m, r.count), 0);
  // `hubs` is already sorted by degree descending — `hubs[0]` is the maximum within this list.
  const hubDegreeMax = hubs.reduce((m, h) => Math.max(m, h.degree), 0);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[var(--card-gap)] lg:grid-cols-2">
      <section
        aria-label={labels.relationTypesTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        <CardHead label={labels.relationTypesTitle} count={totalEdges} />
        {edgeTypeRows.length === 0 ? (
          <div className="mt-3 flex flex-1 flex-col">
            <EmptyState
              size="compact"
              icon={<Waypoints aria-hidden />}
              skeleton
              title={labels.noRelationTypes}
              description={labels.noRelationTypesHint}
            />
          </div>
        ) : (
          <>
            <div
              aria-hidden
              className="mt-3 flex h-2 w-full overflow-hidden rounded-full border border-[color:var(--color-divider)]"
            >
              {edgeTypeRows.map((row) => {
                const share = totalEdges > 0 ? row.count / totalEdges : 0;
                if (share <= 0) return null;
                return (
                  <span
                    key={row.type}
                    style={{ flexGrow: share, backgroundColor: relationTypeIndigo(row.type) }}
                  />
                );
              })}
            </div>
            {/* Relation types are only 3–4 rows, so the hub card beside it (6 rows) sets the grid
                height — the leftover vertical space is distributed evenly between rows so the bottom
                of the card does not look empty (the same treatment as the kind distribution card). */}
            <div className="mt-2 flex flex-1 flex-col justify-evenly">
              {edgeTypeRows.map((row, i) => {
                const width = edgeMax > 0 ? Math.max(2, Math.round((row.count / edgeMax) * 100)) : 0;
                const pct = totalEdges > 0 ? Math.round((row.count / totalEdges) * 100) : 0;
                return (
                  <div
                    key={row.type}
                    className="flex items-center gap-3 border-t border-[color:var(--color-divider)] py-2.5 first:border-t-0"
                  >
                    <TopologyV2TraceMark containment={isContainmentRelation(row.type)} />
                    <span className="w-[104px] flex-none truncate font-mono text-body text-[color:var(--color-text-primary)]">
                      {edgeTypeLabel(row.type)}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
                      <InsightsBar pct={width} color={relationTypeIndigo(row.type)} index={i} />
                    </span>
                    <span className="w-11 flex-none text-right font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                      {row.count}
                    </span>
                    <span className="w-9 flex-none text-right font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          {labels.relationTypesCaption}
        </p>
      </section>

      <section
        aria-label={labels.hubsTitle}
        className="flex min-h-0 min-w-0 flex-col rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
      >
        {/* The hub total is already stated by the truncation copy below ("top 6 / 289 total") — the
            same figure is not printed twice in one card. */}
        <CardHead label={labels.hubsTitle} />
        <div className="mt-2 flex flex-1 flex-col justify-start">
          {hubs.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Waypoints aria-hidden />}
              skeleton
              title={labels.noHubs}
              description={labels.noHubsHint}
            />
          ) : (
            hubs.map((hub, i) => {
              const meterPct = hubDegreeMax > 0 ? Math.max(6, Math.round((hub.degree / hubDegreeMax) * 100)) : 0;
              return (
                <Link
                  key={hub.id}
                  href={hubLink.href(hub.id)}
                  aria-label={hubLink.ariaLabel(hub.title)}
                  data-testid="insights-hub-row-link"
                  className={controlClass({ shape: "chip", className: "-mx-1.5 flex gap-3 border-t border-[color:var(--color-divider)] px-1.5 py-2.5 first:border-t-0 hover:bg-[color:var(--color-overlay-1)]" })}
                >
                  <TopologyV2KindGlyph kind={hub.kind} size={16} className="flex-none" />
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
                  <span className="w-9 flex-none text-right font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
                    {hub.degree}
                  </span>
                </Link>
              );
            })
          )}
        </div>
        {/* The truncation copy is appended to the footnote to keep it one line — an optional slot
            that shifts the card height would give two cards in the same grid different anatomies. */}
        <p className="mt-2.5 border-t border-[color:var(--color-divider)] pt-2.5 text-label text-[color:var(--color-text-quaternary)]">
          {hubTotalCount > hubs.length ? `${labels.hubTruncated(hubs.length, hubTotalCount)} · ` : ""}
          {labels.hubDegreeCaption}
        </p>
      </section>

      {/* The second line of the same grid — the ranking's titles are long and would be clipped in half a column. */}
      <ImpactRankingCard
        className="lg:col-span-2"
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
        <span className="ml-auto font-mono text-body tabular-nums text-[color:var(--topology-v2-numeral-face)]">
          {count}
        </span>
      )}
    </div>
  );
}
