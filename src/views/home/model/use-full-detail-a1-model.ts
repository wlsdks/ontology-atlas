"use client";

import { useMemo } from "react";
import {
  deriveCodeLocations,
  resolveNodeAgentTarget,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { buildFullDetailGroups, buildFullDetailReachModel } from "@/widgets/full-detail-a1";
import type { TopologyNodeFocusModel } from "../lib/topology-node-focus";
import type { NodeDatasheetDerivation } from "./use-node-datasheet-model";

/**
 * A closed card never traverses the graph. Reader updates reuse graph facts until their inputs change.
 */
export interface UseFullDetailA1ModelArgs {
  /** While `false` the hook returns `null` with no traversal. */
  open: boolean;
  nodeFocus: TopologyNodeFocusModel | null;
  selectedOntologyNode: KnowledgeGraphNode | null;
  insight: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  /** The fallback when the datasheet has no verdict. */
  changedSlugs: ReadonlySet<string>;
  /** Rendered as markdown when present. */
  nodeBody: { slug: string; raw: string; body: string } | null;
  /** Its presence enables inline editing. */
  nodeEditTarget: { vaultSlug: string } | null;
  /** Read-only samples offer no edit action. */
  vaultLoaded: boolean;
  onSaveExplanation: (next: string) => void | Promise<void>;
  /** Verdicts the compact popover already made, never made twice. */
  datasheet: NodeDatasheetDerivation["v2DatasheetModel"];
}

export function useFullDetailA1Model({
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
}: UseFullDetailA1ModelArgs) {
  const activeNodeId = open && nodeFocus && selectedOntologyNode && insight
    ? selectedOntologyNode.id : null;
  const graphFacts = useMemo(() => {
    if (activeNodeId === null || !insight) return null;
    return {
      reach: buildFullDetailReachModel(activeNodeId, insight.nodes, insight.edges),
      codeLocations: deriveCodeLocations(activeNodeId, insight.nodes, insight.edges),
      projectTitle: insight.nodes.find((node) => node.kind === "project")?.title ?? null,
    };
  }, [activeNodeId, insight]);
  const groups = useMemo(() => {
    if (activeNodeId === null || !insight) return null;
    return buildFullDetailGroups(activeNodeId, insight.nodes, insight.edges, changedSlugs);
  }, [activeNodeId, insight, changedSlugs]);

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
        // `fullTitle` renders only when it differs.
        title: nodeFocus.displayTitle,
        fullTitle: nodeFocus.title,
        kind: nodeFocus.kind,
        slug,
        // The name the vault knows, not the manifest slug.
        ...(() => {
          const target = resolveNodeAgentTarget(selectedOntologyNode);
          return { agentSlug: target.ref, documented: target.documented };
        })(),
        // Freshness has one source (`use-node-datasheet-model`): the datasheet's verdict for this
        // node, else the session baseline, or the two surfaces contradict each other.
        fresh:
          datasheet?.nodeId === selectedOntologyNode.id
            ? datasheet.powered
            : changedSlugs.has(selectedOntologyNode.id),
        updatedAtLabel:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.updatedAtLabel : null,
        // The compact panel's fact for this selection, never computed twice.
        lastEditSubject:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.lastEditSubject : null,
        mtimeConflict:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.mtimeConflict : false,
      },
      groups,
      reach: graphFacts.reach,
      codeLocations: graphFacts.codeLocations,
      breadcrumb: {
        projectTitle: graphFacts.projectTitle,
        // Canonical totals; `renderProjects` double-counted them.
        totalConcepts: insight.nodes.length,
        totalRelations: insight.edges.length,
      },
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
