import {
  buildOntologyTree,
  computeCanonicalCensus,
  computeDomainCensusRows,
  domainCensusById,
  type KnowledgeProjectInsight,
  type useRelationVocabulary,
} from "@/entities/knowledge-graph";
import { useMemo } from "react";
import {
  collectRealmMemberIds,
  computeRealmBoundary,
  computeRealmCensus,
  findRealmSubtree,
} from "../lib/realm-ledger";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Projects already live in `insight.nodes`; the canonical census must never add the
 * rendered project list again or the map and INDEX totals diverge.
 */
export function useTopologyIndexReadModel({
  insight,
  resolvedRealmSlug,
  relationVocabulary,
  t,
}: {
  insight: KnowledgeProjectInsight | null;
  resolvedRealmSlug: string | null;
  relationVocabulary: ReturnType<typeof useRelationVocabulary>;
  t: Translate;
}) {
  const canonicalCensus = computeCanonicalCensus(insight?.nodes ?? [], insight?.edges ?? []);
  const indexTreeResult = useMemo(
    () => (insight ? buildOntologyTree(insight.nodes, insight.edges) : null),
    [insight],
  );
  const indexDomainCount = useMemo(
    () => insight?.nodes.filter((node) => node.kind === "domain").length ?? 0,
    [insight],
  );

  // Project rows are included because the INDEX badge and map node use the same
  // transitive BFS count. Restricting this to domains made project counts disagree.
  const indexDomainCensus = useMemo(
    () =>
      insight
        ? domainCensusById(
          computeDomainCensusRows(insight.nodes, insight.edges, ["domain", "project"]),
        )
        : null,
    [insight],
  );
  const indexDomainIds = useMemo(
    () => new Set((insight?.nodes ?? []).filter((node) => node.kind === "domain").map((node) => node.id)),
    [insight],
  );
  const indexMaxDomainDescendantCount = useMemo(() => {
    if (!indexDomainCensus || indexDomainCensus.size === 0) return 0;
    let max = 0;
    // A project's total spans all its domains. The capacity denominator compares
    // sibling domains, so project rows must stay out of this maximum.
    for (const row of indexDomainCensus.values()) {
      if (indexDomainIds.has(row.id) && row.total > max) max = row.total;
    }
    return max;
  }, [indexDomainCensus, indexDomainIds]);

  const realmNodeById = useMemo(
    () => new Map((insight?.nodes ?? []).map((node) => [node.id, node] as const)),
    [insight],
  );
  const realmLedgerModel = useMemo(() => {
    if (!resolvedRealmSlug || !indexTreeResult || !insight) return null;
    const subtree = findRealmSubtree(indexTreeResult.roots, resolvedRealmSlug);
    if (!subtree) return null;
    const census = computeRealmCensus(subtree);
    const boundary = computeRealmBoundary({
      edges: insight.edges,
      memberIds: collectRealmMemberIds(subtree),
      nodeById: realmNodeById,
    });
    return {
      rootKind: subtree.node.kind,
      // Use the same localized display name as the canvas and realm chip.
      rootTitle: subtree.node.display ?? subtree.node.title,
      census,
      subtree,
      boundaryRows: boundary.crossings.slice(0, 6).map((crossing) => ({
        edgeId: crossing.edgeId,
        fromTitle: crossing.fromTitle,
        toTitle: crossing.toTitle,
        relationLabel: relationVocabulary(crossing.relationType, "formal"),
        outsideId: crossing.outsideId,
        jumpRealmId: crossing.jumpRealmId,
      })),
      boundaryTotal: boundary.total,
    };
  }, [resolvedRealmSlug, indexTreeResult, insight, realmNodeById, relationVocabulary]);
  const realmCaption = useMemo(() => {
    if (!realmLedgerModel) return null;
    const { census, rootTitle } = realmLedgerModel;
    const parts: string[] = [];
    // Caption and ledger intentionally share this census and these unit keys.
    if (census.elementCount > 0) parts.push(`${t("index.elementsShort")} ${census.elementCount}`);
    if (census.capabilityCount > 0) parts.push(`${t("index.capabilitiesShort")} ${census.capabilityCount}`);
    return parts.length > 0 ? `${rootTitle} · ${parts.join(" · ")}` : rootTitle;
  }, [realmLedgerModel, t]);

  return {
    topologyTotalNodes: canonicalCensus.conceptCount,
    topologyTotalRelations: canonicalCensus.relationCount,
    indexTreeResult,
    indexDomainCount,
    indexDomainCensus,
    indexMaxDomainDescendantCount,
    realmLedgerModel,
    realmActive: resolvedRealmSlug !== null && realmLedgerModel !== null,
    realmCaption,
  };
}
