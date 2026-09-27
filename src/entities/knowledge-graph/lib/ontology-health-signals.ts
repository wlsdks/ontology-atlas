import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "../model";

export interface OntologyHealthSignalCandidate {
  slug: string;
  name: string;
  /** Incoming references, the queue's "N references" evidence; set only for promotion candidates. */
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
/** Fan-in at which a node is a promotion candidate; shared by significance and health signals. */
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
    // Short display title, shared by the map chip, DoNextTab and the repair queue.
    name: node.display ?? node.title,
  };
}

export interface OntologyHealthActionTarget {
  slug: string;
  title: string;
  // `island` and `containment` come from the CLI-parity health verdict and rank first, because the
  // CLI reports `needs_attention` on them.
  kind: "island" | "containment" | "stale" | "orphan" | "promotion";
}

/** One repair target: stale, then orphan, then promotion; shared by the map chip and insights queue. */
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
