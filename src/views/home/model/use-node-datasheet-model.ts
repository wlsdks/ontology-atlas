"use client";

import { useMemo, useState } from "react";
import {
  buildTopologyMeaningEditorNodeHref,
  deriveCodeLocations,
  resolveNodeAgentTarget,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import type { AgentActivityStatus } from "@/features/docs-vault-local";
import { computeEditAge } from "@/shared/lib/edit-age";
import type { LastEditSubjectKind } from "@/shared/lib/last-edit-subject";
import { isWithinRecentWindow } from "@/entities/knowledge-graph/lib/ontology-tree";
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
} from "@/widgets/topology-map-v2";

/**
 * Assembles the node datasheet (popover / panel) model.
 *
 * Four constraints, each with a regression behind it:
 * - `metric`'s contains/usedBy/dependsOn come from the SAME `groups` the panel
 *   draws its headers from. Two independent counts diverged on parallel edges
 *   (persona bug).
 * - Containment ("what it holds") is a typed count, kept apart from the
 *   direction-only "what it leans on".
 * - `powered` (freshness) has one source, the updatedAt (mtime) ramp. Never
 *   also derive it from the changedSlugs session baseline.
 * - `nodeId` is always the canvas graph id (in sync with path-mode route
 *   state); `slug` prefers the vault slug and is what document / editor deep
 *   links and handoff text use.
 */
export interface UseNodeDatasheetModelArgs {
  selectedOntologyNode: KnowledgeGraphNode | null;
  insight: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  /** Static samples are facts to inspect, never an MCP write target. */
  handoffSource: "loaded-vault" | "read-only-sample";
  /** frontmatter `significance` — overrides the derived value when present. */
  authoredSignificance: string | null;
  docFreshnessIndex: ReadonlyMap<string, string>;
  /** Settled identity of the vault/source supplying `docFreshnessIndex`.
   *  Null means the source is still restoring; no edit baseline is captured
   *  or compared until the identity is authoritative. */
  editBaselineScopeKey: string | null;
  /** Snapshot of "now" for the relative-time labels, so rendering stays pure. */
  updatedAgoNowMs: number;
  /** i18n — resolves `nodeDatasheet.updated_<key>`. */
  formatUpdatedLabel: (key: string, count: number) => string;
  /** The real-data source behind the "last edit" subject and conflict badges.
   *  Always defined via `emptyAgentActivityStatus()` — with no heartbeat the
   *  agent candidate is treated as having no evidence. */
  agentActivityStatus: AgentActivityStatus;
  /** Reuses the `resolveAgentFocusNodeId` result so the badge and this fact
   *  always name the same node — no second matching path is written. */
  agentFocusNodeId: string | null;
  /** `useLocalVault().selfEditTimestamps` — the slugs this session actually
   *  wrote. The only human evidence behind both "last edit · me" and the
   *  conflict badge. */
  selfEditTimestamps: ReadonlyMap<string, number>;
  /** i18n — resolves `editProvenance.age.<key>`. */
  formatEditAgeLabel: (key: string, count: number) => string;
}

export interface NodeDatasheetDerivation {
  nodeFocus: TopologyNodeFocusModel | null;
  significance: NodeSignificanceModel | null;
  v2DatasheetModel: {
    slug: string;
    nodeId: string;
    title: string;
    /**
     * The original title, carried only when the displayed one differs from it
     * (label humanisation, e.g. of a path). The datasheet preserves it as a
     * mono subline; identical titles give null and no subline.
     */
    sourceTitle: string | null;
    kind: string;
    domain: { id: string; title: string } | null;
    powered: boolean;
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
     * [Code locations] (Code locations) — the node's REAL code evidence (raw file paths from vault
     * frontmatter `elements: [...]`), distinct from `evidence` above
     * (which is the self-referential source-doc slug, `evidenceIds`). See
     * `deriveCodeLocations`'s doc comment for why the two must stay separate.
     */
    codeLocations: string[];
    handoffText: string;
    /**
     * Deep link to **this node's own** document. Null for a node that is only
     * named by a relation and has no `.md` of its own — this used to hold the
     * link of somebody else's document citing it, so the "document" button
     * opened the write-up of a different concept.
     */
    documentHref: string | null;
    /**
     * Deep link to the other document that mentions a node with no document of
     * its own. The popover does not surface it as an action because its
     * evidence group already shows the link by name; only surfaces without an
     * evidence list (context menu, full detail) use this.
     */
    mentionDocumentHref: string | null;
    meaningEditHref: string;
    /** Non-null only with real evidence (a heartbeat match or a self-write
     *  record). Human vs AI is carried by `kind` alone, never by hue. */
    lastEditSubject: { kind: LastEditSubjectKind; ageLabel: string } | null;
    /** True only on a real mtime mismatch. */
    mtimeConflict: boolean;
  } | null;
}

export function useNodeDatasheetModel({
  selectedOntologyNode,
  insight,
  handoffSource,
  authoredSignificance,
  docFreshnessIndex,
  editBaselineScopeKey,
  updatedAgoNowMs,
  formatUpdatedLabel,
  agentActivityStatus,
  agentFocusNodeId,
  selfEditTimestamps,
  formatEditAgeLabel,
}: UseNodeDatasheetModelArgs): NodeDatasheetDerivation {
  // One drawer-model build derives both focus (popover connections) and
  // significance (the plain-language so-what): no recomputation, and the two
  // counts cannot drift.
  const nodeFocusData = useMemo(() => {
    if (!selectedOntologyNode || !insight) return null;
    const model = buildTopologyOntologyDrawerModel(selectedOntologyNode, insight.nodes, insight.edges);
    return {
      focus: buildTopologyNodeFocus(selectedOntologyNode, model),
      significance: buildNodeSignificance(selectedOntologyNode, model, { authoredSignificance }),
    };
  }, [selectedOntologyNode, insight, authoredSignificance]);
  const nodeFocus = nodeFocusData?.focus ?? null;

  // Freshness baseline from the moment this node was opened. The identity is
  // the settled source scope + node id + source slug: the same graph id in a
  // bundled sample and a local vault is not the same editable document. A null
  // scope means restoration is still in flight, so it neither captures nor
  // replaces a trusted baseline. The self-write timestamp is snapshotted with
  // freshness; only a later record can explain a later freshness change.
  type EditBaseline = {
    scopeKey: string;
    nodeId: string;
    sourceSlug: string;
    freshnessIso: string;
    selfEditAtMs: number | null;
  };
  const currentNodeId = selectedOntologyNode?.id ?? null;
  const currentSourceSlug = nodeFocus?.sourceSlug ?? null;
  const currentFreshnessIso = currentSourceSlug ? docFreshnessIndex.get(currentSourceSlug) ?? null : null;
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
    // The name handed to an agent must be a name the vault knows: a
    // vault-root-relative slug for a document node, and the reference text the
    // vault wrote down for a derived node with no document.
    const agentTarget = resolveNodeAgentTarget(selectedOntologyNode);
    const slug = agentTarget.ref ?? nodeFocus.sourceSlug ?? selectedOntologyNode.id;
    // Group from the FULL connection set. Folding it into a 5-item preview
    // collapses a hub's dependsOn total into a generic overflow, and the
    // handoff names then contradict the counts.
    const connections = buildV2Connections(selectedOntologyNode.id, insight.nodes, insight.edges);
    const groups = buildV2ConnectionGroups(connections);
    const evidenceRows = buildV2EvidenceRows(selectedOntologyNode.evidenceIds);
    const codeLocations = deriveCodeLocations(selectedOntologyNode.id, insight.nodes, insight.edges);
    const metric = {
      contains: groups.contains.total,
      usedBy: groups.usedBy.total,
      dependsOn: groups.dependsOn.total,
      // All four buckets including the parent. While this one was missing, a
      // node with only a parent shipped a handoff saying "0 connections".
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

    // Only two kinds of real evidence are candidates: a heartbeat match and a
    // self-write record. With neither, lastEditSubject is null.
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
      currentFreshnessIso: freshnessIso ?? null,
      baselineSelfEditAtMs: activeBaseline?.selfEditAtMs ?? null,
      selfEditTimestamps,
    });

    return {
      slug,
      nodeId: selectedOntologyNode.id,
      // The compact popover header takes the short display title.
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
      updatedAtLabel: ago ? formatUpdatedLabel(ago.key, ago.count) : null,
      metric,
      groups,
      evidence: { rows: evidenceRows, total: evidenceRows.length },
      codeLocations,
      handoffText,
      // The document deep link uses the vault file path (`?slug=`), and node
      // id → document slug conversion happens in exactly one place: the focus
      // model's pure derivation. `ownDocumentSlug` rather than `sourceSlug`,
      // because for a node only named by a relation the sourceSlug is
      // *somebody else's* document citing it — using it makes the "document"
      // button open a different concept's write-up.
      documentHref: nodeFocus.ownDocumentSlug
        ? buildDocsVaultHref({ slug: nodeFocus.ownDocumentSlug })
        : null,
      mentionDocumentHref: nodeFocus.mentionedInSlug
        ? buildDocsVaultHref({ slug: nodeFocus.mentionedInSlug })
        : null,
      // The editor deep link passes the canonical `<kind>:<slug>` graph node
      // id unchanged, replacing the old inline `?node=<vault slug>` form so
      // every outgoing link shares one grammar.
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
