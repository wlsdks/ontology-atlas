"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildTopologyMeaningEditorNodeHref,
  buildTopologyReturnMarker,
  deriveCodeLocations,
  resolveNodeAgentTarget,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  isWithinRecentWindow,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref, reviewCurrentness } from "@/entities/docs-vault";
import type { AgentActivityStatus } from "@/entities/vault-session";
import { computeEditAge } from "@/shared/lib/edit-provenance/edit-age";
import type { LastEditSubjectKind } from "@/shared/lib/edit-provenance/last-edit-subject";
import { computeUpdatedAgo } from "../../lib/inspector/format-updated-ago";
import { hasNodeMtimeConflict, resolveNodeLastEditSubject } from "../../lib/inspector/resolve-node-edit-subject";
import { buildTopologyOntologyDrawerModel } from "../../lib/inspector/topology-ontology-drawer";
import { buildTopologyNodeFocus, type TopologyNodeFocusModel } from "../../lib/inspector/topology-node-focus";
import { buildNodeSignificance, type NodeSignificanceModel } from "../../lib/inspector/topology-node-significance";
import {
  buildV2ConnectionGroups,
  buildV2Connections,
  buildV2EvidenceRows,
  formatV2HandoffText,
  readConceptReach,
  readDomainUsage,
  type ConceptReach,
  type ConceptReview,
  type DomainUsage,
} from "@/widgets/ontology-map";
import type { OntologyMapGraph } from "../../lib/map-canvas/map-adapter";

/**
 * Assembles the node datasheet model. `metric` counts come from the same `groups` the panel draws,
 * or parallel edges make them diverge. Containment is counted apart from "what it leans on".
 * Freshness has one source (`docFreshnessIndex`), never the session baseline. `nodeId` is the
 * canvas id; `slug` prefers the vault slug for deep links and handoff text.
 */
export interface UseNodeDatasheetModelArgs {
  selectedOntologyNode: KnowledgeGraphNode | null;
  insight: { nodes: readonly KnowledgeGraphNode[]; edges: readonly KnowledgeGraphEdge[] } | null;
  mapGraph: OntologyMapGraph;
  /** Static samples are facts to inspect, never an MCP write target. */
  handoffSource: "loaded-vault" | "read-only-sample";
  /** Overrides the derived value when present. */
  authoredSignificance: string | null;
  docFreshnessIndex: ReadonlyMap<string, string>;
  /**
   * File dates for the conflict badge alone: a commit moves `docFreshnessIndex` without writing the
   * file. Defaults to `docFreshnessIndex`.
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
    kind: string;
    /** The concept directly above it: a capability's domain, an element's capability; else null. */
    owner: { id: string; title: string } | null;
    /** The definition sentence as written; null when the concept has none. */
    definition: string | null;
    powered: boolean;
    /** `""` while Git is still dating documents; null with no date. */
    updatedAtLabel: string | null;
    metric: {
      contains: number;
      usedBy: number;
      dependsOn: number;
      belongsTo: number;
      related: number;
      evidence: number;
    };
    groups: ReturnType<typeof buildV2ConnectionGroups>;
    domainUsage: DomainUsage | null;
    /** The reach the map's count line counts, read from the map's own graph. */
    reach: ConceptReach | null;
    evidence: { rows: ReturnType<typeof buildV2EvidenceRows>; total: number };
    /**
     * Real code paths from frontmatter `elements:`, kept apart from `evidence` (the source-doc
     * slug); see `deriveCodeLocations`.
     */
    codeLocations: string[];
    handoffText: string;
    /**
     * Null for a node named only by a relation, or the "document" button opens another concept's
     * write-up.
     */
    documentHref: string | null;
    /**
     * The popover omits it because its evidence group already names the link; only surfaces without
     * one use it.
     */
    mentionDocumentHref: string | null;
    meaningEditHref: string;
    /** Full detail's last-edit fact; non-null only with real evidence. */
    lastEditSubject: { kind: LastEditSubjectKind; ageLabel: string } | null;
    mtimeConflict: boolean;
  } | null;
}

export function useNodeDatasheetModel({
  selectedOntologyNode,
  insight,
  mapGraph,
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
  // local vault is not the same document. A null scope captures nothing. The self-write time is
  // snapshotted with freshness, so only a later write explains a later change.
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

  const domainUsage = useMemo(
    () =>
      selectedOntologyNode?.kind === "domain"
        ? readDomainUsage(mapGraph.nodes, mapGraph.edges, selectedOntologyNode.id)
        : null,
    [mapGraph, selectedOntologyNode],
  );

  const reach = useMemo(
    () => (selectedOntologyNode ? readConceptReach(mapGraph.nodes, mapGraph.edges, selectedOntologyNode.id) : null),
    [mapGraph, selectedOntologyNode],
  );

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
      related: groups.related.total,
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
      related: metric.related,
      evidence: metric.evidence,
      containsNames: groups.contains.rows.map((connection) => connection.title),
      usedByNames: groups.usedBy.rows.map((connection) => connection.title),
      dependsNames: groups.dependsOn.rows.map((connection) => connection.title),
      belongsToNames: groups.belongsTo.rows.map((connection) => connection.title),
      relatedNames: groups.related.rows.map((connection) => connection.title),
      domainUsage,
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
      kind: nodeFocus.kind,
      owner: readOwner(nodeFocus.kind, nodeFocusData?.significance ?? null, groups),
      definition: selectedOntologyNode.summary?.trim() || null,
      powered: freshnessIso ? isWithinRecentWindow(freshnessIso, updatedAgoNowMs) : false,
      updatedAtLabel: ago ? formatUpdatedLabel(ago.key, ago.count) : docDatesReading ? "" : null,
      metric,
      groups,
      domainUsage,
      reach,
      evidence: { rows: evidenceRows, total: evidenceRows.length },
      codeLocations,
      handoffText,
      // `ownDocumentSlug`, not `sourceSlug`, which for a relation-named node is another concept's
      // document.
      // `via` lets the document's crumb return to this node on the map.
      documentHref: nodeFocus.ownDocumentSlug
        ? buildDocsVaultHref({
            slug: nodeFocus.ownDocumentSlug,
            collection: 'ontology',
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
    domainUsage,
    reach,
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

function readOwner(
  kind: string,
  significance: NodeSignificanceModel | null,
  groups: ReturnType<typeof buildV2ConnectionGroups>,
): { id: string; title: string } | null {
  if (kind === "capability") {
    return significance?.ownerDomainId
      ? { id: significance.ownerDomainId, title: significance.ownerDomainTitle ?? "" }
      : null;
  }
  if (kind !== "element") return null;
  const capability = (groups.belongsTo.allRows ?? groups.belongsTo.rows).find((row) => row.kind === "capability");
  return capability ? { id: capability.id, title: capability.title } : null;
}

export const NO_CONCEPT_REVIEW: ConceptReview = {
  raised: null,
  changedSinceReview: false,
  unverifiable: false,
  reviewedOn: null,
};

export interface ConceptReviewTarget {
  slug: string;
  frontmatter: Record<string, unknown>;
  mtime?: number | string;
}

/** Null when nothing can read the file (the bundled sample), which is not an unreadable file. */
export type ReadConceptBody = ((slug: string) => Promise<string | null>) | null;

type ConfirmedCheck = "current" | "changed-since-review" | "unreadable" | "unknown";

function readRaised(frontmatter: Record<string, unknown>): ConceptReview["raised"] {
  if (frontmatter.review_state !== "human_decides") return null;
  const note = frontmatter.review_note;
  return { note: typeof note === "string" && note.trim() ? note : null };
}

function readReviewedOn(frontmatter: Record<string, unknown>): string | null {
  const value = frontmatter.reviewed_at;
  const raw = value instanceof Date ? value.toISOString() : typeof value === "string" ? value : "";
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

export async function checkConfirmedReview(
  frontmatter: Record<string, unknown>,
  body: string | null,
): Promise<ConfirmedCheck> {
  // An empty body still tells a malformed binding apart, which is neither current nor changed.
  if (body === null) return (await reviewCurrentness(frontmatter, "")) === "unknown" ? "unknown" : "unreadable";
  const currentness = await reviewCurrentness(frontmatter, body);
  return currentness === "not-confirmed" ? "unknown" : currentness;
}

export function composeConceptReview(
  frontmatter: Record<string, unknown> | null,
  check: ConfirmedCheck | null,
): ConceptReview {
  if (!frontmatter) return NO_CONCEPT_REVIEW;
  const raised = readRaised(frontmatter);
  if (raised) return { ...NO_CONCEPT_REVIEW, raised };
  return {
    raised: null,
    changedSinceReview: check === "changed-since-review",
    unverifiable: check === "unreadable",
    reviewedOn: check === "current" ? readReviewedOn(frontmatter) : null,
  };
}

/**
 * The selected concept's review mark. A raised question is read at once from frontmatter; a
 * confirmation needs the file's body hashed, so whether it still holds arrives after one read.
 */
export function useConceptReview(target: ConceptReviewTarget | null, readBody: ReadConceptBody): ConceptReview {
  const confirmed = target?.frontmatter.review_state === "confirmed" && readBody !== null;
  const key = target && confirmed
    ? [target.slug, target.mtime ?? "", String(target.frontmatter.reviewed_digest ?? "")].join("\u0000")
    : null;
  const [checked, setChecked] = useState<{ key: string; check: ConfirmedCheck } | null>(null);
  useEffect(() => {
    if (key === null || !target || !readBody) return;
    let cancelled = false;
    void readBody(target.slug)
      .catch(() => null)
      .then((body) => checkConfirmedReview(target.frontmatter, body))
      .then((check) => {
        if (!cancelled) setChecked({ key, check });
      });
    return () => {
      cancelled = true;
    };
  }, [key, target, readBody]);
  const check = checked && checked.key === key ? checked.check : null;
  return useMemo(() => composeConceptReview(target?.frontmatter ?? null, check), [target, check]);
}
