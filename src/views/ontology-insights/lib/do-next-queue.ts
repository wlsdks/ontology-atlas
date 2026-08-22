import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildOntologyHealthSignals,
  isEvidenceOnlyConcept,
  resolveNodeAgentTarget,
} from "@/entities/knowledge-graph";
import { rankAllByDegree } from "@/shared/lib/ontology-tree";

/**
 * The "to do" tab — insights moving from listing inventory to "so what should I do?". It combines
 * only derivations already loaded by this page (health signals, `rankAllByDegree`,
 * `docFreshnessIndex`). A client reimplementation of `maintenance_plan`-grade precise ranking is
 * deliberately avoided: one source of truth is kept, and precise judgement is delegated to the
 * per-row agent handoff.
 */

export type DoNextRowKind = "neglected-hub" | "orphan" | "promotion";

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
  /** The minimum degree to count as a hub. Defaults to 4. */
  hubMinDegree?: number;
  /** The minimum elapsed days to count as "neglected". Defaults to 30. */
  neglectMinDays?: number;
  /** The maximum rows per kind. Defaults to 5. */
  perKindLimit?: number;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DO_NEXT_VERIFICATION_GATE =
  'query_ontology({operation:"health"}) 로 변경 결과 재확인';

/**
 * A per-row handoff does not end at "what to change" — it closes with a health re-query on the same
 * graph, matching the UI's "verify with an agent" label to the contract actually copied.
 */
export function withDoNextVerification(
  instruction: string,
  resultProof: string,
): string {
  return `${instruction} → ${resultProof} → ${DO_NEXT_VERIFICATION_GATE}`;
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

/** The shared first step attached to a concept with no document — create it. */
function createDocFirst(ref: string, kind: string): string {
  return `이 개념은 아직 볼트에 "${ref}" 라는 참조로만 적혀 있어요(문서 없음) → add_concept({slug:"${ref}", kind:"${kind}"}) 로 문서부터 만들기`;
}

function buildDoNextHandoff(node: KnowledgeGraphNode): string {
  const { ref, documented } = agentNameOf(node, node.id);
  if (!documented) {
    return withDoNextVerification(
      createDocFirst(ref, node.kind),
      `get_concept({slug:"${ref}"}) 로 새 문서 확인`,
    );
  }
  return withDoNextVerification(
    `query_ontology({operation:"blast_radius", slug:"${ref}"}) 로 영향권 확인 → 문서 내용 검토 후 patch_concept({slug:"${ref}", …}) 로 갱신`,
    `get_concept({slug:"${ref}"}) 로 갱신된 원문 확인`,
  );
}

function buildOrphanHandoff(node: KnowledgeGraphNode | undefined, fallbackId: string): string {
  const { ref, documented } = agentNameOf(node, fallbackId);
  if (!documented) {
    return withDoNextVerification(
      `${createDocFirst(ref, node?.kind ?? "element")} → add_relation({from:"${ref}", to:"<대상>", type:"relates", why:"<근거 한 줄>"})`,
      `find_neighbors({slug:"${ref}"}) 로 새 관계 확인`,
    );
  }
  return withDoNextVerification(
    `find_neighbors({slug:"${ref}"}) 로 이웃 후보 확인 → relation_check 사전 점검 → add_relation({from:"${ref}", to:"<대상>", type:"relates", why:"<근거 한 줄>"})`,
    `find_neighbors({slug:"${ref}"}) 로 새 관계 확인`,
  );
}

function buildPromotionHandoff(node: KnowledgeGraphNode | undefined, fallbackId: string): string {
  const { ref, documented } = agentNameOf(node, fallbackId);
  if (!documented) {
    return withDoNextVerification(
      `${createDocFirst(ref, node?.kind ?? "element")} → 승격이 맞으면 그 문서의 kind 를 상향`,
      `query_ontology({operation:"node_profile", slug:"${ref}"}) 로 kind와 fan-in 재확인`,
    );
  }
  return withDoNextVerification(
    `query_ontology({operation:"node_profile", slug:"${ref}"}) 로 fan-in 확인 → 승격이 맞으면 patch_concept 로 kind 상향 또는 add_concept 로 상위 개념 신설`,
    `query_ontology({operation:"node_profile", slug:"${ref}"}) 로 kind와 fan-in 재확인`,
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
  options: BuildDoNextQueueOptions = {},
): DoNextQueue {
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
      handoffPayload: buildDoNextHandoff(node),
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
    handoffPayload: buildOrphanHandoff(nodeById.get(slug), slug),
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
    handoffPayload: buildPromotionHandoff(nodeById.get(slug), slug),
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
