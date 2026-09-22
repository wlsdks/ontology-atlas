import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { copyText } from "@/shared/lib/copy-text";
import { COPY_FEEDBACK_RESET_MS } from "@/shared/lib/use-copy-feedback";
import type { OntologyMapEdge, OntologyMapNode } from "@/widgets/ontology-map";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveTopologyNodeTitle } from "../lib/resolve-topology-node-title";
import { computeTopologyShortestPath, formatTopologyPathAgentPacket } from "../lib/topology-analysis";
import { canCopyTopologyPathPacket, resolveTopologyPathChipState } from "../lib/topology-path-chip-state";
import { buildContainmentParentMap, deriveDeeplinkAncestorExpansion } from "./url-state";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function useTopologyPathLens({
  sourceSlug,
  targetSlug,
  projectBySlug,
  ontologyNodes,
  ontologyEdges,
  mapNodes,
  mapEdges,
  expandedParentSet,
  locale,
  t,
}: {
  sourceSlug: string | null;
  targetSlug: string | null;
  projectBySlug: ReadonlyMap<string, Project>;
  ontologyNodes: readonly KnowledgeGraphNode[] | null | undefined;
  ontologyEdges: readonly KnowledgeGraphEdge[] | null | undefined;
  mapNodes: readonly OntologyMapNode[];
  mapEdges: readonly OntologyMapEdge[];
  expandedParentSet: ReadonlySet<string>;
  locale: string;
  t: Translate;
}) {
  const sourceTitle = useMemo(
    () => resolveTopologyNodeTitle({ slug: sourceSlug, projectBySlug, ontologyNodes, locale }),
    [sourceSlug, projectBySlug, ontologyNodes, locale],
  );
  const targetTitle = useMemo(
    () => resolveTopologyNodeTitle({ slug: targetSlug, projectBySlug, ontologyNodes, locale }),
    [targetSlug, projectBySlug, ontologyNodes, locale],
  );
  const result = useMemo(() => {
    if (!sourceSlug || !targetSlug || !ontologyEdges) return null;
    return computeTopologyShortestPath(sourceSlug, targetSlug, mapNodes, ontologyEdges);
  }, [sourceSlug, targetSlug, ontologyEdges, mapNodes]);
  const hopCount = result?.hops ?? null;
  const nodeIds = useMemo(() => (result ? new Set(result.nodeIds) : null), [result]);
  const edgeIds = useMemo(() => (result ? new Set(result.edgeIds) : null), [result]);
  const allMapNodeIds = useMemo(() => new Set(mapNodes.map((node) => node.id)), [mapNodes]);
  const allExpandedParentIds = useMemo(
    () => new Set(mapEdges.filter((edge) => edge.kind === "contains").map((edge) => edge.source)),
    [mapEdges],
  );
  const expandedParents = useMemo(() => {
    if (!nodeIds || mapEdges.length === 0) return null;
    const parentOf = buildContainmentParentMap(mapEdges);
    const merged = new Set(expandedParentSet);
    for (const id of nodeIds) {
      for (const ancestor of deriveDeeplinkAncestorExpansion(id, parentOf, [])) merged.add(ancestor);
    }
    return merged;
  }, [nodeIds, mapEdges, expandedParentSet]);
  const chipState = useMemo(
    () => resolveTopologyPathChipState({ sourceSlug, targetSlug, sourceTitle, targetTitle, hopCount }),
    [sourceSlug, targetSlug, sourceTitle, targetTitle, hopCount],
  );
  const chipLabel = useMemo(() => {
    if (!chipState) return null;
    switch (chipState.kind) {
      case "missing-endpoints":
        return t("analysis.pathChipMissingEndpoints", { slugs: chipState.missing.join(" · ") });
      case "awaiting-target":
        return t("analysis.pathChipUnresolved", { source: chipState.sourceTitle });
      case "no-path":
        return t("analysis.pathChipNoPath", { source: chipState.sourceTitle, target: chipState.targetTitle });
      case "resolved":
        return t("analysis.pathChipResolved", { source: chipState.sourceTitle, target: chipState.targetTitle, hops: chipState.hops });
    }
  }, [chipState, t]);
  const [packetCopied, setPacketCopied] = useState(false);
  useEffect(() => {
    if (!packetCopied) return;
    const timer = window.setTimeout(() => setPacketCopied(false), COPY_FEEDBACK_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [packetCopied]);
  const copyPacket = useCallback(async () => {
    if (!canCopyTopologyPathPacket(chipState)) return;
    if (!sourceSlug || !targetSlug || !sourceTitle || !targetTitle) return;
    const ok = await copyText(formatTopologyPathAgentPacket({
      sourceSlug,
      targetSlug,
      sourceTitle,
      targetTitle,
      hopCount,
      labels: {
        title: t("analysis.pathChipPacketTitle"), source: t("analysis.pathChipPacketSource"),
        target: t("analysis.pathChipPacketTarget"), hops: t("analysis.pathChipPacketHops"),
        hopsUnknown: t("analysis.pathChipPacketHopsUnknown"),
        sourceOntologyUrl: t("analysis.pathChipPacketSourceOntologyUrl"),
        targetOntologyUrl: t("analysis.pathChipPacketTargetOntologyUrl"),
        sourceBuilderUrl: t("analysis.pathChipPacketSourceBuilderUrl"),
        targetBuilderUrl: t("analysis.pathChipPacketTargetBuilderUrl"),
        mcpCheck: t("analysis.pathChipPacketMcpCheck"),
      },
    }));
    if (ok) setPacketCopied(true);
  }, [chipState, sourceSlug, targetSlug, sourceTitle, targetTitle, hopCount, t]);

  return {
    pathSourceTitle: sourceTitle,
    pathTargetTitle: targetTitle,
    pathHopCount: hopCount,
    pathLensNodeIds: nodeIds,
    pathLensEdgeIds: edgeIds,
    allMapNodeIds,
    allExpandedParentIds,
    pathExpandedParents: expandedParents,
    pathChipState: chipState,
    pathChipLabel: chipLabel,
    pathPacketCopied: packetCopied,
    copyPathPacket: copyPacket,
  };
}
