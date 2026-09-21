import { buildDocsVaultHref, type VaultManifest } from "@/entities/docs-vault";
import type { KnowledgeProjectInsight, useRelationVocabulary } from "@/entities/knowledge-graph";
import { buildTopologyMeaningEditorEdgeHref, edgeAuthoredByFromNode, meaningEditRelationForEdgeType } from "@/entities/knowledge-graph";
import { useHeldValue } from "@/shared/lib/use-presence";
import type { HoverAvoidRect } from "@/widgets/ontology-map";
import { useCallback, useMemo, useState } from "react";
import { edgeSentenceValues, normalizeEdgeSentenceKey } from "../lib/edge-sentence";
import { computeUpdatedAgo } from "../lib/format-updated-ago";
import { resolveTopologyNodeEditTarget } from "../lib/topology-node-edit";

export interface SelectedTopologyEdge {
  sourceId: string;
  targetId: string;
  relationType: string;
  declaredBySlug: string | null;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function useTopologyEdgeInteractions({ insight, selectedNode, createNodeOpen, docFreshnessIndex, updatedAgoNowMs, t, relationVocabulary, relationRegister, manifest }: {
  insight: KnowledgeProjectInsight | null;
  selectedNode: boolean;
  createNodeOpen: boolean;
  docFreshnessIndex: ReadonlyMap<string, string>;
  updatedAgoNowMs: number;
  t: Translate;
  relationVocabulary: ReturnType<typeof useRelationVocabulary>;
  relationRegister: Parameters<ReturnType<typeof useRelationVocabulary>>[1];
  manifest: VaultManifest | null;
}) {
  const [selectedEdge, setSelectedEdge] = useState<SelectedTopologyEdge | null>(null);
  const edgePanelModel = useMemo(() => {
    if (!selectedEdge || !insight) return null;
    const from = insight.nodes.find((node) => node.id === selectedEdge.sourceId);
    const to = insight.nodes.find((node) => node.id === selectedEdge.targetId);
    if (!from || !to) return null;
    const edgeRecord = insight.edges.find((edge) => edge.from === selectedEdge.sourceId && edge.to === selectedEdge.targetId && edge.type === selectedEdge.relationType);
    const fromDisplay = from.display ?? from.title;
    const toDisplay = to.display ?? to.title;
    const sentenceKey = normalizeEdgeSentenceKey(selectedEdge.relationType);
    const declaredIso = selectedEdge.declaredBySlug ? docFreshnessIndex.get(selectedEdge.declaredBySlug) : undefined;
    const ago = declaredIso ? computeUpdatedAgo(declaredIso, updatedAgoNowMs) : null;
    const meaningRelation = meaningEditRelationForEdgeType(selectedEdge.relationType);
    const authoredByFrom = edgeAuthoredByFromNode(selectedEdge.declaredBySlug, from.evidenceIds[0]);
    const contextualEditTarget = meaningRelation && authoredByFrom ? resolveTopologyNodeEditTarget(from, manifest?.docs ?? []) : null;
    return {
      sentence: t(`edgeSentence.${sentenceKey}`, edgeSentenceValues(sentenceKey, fromDisplay, toDisplay)),
      typeLabel: relationVocabulary(selectedEdge.relationType, relationRegister),
      fromId: from.id, toId: to.id, fromTitle: fromDisplay, toTitle: toDisplay,
      declaredBy: selectedEdge.declaredBySlug ? { slug: selectedEdge.declaredBySlug, href: buildDocsVaultHref({ slug: selectedEdge.declaredBySlug }) } : null,
      updatedAtLabel: ago ? t(`nodeDatasheet.updated_${ago.key}`, { count: ago.count }) : null,
      meaningEditHref: meaningRelation && authoredByFrom ? buildTopologyMeaningEditorEdgeHref(from.id, to.id, meaningRelation) : null,
      meaningRelation,
      contextualEditable: contextualEditTarget !== null,
      why: edgeRecord?.label?.trim() || null,
    };
  }, [selectedEdge, insight, docFreshnessIndex, updatedAgoNowMs, t, relationVocabulary, relationRegister, manifest]);
  const edgePanelOpen = Boolean(edgePanelModel) && !selectedNode && !createNodeOpen;
  const edgePanelKey = selectedEdge ? `${selectedEdge.sourceId}→${selectedEdge.relationType}→${selectedEdge.targetId}` : null;
  const heldEdgePanelModel = useHeldValue(edgePanelOpen ? edgePanelModel : null, edgePanelKey);

  const [hoverEdge, setHoverEdge] = useState<{ edge: SelectedTopologyEdge; x: number; y: number; avoid: readonly HoverAvoidRect[] } | null>(null);
  const handleHoverEdge = useCallback((edge: SelectedTopologyEdge | null, position: { x: number; y: number; avoid: readonly HoverAvoidRect[] } | null) => {
    setHoverEdge(edge && position ? { edge, x: position.x, y: position.y, avoid: position.avoid } : null);
  }, []);
  const hoverEdgeCardModel = useMemo(() => {
    if (!hoverEdge || !insight) return null;
    const from = insight.nodes.find((node) => node.id === hoverEdge.edge.sourceId);
    const to = insight.nodes.find((node) => node.id === hoverEdge.edge.targetId);
    if (!from || !to) return null;
    const edgeRecord = insight.edges.find((edge) => edge.from === hoverEdge.edge.sourceId && edge.to === hoverEdge.edge.targetId && edge.type === hoverEdge.edge.relationType);
    const sentenceKey = normalizeEdgeSentenceKey(hoverEdge.edge.relationType);
    return {
      sentence: t(`edgeSentence.${sentenceKey}`, edgeSentenceValues(sentenceKey, from.display ?? from.title, to.display ?? to.title)),
      typeLabel: relationVocabulary(hoverEdge.edge.relationType, relationRegister),
      why: edgeRecord?.label?.trim() || null, x: hoverEdge.x, y: hoverEdge.y, avoid: hoverEdge.avoid
    };
  }, [hoverEdge, insight, t, relationVocabulary, relationRegister]);

  const [hoverCluster, setHoverCluster] = useState<{ parentId: string; count: number; descendantTotal: number; expanded: boolean; x: number; y: number } | null>(null);
  const handleHoverCluster = useCallback((info: { parentId: string; count: number; descendantTotal: number; expanded: boolean; position: { x: number; y: number } } | null) => {
    setHoverCluster(info ? { ...info, x: info.position.x, y: info.position.y } : null);
  }, []);
  const clusterHoverCardModel = useMemo(() => {
    if (!hoverCluster) return null;
    const parent = insight?.nodes.find((node) => node.id === hoverCluster.parentId);
    const numbers = { name: parent?.title ?? hoverCluster.parentId, total: hoverCluster.descendantTotal, hidden: hoverCluster.count };
    return {
      sentence: hoverCluster.expanded ? t("cluster.tooltipExpanded", numbers) : t("cluster.tooltipCollapsed", numbers),
      x: hoverCluster.x, y: hoverCluster.y
    };
  }, [hoverCluster, insight, t]);

  return {
    selectedEdge, setSelectedEdge, edgePanelModel, edgePanelOpen, heldEdgePanelModel, setHoverEdge,
    handleHoverEdge, hoverEdgeCardModel, handleHoverCluster, clusterHoverCardModel
  };
}
