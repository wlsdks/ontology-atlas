import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildOntologyHealthSignals,
  isEvidenceOnlyConcept,
  resolveNodeAgentTarget,
  rankAllByDegree,
} from "@/entities/knowledge-graph";

/**
 * The "to do" tab — insights moving from listing inventory to "so what should I do?". It combines
 * only derivations already loaded by this page (health signals, `rankAllByDegree`,
 * `docFreshnessIndex`). A client reimplementation of `maintenance_plan`-grade precise ranking is
 * deliberately avoided: one source of truth is kept, and precise judgement is delegated to the
 * per-row agent handoff.
 */

type DoNextRowKind = "neglected-hub" | "orphan" | "promotion";

export interface DoNextRow {
  /** The row's unique id — `${kind}:${nodeId}`. */
  id: string;
  rowKind: DoNextRowKind;
  nodeId: string;
  title: string;
  nodeKind: string;
  /** Degree (neglected-hub · promotion). */
  degree?: number;
  /** Days since the last update (neglected-hub). */
  agoDays?: number;
  /**
   * Is this a name written only as evidence (no document of its own)? This row's first step differs
   * from the others — there is no document to fix yet, so it is "create the document first"
   * (`handoffPayload` already read that way while the screen did not say so).
   */
  evidenceOnly: boolean;
  /** The per-row agent handoff — a suggested order of MCP calls, for copying. */
  handoffPayload: string;
}

export interface DoNextQueue {
  rows: DoNextRow[];
  /** Every current signal id, independent of the display cap. The source of truth for deciding a review has ended. */
  activeRowIds: string[];
  counts: { neglectedHub: number; orphan: number; promotion: number };
}

export interface BuildDoNextQueueOptions {
  /** Locale-resolved handoff prose (from the insights messages, via `t.raw`). */
  prose: DoNextHandoffProse;
  /** The minimum degree to count as a hub. Defaults to 4. */
  hubMinDegree?: number;
  /** The minimum elapsed days to count as "neglected". Defaults to 30. */
  neglectMinDays?: number;
  /** The maximum rows per kind. Defaults to 5. */
  perKindLimit?: number;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The locale-resolved prose the handoff builders interleave between MCP calls.
 * These are user-facing clipboard strings, so they come from the messages files
 * (via `t.raw`, ICU-free — the MCP-call braces must survive verbatim) rather
 * than hardcoded Korean: an English-locale user used to copy Korean operating
 * instructions from every insights handoff (bug sweep 2026-09-01). `%ref%`,
 * `%kind%` and friends are plain tokens filled by `fillHandoffTemplate`.
 */
export interface DoNextHandoffProse {
  verificationGate: string;
  createDocFirst: string;
  doNextUpdate: string;
  doNextUpdateProof: string;
  doNextNewDocProof: string;
  orphanRelate: string;
  orphanFindNeighbors: string;
  orphanProof: string;
  promotionNewDoc: string;
  promotionDocumented: string;
  promotionProof: string;
}

export function fillHandoffTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/%([a-zA-Z]+)%/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole,
  );
}

/**
 * A per-row handoff does not end at "what to change" — it closes with a health re-query on the same
 * graph, matching the UI's "verify with an agent" label to the contract actually copied.
 */
export function withDoNextVerification(
  instruction: string,
  resultProof: string,
  verificationGate: string,
): string {
  return `${instruction} → ${resultProof} → ${verificationGate}`;
}

/**
 * A per-row handoff must **work when pasted**. So the name is written not as the screen's graph id
 * but as the name the vault knows (`resolveNodeAgentTarget`), and a concept with no document yet is
 * given **a call that creates the document first** rather than read or edit calls —
 * `patch_concept` / `get_concept` require an existing document, so giving those to a concept
 * without one turns a handoff into homework.
 */
function agentNameOf(node: KnowledgeGraphNode | undefined, fallbackId: string): {
  ref: string;
  documented: boolean;
} {
  const target = resolveNodeAgentTarget(node);
  return {
    ref: target.ref ?? fallbackId.split(":").pop() ?? fallbackId,
    documented: target.documented && target.ref !== null,
  };
}

function createDocFirst(prose: DoNextHandoffProse, ref: string, kind: string): string {
  return fillHandoffTemplate(prose.createDocFirst, { ref, kind });
}

function buildDoNextHandoff(prose: DoNextHandoffProse, node: KnowledgeGraphNode): string {
  const { ref, documented } = agentNameOf(node, node.id);
  if (!documented) {
    return withDoNextVerification(
      createDocFirst(prose, ref, node.kind),
      fillHandoffTemplate(prose.doNextNewDocProof, { ref }),
      prose.verificationGate,
    );
  }
  return withDoNextVerification(
    fillHandoffTemplate(prose.doNextUpdate, { ref }),
    fillHandoffTemplate(prose.doNextUpdateProof, { ref }),
    prose.verificationGate,
  );
}

function buildOrphanHandoff(
  prose: DoNextHandoffProse,
  node: KnowledgeGraphNode | undefined,
  fallbackId: string,
): string {
  const { ref, documented } = agentNameOf(node, fallbackId);
  if (!documented) {
    return withDoNextVerification(
      `${createDocFirst(prose, ref, node?.kind ?? "element")} → ${fillHandoffTemplate(prose.orphanRelate, { ref })}`,
      fillHandoffTemplate(prose.orphanProof, { ref }),
      prose.verificationGate,
    );
  }
  return withDoNextVerification(
    fillHandoffTemplate(prose.orphanFindNeighbors, { ref }),
    fillHandoffTemplate(prose.orphanProof, { ref }),
    prose.verificationGate,
  );
}

function buildPromotionHandoff(
  prose: DoNextHandoffProse,
  node: KnowledgeGraphNode | undefined,
  fallbackId: string,
): string {
  const { ref, documented } = agentNameOf(node, fallbackId);
  if (!documented) {
    return withDoNextVerification(
      `${createDocFirst(prose, ref, node?.kind ?? "element")} → ${prose.promotionNewDoc}`,
      fillHandoffTemplate(prose.promotionProof, { ref }),
      prose.verificationGate,
    );
  }
  return withDoNextVerification(
    fillHandoffTemplate(prose.promotionDocumented, { ref }),
    fillHandoffTemplate(prose.promotionProof, { ref }),
    prose.verificationGate,
  );
}

/** The document slug used to look up the update date — a manifest-relative value, so the prefix is left on. */
function nodeSlug(node: KnowledgeGraphNode): string | null {
  return node.evidenceIds[0] ?? null;
}

export function buildDoNextQueue(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  freshnessIndex: ReadonlyMap<string, string>,
  options: BuildDoNextQueueOptions,
): DoNextQueue {
  const prose = options.prose;
  const hubMinDegree = options.hubMinDegree ?? 4;
  const neglectMinDays = options.neglectMinDays ?? 30;
  const perKindLimit = options.perKindLimit ?? 5;
  const nowMs = (options.now ?? new Date()).getTime();

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // ① Neglected hubs — high degree × long since updated. Both are products of signals already on
  // the page, so the computation costs one ranking.
  const neglectedHubs: DoNextRow[] = [];
  for (const { node, degree } of rankAllByDegree(nodes, edges)) {
    if (degree < hubMinDegree) break; // descending — stop below the threshold
    // For a node with no document, `evidenceIds[0]` is *someone else's document that cited it*, so
    // reading that date as this node's update date blames this concept for another's neglect.
    if (resolveNodeAgentTarget(node).documented === false) continue;
    const slug = nodeSlug(node);
    const iso = slug ? freshnessIndex.get(slug) : undefined;
    if (!iso) continue; // with no known update time, "neglected" is not asserted
    const agoDays = Math.floor((nowMs - Date.parse(iso)) / DAY_MS);
    if (!Number.isFinite(agoDays) || agoDays < neglectMinDays) continue;
    neglectedHubs.push({
      id: `neglected-hub:${node.id}`,
      rowKind: "neglected-hub",
      nodeId: node.id,
    // Queue rows use the short display title too.
      title: node.display ?? node.title,
      nodeKind: node.kind,
      degree,
      agoDays,
      evidenceOnly: isEvidenceOnlyConcept(node),
      handoffPayload: buildDoNextHandoff(prose, node),
    });
  }
  neglectedHubs.sort((a, b) => (b.degree ?? 0) * (b.agoDays ?? 0) - (a.degree ?? 0) * (a.agoDays ?? 0));

  // ②③ Orphans and promotion candidates — reusing the same entities function as the map's health
  // chip (one source of truth, so the map chip and this queue cannot diverge).
  const signals = buildOntologyHealthSignals(nodes, edges, { now: options.now });

  const orphans: DoNextRow[] = signals.orphan.map(({ slug, name }) => ({
    id: `orphan:${slug}`,
    rowKind: "orphan",
    nodeId: slug,
    title: name,
    nodeKind: nodeById.get(slug)?.kind ?? "unknown",
    evidenceOnly: isEvidenceOnlyConcept(nodeById.get(slug)),
    handoffPayload: buildOrphanHandoff(prose, nodeById.get(slug), slug),
  }));

  const promotions: DoNextRow[] = signals.promotion.map(({ slug, name, fanIn }) => ({
    id: `promotion:${slug}`,
    rowKind: "promotion",
    nodeId: slug,
    title: name,
    nodeKind: nodeById.get(slug)?.kind ?? "unknown",
    // The evidence for "why was this picked" — the incoming reference count, exposed verbatim as the row metric ("N references").
    degree: fanIn,
    evidenceOnly: isEvidenceOnlyConcept(nodeById.get(slug)),
    handoffPayload: buildPromotionHandoff(prose, nodeById.get(slug), slug),
  }));

  const rows = [
    ...neglectedHubs.slice(0, perKindLimit),
    ...orphans.slice(0, perKindLimit),
    ...promotions.slice(0, perKindLimit),
  ];

  return {
    rows,
    activeRowIds: [...neglectedHubs, ...orphans, ...promotions].map(
      (row) => row.id,
    ),
    counts: {
      neglectedHub: neglectedHubs.length,
      orphan: orphans.length,
      promotion: promotions.length,
    },
  };
}
