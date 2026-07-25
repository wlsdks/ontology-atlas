import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "../model";

export interface OntologyHealthSignalCandidate {
  slug: string;
  name: string;
  /**
   * 들어오는 참조 수(fan-in). promotion 후보에만 채워진다 — "왜 상위 개념
   * 후보인가"의 근거 수치라 표면(할 일 큐)이 "참조 N개"로 그대로 보여준다.
   * stale/orphan 후보는 undefined.
   */
  fanIn?: number;
}

export interface OntologyHealthSignals {
  stale: OntologyHealthSignalCandidate[];
  orphan: OntologyHealthSignalCandidate[];
  promotion: OntologyHealthSignalCandidate[];
}

export interface OntologyHealthSignalOptions {
  now?: Date;
  staleDaysThreshold?: number;
  promotionMinFanIn?: number;
}

const DEFAULT_STALE_DAYS_THRESHOLD = 30;
/**
 * Incoming fan-in at or above which a node is treated as load-bearing — enough
 * other concepts depend on it that it's a promotion / "core" candidate. Shared
 * single source so significance ("핵심 축") and health-signal promotion agree.
 */
export const PROMOTION_MIN_FAN_IN = 4;
const DEFAULT_PROMOTION_MIN_FAN_IN = PROMOTION_MIN_FAN_IN;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const IGNORED_HEALTH_KINDS = new Set(["vault-readme", "document"]);

export function buildOntologyHealthSignals(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options: OntologyHealthSignalOptions = {},
): OntologyHealthSignals {
  const nowMs = (options.now ?? new Date()).getTime();
  const staleDaysThreshold =
    options.staleDaysThreshold ?? DEFAULT_STALE_DAYS_THRESHOLD;
  const promotionMinFanIn =
    options.promotionMinFanIn ?? DEFAULT_PROMOTION_MIN_FAN_IN;
  const degreeByNode = buildDegreeByNode(edges);

  const candidates = nodes.filter((node) => isHealthCandidateNode(node));

  return {
    stale: candidates
      .filter((node) => isStaleNode(node, nowMs, staleDaysThreshold))
      .map(toSignalCandidate),
    orphan: candidates
      .filter((node) => (degreeByNode.get(node.id)?.total ?? 0) === 0)
      .map(toSignalCandidate),
    promotion: candidates
      .filter((node) => (degreeByNode.get(node.id)?.incoming ?? 0) >= promotionMinFanIn)
      .map((node) => ({
        ...toSignalCandidate(node),
        fanIn: degreeByNode.get(node.id)?.incoming ?? 0,
      })),
  };
}

function buildDegreeByNode(edges: readonly KnowledgeGraphEdge[]) {
  const result = new Map<string, { incoming: number; outgoing: number; total: number }>();
  const ensure = (id: string) => {
    const existing = result.get(id);
    if (existing) return existing;
    const next = { incoming: 0, outgoing: 0, total: 0 };
    result.set(id, next);
    return next;
  };

  for (const edge of edges) {
    const source = ensure(edge.from);
    source.outgoing += 1;
    source.total += 1;

    const target = ensure(edge.to);
    target.incoming += 1;
    target.total += 1;
  }

  return result;
}

function isHealthCandidateNode(node: KnowledgeGraphNode) {
  if (IGNORED_HEALTH_KINDS.has(node.kind)) return false;
  return node.kind !== "project";
}

function isStaleNode(
  node: KnowledgeGraphNode,
  nowMs: number,
  staleDaysThreshold: number,
) {
  const approvedAtMs = node.lastApprovedAt.getTime();
  if (!Number.isFinite(approvedAtMs) || approvedAtMs <= 0) return false;
  return nowMs - approvedAtMs >= staleDaysThreshold * MS_PER_DAY;
}

function toSignalCandidate(node: KnowledgeGraphNode): OntologyHealthSignalCandidate {
  return {
    slug: node.id,
    // 과제 ⑩ — 표시용 짧은 제목. 이 candidate 는 map health 칩 · DoNextTab ·
    // 수리 큐 action target 등 여러 표면이 공유하는 단일 진실원이라, 한 번
    // 고쳐두면 그 표면들이 전부 함께 짧아진다.
    name: node.display ?? node.title,
  };
}

export interface OntologyHealthActionTarget {
  slug: string;
  title: string;
  // C1 — `island` / `containment` come from the CLI-parity vault-health verdict
  // (disconnected actionable islands · missing domain containment). They rank
  // ABOVE the statistical stale/orphan/promotion signals because the CLI
  // (`ontology-atlas health`) flips to `needs_attention` on them, so surfacing
  // them keeps the app's "수리할 것 없음" honest.
  kind: "island" | "containment" | "stale" | "orphan" | "promotion";
}

/**
 * Picks ONE actionable repair target from the three health-signal buckets —
 * stale first (evidence is aging), then orphan (no owner yet), then
 * promotion (statistical suggestion, lowest urgency). Moved here from
 * `views/home/lib/topology-analysis.ts` (still re-exported there under its
 * old name for the topology map's health chip) so `/ontology/insights`'
 * 할 일 탭 "수리 큐" section can reuse the SAME picking rule without a
 * cross-view import — both surfaces read this
 * one entities-level function, so the two "next repair" targets can never
 * drift.
 */
export function buildOntologyHealthActionTarget({
  stale,
  orphan,
  promotion,
}: {
  stale: readonly OntologyHealthSignalCandidate[];
  orphan: readonly OntologyHealthSignalCandidate[];
  promotion: readonly OntologyHealthSignalCandidate[];
}): OntologyHealthActionTarget | null {
  const firstStale = stale[0];
  if (firstStale) {
    return { slug: firstStale.slug, title: firstStale.name, kind: "stale" };
  }

  const firstOrphan = orphan[0];
  if (firstOrphan) {
    return { slug: firstOrphan.slug, title: firstOrphan.name, kind: "orphan" };
  }

  const firstPromotion = promotion[0];
  if (firstPromotion) {
    return { slug: firstPromotion.slug, title: firstPromotion.name, kind: "promotion" };
  }

  return null;
}
