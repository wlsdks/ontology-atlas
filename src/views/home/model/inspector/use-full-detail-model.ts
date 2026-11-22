"use client";

import { useMemo } from "react";
import {
  deriveCodeLocations,
  resolveNodeAgentTarget,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { buildFullDetailGroups, buildFullDetailReachModel, type FullDetailGroups } from "@/widgets/full-detail";
import type { DomainUsage } from "@/widgets/ontology-map";
import type { TopologyNodeFocusModel } from "../../lib/inspector/topology-node-focus";
import type { NodeDatasheetDerivation } from "./use-node-datasheet-model";

export interface UseFullDetailModelArgs {
  open: boolean;
  nodeFocus: TopologyNodeFocusModel | null;
  selectedOntologyNode: KnowledgeGraphNode | null;
  insight: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  changedSlugs: ReadonlySet<string>;
  nodeBody: { slug: string; raw: string; body: string } | null;
  nodeEditTarget: { vaultSlug: string } | null;
  vaultLoaded: boolean;
  onSaveExplanation: (next: string) => void | Promise<void>;
  datasheet: NodeDatasheetDerivation["v2DatasheetModel"];
}

export function useFullDetailModel({
  open,
  nodeFocus,
  selectedOntologyNode,
  insight,
  changedSlugs,
  nodeBody,
  nodeEditTarget,
  vaultLoaded,
  onSaveExplanation,
  datasheet,
}: UseFullDetailModelArgs) {
  const activeNodeId = open && nodeFocus && selectedOntologyNode && insight
    ? selectedOntologyNode.id : null;
  const graphFacts = useMemo(() => {
    if (activeNodeId === null || !insight) return null;
    return {
      reach: buildFullDetailReachModel(activeNodeId, insight.nodes, insight.edges),
      codeLocations: deriveCodeLocations(activeNodeId, insight.nodes, insight.edges),
    };
  }, [activeNodeId, insight]);
  const directGroups = useMemo(() => {
    if (activeNodeId === null || !insight) return null;
    return buildFullDetailGroups(activeNodeId, insight.nodes, insight.edges, changedSlugs);
  }, [activeNodeId, insight, changedSlugs]);
  const domainUsage = datasheet?.nodeId === activeNodeId ? datasheet.domainUsage : null;
  const groups = useMemo(
    () => (directGroups ? { ...directGroups, domainLevel: toDomainLevel(domainUsage) } : null),
    [directGroups, domainUsage],
  );

  return useMemo(() => {
    if (!open) return null;
    if (!nodeFocus || !selectedOntologyNode || !insight || !graphFacts || !groups) return null;
    const slug = nodeFocus.sourceSlug ?? selectedOntologyNode.id;
    const loadedBody = nodeBody && nodeBody.slug === slug ? nodeBody.body : null;
    const bodyMarkdown = loadedBody ?? selectedOntologyNode.summary ?? null;
    // Without its own document the link is relabelled "the document that mentions it", not
    // dropped.
    const documentHref = nodeFocus.ownDocumentSlug
      ? buildDocsVaultHref({ slug: nodeFocus.ownDocumentSlug })
      : null;
    const mentionDocumentHref = nodeFocus.mentionedInSlug
      ? buildDocsVaultHref({ slug: nodeFocus.mentionedInSlug })
      : null;
    const explanationEdit =
      nodeEditTarget &&
      vaultLoaded &&
      nodeBody &&
      nodeBody.slug === nodeEditTarget.vaultSlug
        ? { onSave: onSaveExplanation }
        : null;
    return {
      node: {
        id: selectedOntologyNode.id,
        title: nodeFocus.displayTitle,
        fullTitle: nodeFocus.title,
        kind: nodeFocus.kind,
        ownerTitle:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.owner?.title ?? null : null,
        slug,
        ...(() => {
          const target = resolveNodeAgentTarget(selectedOntologyNode);
          return { agentSlug: target.ref, documented: target.documented };
        })(),
        // Freshness has one source (`use-node-datasheet-model`): the datasheet's result for this node,
        // else the session baseline, or the two surfaces contradict each other.
        fresh:
          datasheet?.nodeId === selectedOntologyNode.id
            ? datasheet.powered
            : changedSlugs.has(selectedOntologyNode.id),
        updatedAtLabel:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.updatedAtLabel : null,
        lastEditSubject:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.lastEditSubject : null,
        mtimeConflict:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.mtimeConflict : false,
      },
      groups,
      reach: graphFacts.reach,
      codeLocations: graphFacts.codeLocations,
      bodyMarkdown,
      explanationEdit,
      documentHref,
      mentionDocumentHref,
    };
  }, [
    open,
    nodeFocus,
    selectedOntologyNode,
    insight,
    graphFacts,
    groups,
    changedSlugs,
    nodeBody,
    nodeEditTarget,
    vaultLoaded,
    onSaveExplanation,
    datasheet,
  ]);
}

function toDomainLevel(usage: DomainUsage | null): FullDetailGroups["domainLevel"] {
  if (!usage) return null;
  const toLinks = (rows: DomainUsage["usedBy"]) => rows.map((row) => ({ id: row.domainId, title: row.label, links: row.links }));
  return { usedBy: toLinks(usage.usedBy), needs: toLinks(usage.needs) };
}
