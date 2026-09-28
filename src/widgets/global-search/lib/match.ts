import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { rankProjectMatches, type Project } from "@/entities/project";
import {
  findNameMatch,
  idSearchText,
  NAME_TIER_SCORE,
  normalizeForMatch,
} from "@/shared/lib/node-name-match";

/**
 * Detects file-path-shaped element titles (a slash segment ending in a short code extension) to
 * demote the row's weight; the path is never hidden because it is the only label.
 */
export function isPathLikeTitle(title: string): boolean {
  return /\/.*\.[a-z0-9]{1,5}$/i.test(title.trim());
}

/**
 * What carried the match, so a row can say why it is listed; one shape for concepts and
 * projects. `name` is a specific name (often not the drawn one), `summary` the descriptive prose, `id` the
 * identifier.
 */
export interface SearchMatchEvidence {
  field: "name" | "summary" | "id";
  text: string;
}

/**
 * One page of results plus the found count, so the screen shows the answer rather than the limit.
 */
export interface OntologySearchPage {
  /** The results to draw, already cut to the limit. */
  results: OntologySearchResult[];
  /** How many matched in all, before the cut. */
  total: number;
}

/**
 * One search result — an ontology approved node source.
 */
export interface OntologySearchResult {
  node: KnowledgeGraphNode;
  /** The match score the caller sorts on. Higher wins. */
  score: number;
  /**
   * Which field carried the match. Absent for an empty query, where nothing was
   * matched and the row is a recency sample.
   */
  matched?: SearchMatchEvidence;
}

/**
 * Optional filters; empty or unset sets are inactive, and non-empty kind and project sets are
 * ANDed.
 */
export interface MatchOntologyOptions {
  /**
   * The result node's kind must be in this set. Empty allows every kind.
   */
  kinds?: ReadonlySet<string>;
  /**
   * At least one of the result node's projectIds must be in this set. Empty allows
   * every project, including nodes attached to none.
   */
  projectIds?: ReadonlySet<string>;
}

/**
 * Ontology node search. One pass: per filtered node up to k cached names, each an
 * O(|name|·|query|) literal or Hangul check, plus summary and id normalised per query; then
 * O(m log m) over the m matches.
 * Scores: 7 exact name, 6 name prefix, 5 name substring, 4 Hangul-aware prefix, 3 Hangul-aware
 * substring (`shared/lib/hangul-match`), 2 summary, 1 id slug, 0 excluded. Names are the title and
 * every display name (`shared/lib/node-name-match`). The id matches its slug unless the query has a
 * colon. Every hit carries `matched`. An empty query returns the most recent nodes; ties sort by
 * lastApprovedAt desc. Filters apply before scoring.
 */
export function matchOntologyNodes(
  query: string,
  nodes: readonly KnowledgeGraphNode[],
  limit = 30,
  options?: MatchOntologyOptions,
): OntologySearchPage {
  const kinds = options?.kinds;
  const projectIds = options?.projectIds;
  const hasKindFilter = kinds && kinds.size > 0;
  const hasProjectFilter = projectIds && projectIds.size > 0;

  const passesFilter = (node: KnowledgeGraphNode): boolean => {
    if (hasKindFilter && !kinds!.has(node.kind)) return false;
    return !hasProjectFilter || node.projectIds.some((pid) => projectIds!.has(pid));
  };

  const trimmed = normalizeForMatch(query);
  if (trimmed === "") {
    const candidates = nodes.filter(passesFilter);
    return {
      total: candidates.length,
      results: candidates
        .slice()
        .sort((a, b) => b.lastApprovedAt.getTime() - a.lastApprovedAt.getTime())
        .slice(0, limit)
        .map((node) => ({ node, score: 0 })),
    };
  }

  const matches: OntologySearchResult[] = [];
  for (const node of nodes) {
    if (!passesFilter(node)) continue;

    const nameMatch = findNameMatch(node, trimmed);
    if (nameMatch) {
      matches.push({
        node,
        score: NAME_TIER_SCORE[nameMatch.tier],
        matched: { field: "name", text: nameMatch.name },
      });
      continue;
    }

    const summary = normalizeForMatch(node.summary ?? "");
    if (node.summary && summary.includes(trimmed)) {
      matches.push({ node, score: 2, matched: { field: "summary", text: node.summary } });
      continue;
    }

    const idText = idSearchText(node.id, trimmed);
    if (idText !== null && normalizeForMatch(idText).includes(trimmed)) {
      matches.push({ node, score: 1, matched: { field: "id", text: idText } });
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Within an equal score, most recent first (lastApprovedAt desc) — unified with the documents matcher.
    return b.node.lastApprovedAt.getTime() - a.node.lastApprovedAt.getTime();
  });

  return { results: matches.slice(0, limit), total: matches.length };
}

/** One page of project results plus how many matched in all. */
export interface ProjectSearchPage {
  results: ProjectSearchResult[];
  total: number;
}

/**
 * One search result — a project source.
 */
export interface ProjectSearchResult {
  project: Project;
  /** The match score. Higher wins. */
  score: number;
  /** Which field carried the match; absent for an empty query. */
  matched?: SearchMatchEvidence;
}

/**
 * Project search, O(n · (names + prose fields)) normalised substring and Hangul checks per query,
 * then O(m log m) over the m matches. On the node matcher's ladder: 7 exact name or nameEn, 6 prefix, 5 substring, 4 and
 * 3 Hangul-aware, 2 description, tags, stack or category, 1 slug, 0 excluded. Same `normalizeForMatch`
 * (NFC, lowercase, whitespace) so decomposed Hangul matches. An empty query returns the limit by
 * updatedAt desc; ties by updatedAt desc.
 */
export function matchProjects(
  query: string,
  projects: readonly Project[],
  limit = 30,
): ProjectSearchPage {
  const trimmed = normalizeForMatch(query);
  if (trimmed === "") {
    return {
      total: projects.length,
      results: projects
        .slice()
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limit)
        .map((project) => ({ project, score: 0 })),
    };
  }

  const matches = rankProjectMatches(projects, trimmed);
  return {
    results: matches
      .slice(0, limit)
      .map(({ project, score, field, text }) => ({ project, score, matched: { field, text } })),
    total: matches.length,
  };
}
