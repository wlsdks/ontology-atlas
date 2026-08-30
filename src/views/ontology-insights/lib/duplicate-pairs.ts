import {
  resolveNodeAgentTarget,
  resolveNodeDocument,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildContainmentParents, nearestDomainId } from "@/shared/lib/ontology-tree";

/**
 * The computation behind the "similar names — are these the same thing?" card.
 *
 * Duplicate concepts are the number-one failure of a growing folder. If the screen defined that
 * verdict afresh, a person would see one set of pairs on screen and an agent a different set
 * from `query_ontology({operation:"similar_nodes"})` — and at that moment this card becomes
 * noise rather than grounds for maintenance. So the three functions below are a **verbatim
 * mirror** of the MCP engine (`textTokens`, `setJaccard`, `similarityScore` in
 * `mcp/src/ontology-engine.mjs`), and `tests/contract/duplicate-pairs.contract.test.ts` catches
 * any divergence.
 *
 * The weights match the engine too: slug 0.35 · title 0.35 · kind 0.1 · domain 0.1 ·
 * neighbours 0.1. That distribution exists to separate pairs sharing only a name (capped at
 * 0.7) from pairs that also share a parent and neighbours, so it is not retuned arbitrarily.
 */

/** Mirror of the engine's `textTokens` — lowercase, alphanumeric runs only, dropping anything under 2 characters. */
export function similarityTokens(value: string | null | undefined): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/** Mirror of the engine's `setJaccard` — intersection over union. Zero if either side is empty. */
export function tokenSetJaccard(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  // The union size is |L| + |R| − |intersection| — exactly equal to the previous implementation
  // that built a new Set (integer arithmetic), and it removes an allocation from the inner loop
  // of an n² pair comparison.
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Mirror of the engine's `roundScore` — stops the two engines diverging on a floating-point tail. */
function roundScore(value: number): number {
  return Number(value.toFixed(6));
}

/** One node as it enters the similarity computation — the same fields as the engine's node summary. */
export interface SimilarityCandidate {
  slug: string;
  title: string;
  kind: string | null;
  /** The parent domain's identifier. A domain node itself has no parent (as in the engine). */
  domain: string | null;
  /** The set of undirected neighbour identifiers. */
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

/** One suspected duplicate pair. `keep` is the side to keep, `dissolve` the side to fold (the less connected one). */
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
  /** Similarity from 0 to 1 — the same number as MCP `similar_nodes`'s score. */
  score: number;
  /** Human-readable evidence — the words appearing in both names. */
  sharedTokens: string[];
}

export interface DuplicatePairs {
  rows: DuplicatePairRow[];
  /**
   * The remaining folded pairs — the layer drawn by the "show more" disclosure.
   *
   * Measured 2026-07-27: the badge said 10 while the screen showed three rows with no "show
   * more". The other seven had **no way to be discovered** on this screen — printing a large
   * total while quietly hiding the rest is concealment, not truncation.
   */
  restRows: DuplicatePairRow[];
  /** Total pairs above the threshold — the M in the "top N / M total" truncation copy. */
  suspectCount: number;
}

/**
 * The minimum similarity for suspecting a duplicate. Measured against the dogfood vault (96
 * concepts), below 0.6 is mostly genuinely different concepts sharing only a name prefix (such
 * as contract documents using one prefix), so this is the floor of the range worth a person's
 * confirmation.
 */
const DUPLICATE_SUSPECT_MIN_SCORE = 0.6;

/**
 * A pair sharing no name words at all has slug and title signals of 0, capping it at 0.3 — it
 * can never reach the threshold. So candidates are narrowed with a word inverted index (the
 * semantics are unchanged; only the n² comparison is avoided).
 */
const MAX_SCORE_WITHOUT_SHARED_TOKEN = 0.3;

/**
 * Folder names excluded from the evidence words — `elements/foo` and `elements/bar` share only
 * the fact of being in the same folder. They stay in the score computation (the engine mirror)
 * and are removed only from the evidence shown to a person.
 */
function slugFolders(slug: string): string[] {
  const segments = slug.split("/");
  return segments.slice(0, -1).flatMap((segment) => similarityTokens(segment));
}

/** One graph node converted into the same fields the engine uses. */
export type GraphSimilarityCandidate = SimilarityCandidate & { node: KnowledgeGraphNode };

/**
 * The name to point an agent at for this node. For the `merge_concepts` / `get_concept` the
 * screen offers to copy to run as pasted, it must be relative to the vault root — while
 * `evidenceIds[0]` was used directly, the bundled sample's extra `ontology/` segment made the
 * copied call fail immediately (measured 2026-07-26). The similarity score uses the same value:
 * the agent-side `similar_nodes` tokenizes a vault-root-relative slug, so measuring with a
 * prefixed value splits the two rankings.
 */
function slugOf(node: KnowledgeGraphNode): string {
  return resolveNodeAgentTarget(node).ref ?? node.id;
}

/**
 * Does this node have **its own document**?
 *
 * The derived graph contains nodes born from references with no document — code paths written
 * into another document's `elements:`, for instance. Such a node's evidence slug belongs not to
 * itself but to the document that named it, so proposing a merge points at the wrong file. In
 * the dogfood vault this really surfaced «Test Name Pattern ↔ Test Name Pattern Test» (a source
 * file and its test file) at 100% overlap — not a duplicate, just two files with similar names.
 *
 * The verdict is made in exactly one place, `resolveNodeDocument` — it reads the fact derivation
 * recorded when creating the node (`hasOwnDocument`) rather than having the screen re-infer it.
 * The old inference ("does the id tail match the document slug tail?") **missed project nodes**:
 * a project id is built from frontmatter `slug:` (`ontology/project.md` →
 * `project:ontology-atlas`) and differs from the filename tail. Two places deciding one concept
 * will always diverge.
 */
function hasOwnDocument(node: KnowledgeGraphNode): boolean {
  return resolveNodeDocument(node).ownSlug !== null;
}

/**
 * Converts a graph node into the engine's similarity input — built in one place so the screen
 * and the contract test use the same conversion. A node with no document of its own drops out of
 * both the candidates and the neighbour sets (only what the compiler's graph sees is considered).
 *
 * `domain` is the document slug of the nearest domain found by walking containment upwards. The
 * compiler reads the same value straight from frontmatter `domain:` — the schema writes that key
 * on the child side, so both paths reach the same value. A domain node itself has no parent (the
 * engine's `domain` is empty too).
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

  // The neighbour set means the same as the engine's `traversalEdges(slug,'undirected')` — the
  // set of adjacent document slugs regardless of relation direction.
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
  // The domain-ancestor walk runs over the whole graph, so membership still reaches the domain
  // even with a document-less node in between.
    const domainId = node.kind === "domain" ? null : nearestDomainId(node, parentOf, nodeById);
    const domainNode = domainId ? nodeById.get(domainId) : null;
    candidates.set(node.id, {
      node,
      slug: slugOf(node),
  // The score uses `title`, the source of truth for search and matching — `display` is render-only.
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
  /**
   * How many remaining rows the disclosure carries. 0 means no folded layer (preserving the old
   * caller's behaviour). The basis for the value is decided by the consumer from measurement;
   * this function only truncates.
   */
  restLimit = 0,
): DuplicatePairs {
  const empty: DuplicatePairs = { rows: [], restRows: [], suspectCount: 0 };
  if (nodes.length < 2) return empty;

  const candidates = buildSimilarityCandidates(nodes, edges);
  if (candidates.size < 2) return empty;

  /**
   * Tokenize each node's word set **once**. Previously `scoreNodeSimilarity` re-tokenized slug
   * and title per pair, building four new Sets each time — and in the large buckets created by
   * shared folder words (`capabilities` and the like) this one function consumed 74% of the
   * insights entry memo time (34.8ms measured under 4× throttling). The scoring formula is
   * reproduced by `scorePair` below, matching `scoreNodeSimilarity` down to the position of each
   * term (rounding order included) — divergence is caught by the engine comparison in
   * `duplicate-pairs.contract.test.ts`.
   */
  interface PairTokens {
    slug: Set<string>;
    title: Set<string>;
  }
  const tokenSetsOf = new Map<string, PairTokens>();
  for (const [id, candidate] of candidates) {
    tokenSetsOf.set(id, {
      slug: new Set(similarityTokens(candidate.slug)),
      title: new Set(similarityTokens(candidate.title)),
    });
  }
  const scorePair = (
    leftId: string,
    rightId: string,
    left: SimilarityCandidate,
    right: SimilarityCandidate,
  ): number => {
    const leftTokens = tokenSetsOf.get(leftId)!;
    const rightTokens = tokenSetsOf.get(rightId)!;
    const slug = tokenSetJaccard(leftTokens.slug, rightTokens.slug) * 0.35;
    const title = tokenSetJaccard(leftTokens.title, rightTokens.title) * 0.35;
    const kind = left.kind && right.kind && left.kind === right.kind ? 0.1 : 0;
    const domain = left.domain && right.domain && left.domain === right.domain ? 0.1 : 0;
    const neighbors = tokenSetJaccard(left.neighbors, right.neighbors) * 0.1;
    return roundScore(slug + title + kind + domain + neighbors);
  };

  // Word → node inverted index. If the threshold is at or below the ceiling reachable with no
  // shared word, narrowing could change the result, so it falls back to exhaustive comparison.
  const useTokenIndex = minScore > MAX_SCORE_WITHOUT_SHARED_TOKEN;
  const nodesByToken = new Map<string, string[]>();
  if (useTokenIndex) {
    for (const [id] of candidates) {
      const sets = tokenSetsOf.get(id)!;
      const tokens = new Set([...sets.slug, ...sets.title]);
      for (const token of tokens) {
        const bucket = nodesByToken.get(token);
        if (bucket) bucket.push(id);
        else nodesByToken.set(token, [id]);
      }
    }
  }

  const degreeOf = (id: string): number => candidates.get(id)?.neighbors.size ?? 0;
  // The duplicate-visit key — two nodes sharing several words appear in several buckets, so the
  // same pair is reached more than once. This key is **internal only**, so an integer combination
  // of candidate indices is enough; the previous implementation built a string per pair
  // (JSON.stringify), a noticeable constant cost in the inner loop of an n² comparison. The row
  // `id` output is still a JSON array — its rationale (the 2026-08-08 accident where a NUL
  // composite key made git treat the file as binary) is about the printability of strings written
  // into source, and is unrelated to this integer key.
  const indexOfId = new Map<string, number>();
  for (const id of candidates.keys()) indexOfId.set(id, indexOfId.size);
  const indexSpan = indexOfId.size;
  const seen = new Set<number>();
  const scored: DuplicatePairRow[] = [];

  const consider = (leftId: string, rightId: string) => {
    const leftIndex = indexOfId.get(leftId);
    const rightIndex = indexOfId.get(rightId);
    if (leftIndex === undefined || rightIndex === undefined) return;
    const pairKey =
      leftIndex < rightIndex
        ? leftIndex * indexSpan + rightIndex
        : rightIndex * indexSpan + leftIndex;
    if (seen.has(pairKey)) return;
    seen.add(pairKey);
    const left = candidates.get(leftId);
    const right = candidates.get(rightId);
    if (!left || !right) return;
    const total = scorePair(leftId, rightId, left, right);
    if (total < minScore) return;

  // The side to keep is the more connected one — merging gathers backlinks there, so the fewest
  // relations have to be reconnected. Ties break by name, so the same suggestion is given every time.
    const leftKeeps =
      degreeOf(leftId) !== degreeOf(rightId)
        ? degreeOf(leftId) > degreeOf(rightId)
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

    scored.push({
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
    for (const bucket of nodesByToken.values()) {
      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) consider(bucket[i], bucket[j]);
      }
    }
  } else {
    const ids = [...candidates.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) consider(ids[i], ids[j]);
    }
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const shown = Math.max(0, limit);
  return {
    rows: scored.slice(0, shown),
    restRows: scored.slice(shown, shown + Math.max(0, restLimit)),
    suspectCount: scored.length,
  };
}
