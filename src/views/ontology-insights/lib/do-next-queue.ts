import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildOntologyHealthSignals,
  isEvidenceOnlyConcept,
  resolveNodeAgentTarget,
  rankAllByDegree,
} from "@/entities/knowledge-graph";

/**
 * The to-do queue, combined only from derivations this page already loads (health signals, degree ranking and
 * the `docFreshnessIndex`); precise ranking stays with the agent's `maintenance_plan` through the per-row handoff.
 * The degree ranking sorts once (O(N log N)) and references are indexed in one pass over the edges.
 */

type DoNextRowKind = "neglected-hub" | "orphan" | "promotion";

export interface DoNextRow {
  /** Unique row id, `${kind}:${nodeId}`. */
  id: string;
  rowKind: DoNextRowKind;
  nodeId: string;
  title: string;
  nodeKind: string;
  /** Degree (neglected-hub · promotion). */
  degree?: number;
  /** Days since the last update (neglected-hub). */
  agoDays?: number;
  /** A name written only as evidence (no document of its own); its first step is creating the document. */
  evidenceOnly: boolean;
  /**
   * The concepts pointing at this one, by name, for a promotion row, so the claim can be judged; the
   * count `degree` stays the true total and this names the first few.
   */
  referencedBy?: string[];
  /** The per-row agent handoff: a suggested order of MCP calls, for copying. */
  handoffPayload: string;
}

export interface DoNextQueue {
  rows: DoNextRow[];
  /** Every current signal id regardless of the display cap; decides when a review has ended. */
  activeRowIds: string[];
  counts: { neglectedHub: number; orphan: number; promotion: number };
}

export interface BuildDoNextQueueOptions {
  /** Handoff prose from the insights messages (via `t.raw`). */
  prose: DoNextHandoffProse;
  /** The minimum degree to count as a hub. Defaults to 4. */
  hubMinDegree?: number;
  /** The minimum elapsed days to count as "neglected". Defaults to 30. */
  neglectMinDays?: number;
  /** The maximum rows per kind. Defaults to 5. */
  perKindLimit?: number;
  now?: Date;
}

/** Referencing names a row prints before the count carries the rest. */
const REFERENCED_BY_NAMES = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * User-facing clipboard strings from the messages files via `t.raw`, which leaves the MCP-call braces verbatim.
 * Tokens such as `%ref%` and `%kind%` are filled by `fillHandoffTemplate`.
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

/** Closes each handoff with a health re-query on the same graph, matching the "verify with an agent" label. */
export function withDoNextVerification(
  instruction: string,
  resultProof: string,
  verificationGate: string,
): string {
  return `${instruction} → ${resultProof} → ${verificationGate}`;
}

/**
 * A handoff must work when pasted: it names the concept as the vault knows it (`resolveNodeAgentTarget`), and a
 * concept without a document gets a create call first, since `patch_concept` and `get_concept` need a document.
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

/** The manifest-relative slug used to look up the update date, prefix kept. */
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

  // Neglected hubs: high degree and long since updated, both from signals already on the page.
  const neglectedHubs: DoNextRow[] = [];
  for (const { node, degree } of rankAllByDegree(nodes, edges)) {
    if (degree < hubMinDegree) break; // descending, so stop below the threshold
    // A node without a document carries another document's date in `evidenceIds[0]`; its neglect is not asserted.
    if (resolveNodeAgentTarget(node).documented === false) continue;
    const slug = nodeSlug(node);
    const iso = slug ? freshnessIndex.get(slug) : undefined;
    if (!iso) continue; // Without a known update time, "neglected" is not asserted.
    const agoDays = Math.floor((nowMs - Date.parse(iso)) / DAY_MS);
    if (!Number.isFinite(agoDays) || agoDays < neglectMinDays) continue;
    neglectedHubs.push({
      id: `neglected-hub:${node.id}`,
      rowKind: "neglected-hub",
      nodeId: node.id,
      title: node.display ?? node.title,
      nodeKind: node.kind,
      degree,
      agoDays,
      evidenceOnly: isEvidenceOnlyConcept(node),
      handoffPayload: buildDoNextHandoff(prose, node),
    });
  }
  neglectedHubs.sort((a, b) => (b.degree ?? 0) * (b.agoDays ?? 0) - (a.degree ?? 0) * (a.agoDays ?? 0));

  // Orphans and promotion candidates reuse the map health chip's function, so chip and queue cannot diverge.
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

  // Who points at whom, built once in one pass over the edges.
  const referencedBy = new Map<string, string[]>();
  for (const edge of edges) {
    const source = nodeById.get(edge.from);
    if (!source) continue;
    const names = referencedBy.get(edge.to);
    const name = source.display ?? source.title;
    if (!names) referencedBy.set(edge.to, [name]);
    else if (names.length < REFERENCED_BY_NAMES && !names.includes(name)) names.push(name);
  }

  const promotions: DoNextRow[] = signals.promotion.map(({ slug, name, fanIn }) => ({
    id: `promotion:${slug}`,
    rowKind: "promotion",
    nodeId: slug,
    title: name,
    nodeKind: nodeById.get(slug)?.kind ?? "unknown",
    // The incoming reference count, shown verbatim as the row metric.
    degree: fanIn,
    referencedBy: referencedBy.get(slug) ?? [],
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
