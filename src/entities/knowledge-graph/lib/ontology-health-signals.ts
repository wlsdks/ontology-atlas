import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "../model";

export interface OntologyHealthSignalCandidate {
  slug: string;
  name: string;
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
const DEFAULT_PROMOTION_MIN_FAN_IN = 4;
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
      .map(toSignalCandidate),
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
    name: node.title,
  };
}
