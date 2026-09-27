"use client";

import { useMemo, useState } from "react";
import {
  buildTopologyMeaningEditorNodeHref,
  buildTopologyReturnMarker,
  deriveCodeLocations,
  resolveNodeAgentTarget,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  isWithinRecentWindow,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import type { AgentActivityStatus } from "@/entities/vault-session";
import { computeEditAge } from "@/shared/lib/edit-age";
import type { LastEditSubjectKind } from "@/shared/lib/last-edit-subject";
import { computeUpdatedAgo } from "../lib/format-updated-ago";
import { hasNodeMtimeConflict, resolveNodeLastEditSubject } from "../lib/resolve-node-edit-subject";
import { buildTopologyOntologyDrawerModel } from "../lib/topology-ontology-drawer";
import { buildTopologyNodeFocus, type TopologyNodeFocusModel } from "../lib/topology-node-focus";
import { buildNodeSignificance, type NodeSignificanceModel } from "../lib/topology-node-significance";
import {
  buildV2ConnectionGroups,
  buildV2Connections,
  buildV2EvidenceRows,
  formatV2HandoffText,
} from "@/widgets/ontology-map";

/**
 * Assembles the node datasheet model. `metric` counts come from the same `groups` the panel draws,
 * or
 * parallel edges make them diverge. Containment is counted apart from "what it leans on".
 * Freshness has one
 * source (`docFreshnessIndex`), never the session baseline. `nodeId` is the canvas id; `slug`
 * prefers the
 * vault slug for deep links and handoff text.
 */
export interface UseNodeDatasheetModelArgs {
  selectedOntologyNode: KnowledgeGraphNode | null;
  insight: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  /** Static samples are facts to inspect, never an MCP write target. */
  handoffSource: "loaded-vault" | "read-only-sample";
  /** Overrides the derived value when present. */
  authoredSignificance: string | null;
  docFreshnessIndex: ReadonlyMap<string, string>;
  /**
   * File dates for the conflict badge alone: a commit moves `docFreshnessIndex` without writing
   * the file.
   * Defaults to `docFreshnessIndex`.
   */
  docFileDateIndex?: ReadonlyMap<string, string>;
  /**
   * While Git is dating documents, a node without a date gets an empty `updatedAtLabel`, claiming
   * nothing yet.
   */
  docDatesReading?: boolean;
  /** Null while the source restores; no edit baseline is captured or compared until then. */
  editBaselineScopeKey: string | null;
  /** Keeps rendering pure. */
  updatedAgoNowMs: number;
  formatUpdatedLabel: (key: string, count: number) => string;
  /** Always defined; with no heartbeat the agent candidate has no evidence. */
  agentActivityStatus: AgentActivityStatus;
  /** The `resolveAgentFocusNodeId` result, so the badge and this fact name the same node. */
  agentFocusNodeId: string | null;
  /**
   * The slugs this session wrote: the only human evidence for "last edit · me" and the conflict
   * badge.
   */
  selfEditTimestamps: ReadonlyMap<string, number>;
  formatEditAgeLabel: (key: string, count: number) => string;
}

export interface NodeDatasheetDerivation {
  nodeFocus: TopologyNodeFocusModel | null;
  significance: NodeSignificanceModel | null;
  v2DatasheetModel: {
    slug: string;
    nodeId: string;
    title: string;
    /** Only when the displayed title differs (humanised label); shown as a mono subline. */
    sourceTitle: string | null;
    kind: string;
    domain: { id: string; title: string } | null;
    powered: boolean;
    /** `""` while Git is still dating documents; null with no date. */
    updatedAtLabel: string | null;
    metric: {
      contains: number;
      usedBy: number;
      dependsOn: number;
      belongsTo: number;
      evidence: number;
    };
    groups: ReturnType<typeof buildV2ConnectionGroups>;
    evidence: { rows: ReturnType<typeof buildV2EvidenceRows>; total: number };
    /**
     * Real code paths from frontmatter `elements:`, kept apart from `evidence` (the source-doc
     * slug);
     * see `deriveCodeLocations`.
     */
    codeLocations: string[];
    handoffText: string;
    /**
     * Null for a node named only by a relation, or the "document" button opens another concept's
     * write-up.
     */
    documentHref: string | null;
    /**
     * The popover omits it because its evidence group already names the link; only surfaces
     * without one use it.
     */
    mentionDocumentHref: string | null;
    meaningEditHref: string;
    /** Non-null only with real evidence. Human vs AI is carried by `kind`, never by hue. */
    lastEditSubject: { kind: LastEditSubjectKind; ageLabel: string } | null;
    mtimeConflict: boolean;
  } | null;
}

export function useNodeDatasheetModel({
  selectedOntologyNode,
  insight,
  handoffSource,
  authoredSignificance,
  docFreshnessIndex,
  docFileDateIndex = docFreshnessIndex,
  docDatesReading = false,
  editBaselineScopeKey,
  updatedAgoNowMs,
  formatUpdatedLabel,
  agentActivityStatus,
  agentFocusNodeId,
  selfEditTimestamps,
  formatEditAgeLabel,
}: UseNodeDatasheetModelArgs): NodeDatasheetDerivation {
  // One drawer-model build feeds focus and significance, so their counts cannot drift.
  const nodeFocusData = useMemo(() => {
    if (!selectedOntologyNode || !insight) return null;
    const model = buildTopologyOntologyDrawerModel(selectedOntologyNode, insight.nodes, insight.edges);
    return {
      focus: buildTopologyNodeFocus(selectedOntologyNode, model),
      significance: buildNodeSignificance(selectedOntologyNode, model, { authoredSignificance }),
    };
  }, [selectedOntologyNode, insight, authoredSignificance]);
  const nodeFocus = nodeFocusData?.focus ?? null;

  // Keyed by settled source scope, node id and source slug: the same graph id in the sample and a
  // local vault
  // is not the same document. A null scope captures nothing. The self-write time is snapshotted
  // with freshness,
  // so only a later write explains a later change.
  type EditBaseline = {
    scopeKey: string;
    nodeId: string;
    sourceSlug: string;
    freshnessIso: string;
    selfEditAtMs: number | null;
  };
  const currentNodeId = selectedOntologyNode?.id ?? null;
  const currentSourceSlug = nodeFocus?.sourceSlug ?? null;
  const currentFreshnessIso = currentSourceSlug ? docFileDateIndex.get(currentSourceSlug) ?? null : null;
  const baselineForCurrentNode: EditBaseline | null =
    editBaselineScopeKey === null ||
    currentNodeId === null ||
    currentSourceSlug === null ||
    currentFreshnessIso === null
      ? null
      : {
        scopeKey: editBaselineScopeKey,
        nodeId: currentNodeId,
        sourceSlug: currentSourceSlug,
        freshnessIso: currentFreshnessIso,
        selfEditAtMs: selfEditTimestamps.get(currentSourceSlug) ?? null,
      };
  const [editBaseline, setEditBaseline] = useState<EditBaseline | null>(() => baselineForCurrentNode);
  const baselineMatchesCurrentTarget = Boolean(
    baselineForCurrentNode &&
      editBaseline?.scopeKey === baselineForCurrentNode.scopeKey &&
      editBaseline.nodeId === baselineForCurrentNode.nodeId &&
      editBaseline.sourceSlug === baselineForCurrentNode.sourceSlug,
  );
  if (baselineForCurrentNode && !baselineMatchesCurrentTarget) {
    setEditBaseline(baselineForCurrentNode);
  }
  const activeBaseline =
    baselineForCurrentNode && baselineMatchesCurrentTarget
      ? editBaseline
      : baselineForCurrentNode;

  const v2DatasheetModel = useMemo(() => {
    if (!nodeFocus || !selectedOntologyNode || !insight) return null;
    // A vault-root slug for a document node; the written reference for a derived node without one.
    const agentTarget = resolveNodeAgentTarget(selectedOntologyNode);
    const slug = agentTarget.ref ?? nodeFocus.sourceSlug ?? selectedOntologyNode.id;
    // Groups from the full connection set, or a hub's total folds into overflow and the handoff
    // contradicts the counts.
    const connections = buildV2Connections(selectedOntologyNode.id, insight.nodes, insight.edges);
    const groups = buildV2ConnectionGroups(connections);
    const evidenceRows = buildV2EvidenceRows(selectedOntologyNode.evidenceIds);
    const codeLocations = deriveCodeLocations(selectedOntologyNode.id, insight.nodes, insight.edges);
    const metric = {
      contains: groups.contains.total,
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      // Includes the parent, or a node with only a parent hands off "0 connections".
      belongsTo: groups.belongsTo.total,
      evidence: evidenceRows.length,
    };
    const handoffText = formatV2HandoffText({
      source: handoffSource,
      slug,
      documented: agentTarget.documented,
      kind: nodeFocus.kind,
      domainTitle: nodeFocusData?.significance.ownerDomainTitle ?? null,
      contains: metric.contains,
      usedBy: metric.usedBy,
      dependsOn: metric.dependsOn,
      belongsTo: metric.belongsTo,
      evidence: metric.evidence,
      containsNames: groups.contains.rows.map((connection) => connection.title),
      usedByNames: groups.usedBy.rows.map((connection) => connection.title),
      dependsNames: groups.dependsOn.rows.map((connection) => connection.title),
      belongsToNames: groups.belongsTo.rows.map((connection) => connection.title),
    });
    const freshnessIso = nodeFocus.sourceSlug ? docFreshnessIndex.get(nodeFocus.sourceSlug) : undefined;
    const ago = freshnessIso ? computeUpdatedAgo(freshnessIso, updatedAgoNowMs) : null;

    // Only a heartbeat match or a self-write record count as evidence.
    const lastEditSubjectFact = resolveNodeLastEditSubject({
      nodeId: selectedOntologyNode.id,
      sourceSlug: nodeFocus.sourceSlug,
      agentActivityStatus,
      agentFocusNodeId,
      selfEditTimestamps,
    });
    const lastEditSubject = lastEditSubjectFact
      ? {
          kind: lastEditSubjectFact.kind,
          ageLabel: (() => {
            const age = computeEditAge(lastEditSubjectFact.atMs, updatedAgoNowMs);
            return formatEditAgeLabel(age.key, age.count);
          })(),
        }
      : null;

    const mtimeConflict = hasNodeMtimeConflict({
      sourceSlug: nodeFocus.sourceSlug,
      baselineFreshnessIso: activeBaseline?.freshnessIso ?? null,
      currentFreshnessIso,
      baselineSelfEditAtMs: activeBaseline?.selfEditAtMs ?? null,
      selfEditTimestamps,
    });

    return {
      slug,
      nodeId: selectedOntologyNode.id,
      title: nodeFocus.displayTitle,
      sourceTitle:
        selectedOntologyNode.title !== nodeFocus.displayTitle ? selectedOntologyNode.title : null,
      kind: nodeFocus.kind,
      domain: nodeFocusData?.significance.ownerDomainId
        ? {
            id: nodeFocusData.significance.ownerDomainId,
            title: nodeFocusData.significance.ownerDomainTitle ?? "",
          }
        : null,
      powered: freshnessIso ? isWithinRecentWindow(freshnessIso, updatedAgoNowMs) : false,
      updatedAtLabel: ago ? formatUpdatedLabel(ago.key, ago.count) : docDatesReading ? "" : null,
      metric,
      groups,
      evidence: { rows: evidenceRows, total: evidenceRows.length },
      codeLocations,
      handoffText,
      // `ownDocumentSlug`, not `sourceSlug`, which for a relation-named node is another concept's
      // document.
      // `via` lets the document's crumb return to this node on the map.
      documentHref: nodeFocus.ownDocumentSlug
        ? buildDocsVaultHref({
            slug: nodeFocus.ownDocumentSlug,
            via: buildTopologyReturnMarker(selectedOntologyNode.id),
          })
        : null,
      mentionDocumentHref: nodeFocus.mentionedInSlug
        ? buildDocsVaultHref({
            slug: nodeFocus.mentionedInSlug,
            via: buildTopologyReturnMarker(selectedOntologyNode.id),
          })
        : null,
      // The canonical `<kind>:<slug>` id, so every outgoing link shares one grammar.
      meaningEditHref: buildTopologyMeaningEditorNodeHref(selectedOntologyNode.id),
      lastEditSubject,
      mtimeConflict,
    };
  }, [
    nodeFocus,
    selectedOntologyNode,
    insight,
    handoffSource,
    nodeFocusData,
    docFreshnessIndex,
    currentFreshnessIso,
    docDatesReading,
    updatedAgoNowMs,
    formatUpdatedLabel,
    agentActivityStatus,
    agentFocusNodeId,
    selfEditTimestamps,
    formatEditAgeLabel,
    activeBaseline,
  ]);

  return { nodeFocus, significance: nodeFocusData?.significance ?? null, v2DatasheetModel };
}
