import {
  resolveNodeAgentTarget,
  resolveNodeDocument,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  buildContainmentParents,
  nearestDomainId,
} from "@/entities/knowledge-graph";

/**
 * Similar-name pairs for the "are these the same thing?" card. The scoring functions mirror the MCP engine's
 * helpers (`textTokens`, `setJaccard`, `similarityScore` in `mcp/src/ontology-engine/engine-helpers.mjs`), so the
 * screen and `similar_nodes` name the same pairs; `tests/contract/duplicate-pairs.contract.test.ts` catches divergence.
 * Weights match the engine (slug 0.35, title 0.35, kind 0.1, domain 0.1, neighbours 0.1), capping a name-only match at 0.7.
 */

/** Mirror of the engine's `textTokens`: lowercase ASCII letter and digit runs of 2+ characters, so Hangul yields no token. */
export function similarityTokens(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/** Mirror of the engine's `setJaccard`: intersection over union, 0 if either side is empty. */
export function tokenSetJaccard(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  // size(L) + size(R) - size(intersection) avoids allocating a union Set in the pair loop.
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Mirror of the engine's `roundScore`, so the two engines do not diverge on a floating-point tail. */
function roundScore(value: number): number {
  return Number(value.toFixed(6));
}

/** One node as it enters the similarity computation, with the engine's node-summary fields. */
export interface SimilarityCandidate {
  slug: string;
  title: string;
  kind: string | null;
  /** The parent domain's id; a domain node has none, as in the engine. */
  domain: string | null;
  neighbors: ReadonlySet<string>;
}

export interface SimilaritySignals {
  slug: number;
  title: number;
  kind: number;
  domain: number;
  neighbors: number;
  total: number;
}

/** Mirror of the engine's `similarityScore`. */
export function scoreNodeSimilarity(
  left: SimilarityCandidate,
  right: SimilarityCandidate,
): SimilaritySignals {
  const slug =
    tokenSetJaccard(new Set(similarityTokens(left.slug)), new Set(similarityTokens(right.slug))) *
    0.35;
  const title =
    tokenSetJaccard(new Set(similarityTokens(left.title)), new Set(similarityTokens(right.title))) *
    0.35;
  const kind = left.kind && right.kind && left.kind === right.kind ? 0.1 : 0;
  const domain = left.domain && right.domain && left.domain === right.domain ? 0.1 : 0;
  const neighbors = tokenSetJaccard(left.neighbors, right.neighbors) * 0.1;
  return {
    slug: roundScore(slug),
    title: roundScore(title),
    kind: roundScore(kind),
    domain: roundScore(domain),
    neighbors: roundScore(neighbors),
    total: roundScore(slug + title + kind + domain + neighbors),
  };
}

/** One suspected pair: `keep` is the better-connected side, `dissolve` the side to fold. */
export interface DuplicatePairRow {
  id: string;
  keepId: string;
  keepSlug: string;
  keepTitle: string;
  dissolveId: string;
  dissolveSlug: string;
  dissolveTitle: string;
  /** The kind if both nodes share one, otherwise null. */
  kind: string | null;
  /** Similarity 0 to 1, the same number as MCP `similar_nodes`'s score. */
  score: number;
  /** Evidence for a person: the words both names share. */
  sharedTokens: string[];
}

export interface DuplicatePairs {
  rows: DuplicatePairRow[];
  /** The remaining pairs, drawn by the "show more" disclosure so every counted pair is reachable. */
  restRows: DuplicatePairRow[];
  /** Total pairs above the threshold: the M in "top N / M total". */
  suspectCount: number;
}

/**
 * Minimum score for a suspected duplicate. Measured on the dogfood vault (96 concepts): below 0.6 pairs mostly
 * share only a name prefix.
 */
const DUPLICATE_SUSPECT_MIN_SCORE = 0.6;

/** A pair sharing no name word scores at most 0.3, so a word inverted index narrows candidates without changing results. */
const MAX_SCORE_WITHOUT_SHARED_TOKEN = 0.3;

/** Folder names are dropped from the evidence words only; they stay in the score (the engine mirror). */
function slugFolders(slug: string): string[] {
  const segments = slug.split("/");
  return segments.slice(0, -1).flatMap((segment) => similarityTokens(segment));
}

export type GraphSimilarityCandidate = SimilarityCandidate & { node: KnowledgeGraphNode };

/**
 * The vault-root-relative slug an agent is pointed at, so a copied `merge_concepts` or `get_concept` call runs
 * as pasted; the score uses it too, matching how `similar_nodes` tokenizes.
 */
function slugOf(node: KnowledgeGraphNode): string {
  return resolveNodeAgentTarget(node).ref ?? node.id;
}

/**
 * Only nodes with their own document are candidates: a derived node's evidence slug is the document that named it,
 * so a merge would point at the wrong file. `resolveNodeDocument` is the single verdict.
 */
function hasOwnDocument(node: KnowledgeGraphNode): boolean {
  return resolveNodeDocument(node).ownSlug !== null;
}

/**
 * Converts graph nodes into the engine's similarity input, in one place for the screen and the contract test. Nodes
 * without their own document leave both candidates and neighbour sets. `domain` is the nearest domain up the
 * containment chain, the value the compiler reads from frontmatter `domain:`; a domain node has none.
 */
export function buildSimilarityCandidates(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): Map<string, GraphSimilarityCandidate> {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const parentOf = buildContainmentParents(edges, nodeById);
  const documented = new Map(
    nodes.filter(hasOwnDocument).map((node) => [node.id, node] as const),
  );

  // Neighbours as the engine's `traversalEdges(slug,'undirected')`: adjacent document slugs in either direction.
  const neighborsOf = new Map<string, Set<string>>();
  const addNeighbor = (fromId: string, toId: string) => {
    const from = documented.get(fromId);
    const to = documented.get(toId);
    if (!from || !to || from.id === to.id) return;
    let set = neighborsOf.get(from.id);
    if (!set) {
      set = new Set();
      neighborsOf.set(from.id, set);
    }
    set.add(slugOf(to));
  };
  for (const edge of edges) {
    addNeighbor(edge.from, edge.to);
    addNeighbor(edge.to, edge.from);
  }

  const candidates = new Map<string, GraphSimilarityCandidate>();
  for (const node of documented.values()) {
  // The domain walk runs over the whole graph, so membership reaches the domain through a document-less node.
    const domainId = node.kind === "domain" ? null : nearestDomainId(node, parentOf, nodeById);
    const domainNode = domainId ? nodeById.get(domainId) : null;
    candidates.set(node.id, {
      node,
      slug: slugOf(node),
  // `title` is the search and matching source; `display` is render-only.
      title: node.title,
      kind: node.kind || null,
      domain: domainNode ? slugOf(domainNode) : null,
      neighbors: neighborsOf.get(node.id) ?? new Set<string>(),
    });
  }
  return candidates;
}

export function buildDuplicatePairs(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit: number,
  minScore = DUPLICATE_SUSPECT_MIN_SCORE,
  /** Rows the disclosure carries; 0 means no folded layer. The consumer picks the value; this only truncates. */
  restLimit = 0,
): DuplicatePairs {
  const empty: DuplicatePairs = { rows: [], restRows: [], suspectCount: 0 };
  if (nodes.length < 2) return empty;

  const candidates = buildSimilarityCandidates(nodes, edges);
  if (candidates.size < 2) return empty;

  /**
   * Each node is tokenized once. `scorePair` reproduces `scoreNodeSimilarity` term by term, rounding order included,
   * and the engine comparison in `duplicate-pairs.contract.test.ts` catches divergence. Candidate pairs come from a
   * word inverted index: O(sum of bucket sizes squared), O(n^2) when one shared word buckets every node.
   */
  interface PairTokens {
    slug: Set<string>;
    title: Set<string>;
    all: Set<string>;
  }
  const tokenSetsOf = new Map<string, PairTokens>();
  for (const [id, candidate] of candidates) {
    const slug = new Set(similarityTokens(candidate.slug));
    const title = new Set(similarityTokens(candidate.title));
    tokenSetsOf.set(id, { slug, title, all: new Set([...slug, ...title]) });
  }
  const scorePair = (
    left: SimilarityCandidate,
    right: SimilarityCandidate,
    leftTokens: PairTokens,
    rightTokens: PairTokens,
  ): number => {
    const slug = tokenSetJaccard(leftTokens.slug, rightTokens.slug) * 0.35;
    const title = tokenSetJaccard(leftTokens.title, rightTokens.title) * 0.35;
    const kind = left.kind && right.kind && left.kind === right.kind ? 0.1 : 0;
    const domain = left.domain && right.domain && left.domain === right.domain ? 0.1 : 0;
    const neighbors = tokenSetJaccard(left.neighbors, right.neighbors) * 0.1;
    return roundScore(slug + title + kind + domain + neighbors);
  };

  // At or below the no-shared-word ceiling, narrowing could change the result, so compare every pair.
  const useTokenIndex = minScore > MAX_SCORE_WITHOUT_SHARED_TOKEN;
  interface IndexedCandidate {
    id: string;
    candidate: GraphSimilarityCandidate;
    tokens: PairTokens;
  }
  const indexedCandidates: IndexedCandidate[] = [];
  for (const [id, candidate] of candidates) {
    indexedCandidates.push({ id, candidate, tokens: tokenSetsOf.get(id)! });
  }
  const nodesByToken = new Map<string, IndexedCandidate[]>();
  const tokenOrder = new Map<string, number>();
  if (useTokenIndex) {
    for (const indexed of indexedCandidates) {
      for (const token of indexed.tokens.all) {
        if (!tokenOrder.has(token)) tokenOrder.set(token, tokenOrder.size);
        const bucket = nodesByToken.get(token);
        if (bucket) bucket.push(indexed);
        else nodesByToken.set(token, [indexed]);
      }
    }
  }

  const shown = Math.max(0, limit);
  const folded = Math.max(0, restLimit);
  const shownLimit = sliceCount(shown);
  const restEndLimit = sliceCount(shown + folded);
  const retainedLimit = Math.max(shownLimit, restEndLimit);
  const scored: DuplicatePairRow[] = [];
  let suspectCount = 0;

  const compareRows = (a: DuplicatePairRow, b: DuplicatePairRow) =>
    b.score - a.score || a.id.localeCompare(b.id);

  const retain = (row: DuplicatePairRow) => {
    suspectCount += 1;
    if (retainedLimit === 0) return;
    if (retainedLimit === Infinity || scored.length < retainedLimit) {
      scored.push(row);
      return;
    }
    let worst = 0;
    for (let index = 1; index < scored.length; index += 1) {
      // On an exact tie evict the later row, so the kept prefix matches a stable full sort even with duplicate row ids.
      if (compareRows(scored[worst], scored[index]) <= 0) worst = index;
    }
    if (compareRows(row, scored[worst]) < 0) scored[worst] = row;
  };

  const consider = (leftEntry: IndexedCandidate, rightEntry: IndexedCandidate) => {
    const left = leftEntry.candidate;
    const right = rightEntry.candidate;
    const total = scorePair(left, right, leftEntry.tokens, rightEntry.tokens);
    if (total < minScore) return;

  // Keep the better-connected side, so fewer relations need reconnecting; ties break by name for a stable suggestion.
    const leftKeeps =
      left.neighbors.size !== right.neighbors.size
        ? left.neighbors.size > right.neighbors.size
        : left.slug.localeCompare(right.slug) <= 0;
    const keep = leftKeeps ? left : right;
    const dissolve = leftKeeps ? right : left;

    const folders = new Set([...slugFolders(keep.slug), ...slugFolders(dissolve.slug)]);
    const keepTokens = new Set([
      ...similarityTokens(keep.slug),
      ...similarityTokens(keep.title),
    ]);
    const sharedTokens = [
      ...new Set([...similarityTokens(dissolve.slug), ...similarityTokens(dissolve.title)]),
    ]
      .filter((token) => keepTokens.has(token) && !folders.has(token))
      .sort((a, b) => b.length - a.length || a.localeCompare(b));

    retain({
      id: JSON.stringify([keep.slug, dissolve.slug]),
      keepId: keep.node.id,
      keepSlug: keep.slug,
      keepTitle: keep.node.display ?? keep.node.title,
      dissolveId: dissolve.node.id,
      dissolveSlug: dissolve.slug,
      dissolveTitle: dissolve.node.display ?? dissolve.node.title,
      kind: keep.kind === dissolve.kind ? keep.kind : null,
      score: total,
      sharedTokens,
    });
  };

  if (useTokenIndex) {
    for (const [token, bucket] of nodesByToken) {
      const currentOrder = tokenOrder.get(token)!;
      for (let i = 0; i < bucket.length; i += 1) {
        const leftTokens = bucket[i].tokens.all;
        for (let j = i + 1; j < bucket.length; j += 1) {
          const rightTokens = bucket[j].tokens.all;
          let visitedEarlier = false;
          for (const shared of leftTokens) {
            const order = tokenOrder.get(shared)!;
            if (order < currentOrder && rightTokens.has(shared)) {
              visitedEarlier = true;
              break;
            }
          }
          if (!visitedEarlier) consider(bucket[i], bucket[j]);
        }
      }
    }
  } else {
    for (let i = 0; i < indexedCandidates.length; i += 1) {
      for (let j = i + 1; j < indexedCandidates.length; j += 1) {
        consider(indexedCandidates[i], indexedCandidates[j]);
      }
    }
  }

  scored.sort(compareRows);

  return {
    rows: scored.slice(0, shownLimit),
    restRows: scored.slice(shownLimit, restEndLimit),
    suspectCount,
  };
}

/** Coerces like `Array#slice`'s end: negative becomes 0. */
function sliceCount(value: number): number {
  const nonNegative = Math.max(0, value);
  if (nonNegative === Infinity) return Infinity;
  return Number.isFinite(nonNegative) ? Math.floor(nonNegative) : 0;
}
