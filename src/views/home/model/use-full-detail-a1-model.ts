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
 * Assembles the full-detail card model.
 *
 * **Why it is a separate hook (click-stall prescription, 2026-07-28).** The
 * model was being assembled on every map node click, while the surface that
 * draws it (`FullDetailCard`) does not render until the user opens full
 * detail. So **the most frequent interaction paid up front for the most
 * expensive derivation.** Measured (isolated Chromium, dogfood vault, one node
 * click): `buildConnections` ran **11 times** per click, 9 of them for this
 * closed surface. Those 9 carry
 *
 * - `buildFullDetailReachModel`'s **depth-3 BFS** over the whole graph,
 * - `countContainmentChildren` inside `buildFullDetailGroups`, run for **each**
 *   neighbour row (a full edge scan — neighbours × edges),
 * - the same `deriveCodeLocations` the popover already built.
 *
 * On a small vault this is invisible; as the vault grows this term eats the
 * whole click frame.
 *
 * Hence one contract: **while `open` is false the graph is never traversed.**
 * The open result is identical to before — nothing is deferred or
 * approximated. Opening the card assembles it synchronously in the same
 * render, so there is no "show a wrong value first, fix it later" failure mode.
 *
 * Regression guard: `use-full-detail-a1-model.test.ts` (closed → 0 traversals).
 */
export interface UseFullDetailA1ModelArgs {
  /**
   * Whether the full-detail card is actually on screen. While `false` the hook
   * returns `null` immediately and performs no graph traversal.
   */
  open: boolean;
  nodeFocus: TopologyNodeFocusModel | null;
  selectedOntologyNode: KnowledgeGraphNode | null;
  insight: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  /** Session changeset baseline — the fallback when the datasheet has no verdict. */
  changedSlugs: ReadonlySet<string>;
  /** Body of the opened document, rendered as markdown when present. */
  nodeBody: { slug: string; raw: string; body: string } | null;
  /** The vault document matching this node; its presence enables inline editing. */
  nodeEditTarget: { vaultSlug: string } | null;
  /** Whether a vault is loaded — read-only samples offer no edit action. */
  vaultLoaded: boolean;
  onSaveExplanation: (next: string) => void | Promise<void>;
  /** The freshness / last-edit verdicts the compact popover already made — never made twice. */
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
  return useMemo(() => {
    // A closed surface never traverses the graph — this one line is the whole fix.
    if (!open) return null;
    if (!nodeFocus || !selectedOntologyNode || !insight) return null;
    const slug = nodeFocus.sourceSlug ?? selectedOntologyNode.id;
    const groups = buildFullDetailGroups(
      selectedOntologyNode.id,
      insight.nodes,
      insight.edges,
      changedSlugs,
    );
    const reach = buildFullDetailReachModel(
      selectedOntologyNode.id,
      insight.nodes,
      insight.edges,
    );
    const codeLocations = deriveCodeLocations(
      selectedOntologyNode.id,
      insight.nodes,
      insight.edges,
    );
    const projectTitle = insight.nodes.find((n) => n.kind === "project")?.title ?? null;
    const loadedBody = nodeBody && nodeBody.slug === slug ? nodeBody.body : null;
    const bodyMarkdown = loadedBody ?? selectedOntologyNode.summary ?? null;
    // Full detail has no evidence list either, so with no document of its own
    // the link is relabelled as "the document that mentions it" rather than
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
        // The header shows the short display title large and keeps the
        // original as `fullTitle`, rendered only when the two differ.
        title: nodeFocus.displayTitle,
        fullTitle: nodeFocus.title,
        kind: nodeFocus.kind,
        slug,
        // The handoff chain uses the name the vault knows, not the manifest slug.
        ...(() => {
          const target = resolveNodeAgentTarget(selectedOntologyNode);
          return { agentSlug: target.ref, documented: target.documented };
        })(),
        // Freshness has one source: the document mtime ramp (see
        // `use-node-datasheet-model`). Judging it here from the session
        // changeset baseline instead produced a sentence contradicting the
        // datasheet on the same node — "changed 2 days ago" beside "unchanged
        // for a while" for the same domains/catalog. Take the datasheet's
        // verdict for the same node, and fall back to the old baseline only
        // when there is none (different node, or no model built).
        fresh:
          datasheet?.nodeId === selectedOntologyNode.id
            ? datasheet.powered
            : changedSlugs.has(selectedOntologyNode.id),
        updatedAtLabel:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.updatedAtLabel : null,
        // Reuse the SAME fact from the compact panel's `v2DatasheetModel` for
        // this selection: the baseline/heartbeat verdict for this node is never
        // computed twice (same reason as the count-drift rule).
        lastEditSubject:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.lastEditSubject : null,
        mtimeConflict:
          datasheet?.nodeId === selectedOntologyNode.id ? datasheet.mtimeConflict : false,
      },
      groups,
      reach,
      codeLocations,
      breadcrumb: {
        projectTitle,
        // The canonical totals — `renderProjects` used to double-count these.
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
    changedSlugs,
    nodeBody,
    nodeEditTarget,
    vaultLoaded,
    onSaveExplanation,
    datasheet,
  ]);
}
