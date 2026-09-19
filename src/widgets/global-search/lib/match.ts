import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { hangulIncludes, hangulStartsWith } from "@/shared/lib/hangul-match";
import {
  nameEquals,
  nameHangulIncludes,
  nameHangulStartsWith,
  nameIncludes,
  nameStartsWith,
  normalizeForMatch,
} from "@/shared/lib/node-name-match";

/**
 * N12 (persona-ux-2026-07 report) — element nodes are often titled after the
 * source file they represent (`mcp/src/ontology-engine.mjs`). At full title
 * weight that reads as body-text noise next to plain-language capability/
 * domain titles in the same result list. Heuristic: a slash-separated
 * segment ending in a short code-file extension. Used to DEMOTE the row's
 * visual weight (mono + quaternary tone), never to hide the row — the path
 * is still the only identifying label these nodes have.
 */
export function isPathLikeTitle(title: string): boolean {
  return /\/.*\.[a-z0-9]{1,5}$/i.test(title.trim());
}

/**
 * One search result — an ontology approved node source.
 */
export interface OntologySearchResult {
  node: KnowledgeGraphNode;
  /** The match score the caller sorts on. Higher wins. */
  score: number;
}

/**
 * Optional filters for matchOntologyNodes.
 *
 * With both sets empty (or unset) the filter is inactive and every node is a
 * candidate. Non-empty sets are ANDed — a result must match the kind *and* the
 * project.
 *
 * The user's mental model:
 *   "only show capabilities" → kinds = {capability}
 *   "only nodes in this project" → projectIds = {project-slug}
 *   "capabilities in this project" → both sets
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
 * Ontology node search.
 *
 * Scores (lower is a weaker match):
 *   7 — exact name match. Someone who typed a name in full is looking for the node
 *       with that name; tied with a prefix match, the recency tie-break sinks the
 *       exact match (measured 2026-08-13: "order" landed 6th, below five others)
 *   6 — name prefix match
 *   5 — name substring match
 *   4 — Hangul-aware name prefix — consonant initials alone, or the half-typed
 *       syllable an IME passes through. `shared/lib/hangul-match` owns the rule.
 *   3 — Hangul-aware name substring
 *   2 — summary substring match
 *   1 — id substring match (for searching a kebab-case slug directly)
 *   0 — no match (excluded)
 *
 * The Hangul tiers sit **between** the literal name tiers and the summary tier.
 * Below the literal ones because a name that really contains what was typed is
 * the better answer; above the summary because what a Korean typist half-typed is
 * still a name, and burying it under a body-text graze is the failure the display-name
 * rule above already fixed once.
 *
 * "Name" means the canonical `title` **and** every display name on screen
 * (`display` plus all `display_<locale>`) — `shared/lib/node-name-match` is the
 * single source of that rule and the studio picker uses it too. Display names score
 * **level with the title** because what a user types is usually the name they just
 * read on screen: ranking that match below a summary (body) match buries the node
 * they were looking for under one the body merely grazed. The title is still the
 * source of truth and only the scope widens, so anyone searching by the raw title is
 * unaffected.
 *
 * An empty query returns all nodes (limit applied), so the UI can use it as an
 * initial suggestion. Sorted by score desc, then lastApprovedAt desc (most recent
 * first) — unified with the documents matcher for a predictable order.
 *
 * For mixed Korean and English, matching is substring-based after normalisation
 * (NFC + lowercase + whitespace tidy), so `auth-login` and "login" go through the
 * same call.
 *
 * The kind and projectIds filters are applied before scoring (only nodes that pass
 * are scored). An empty query plus a filter becomes "the most recent N of this kind
 * or project".
 */
export function matchOntologyNodes(
  query: string,
  nodes: readonly KnowledgeGraphNode[],
  limit = 30,
  options?: MatchOntologyOptions,
): OntologySearchResult[] {
  const kinds = options?.kinds;
  const projectIds = options?.projectIds;
  const hasKindFilter = kinds && kinds.size > 0;
  const hasProjectFilter = projectIds && projectIds.size > 0;

  const passesFilter = (node: KnowledgeGraphNode): boolean => {
    if (hasKindFilter && !kinds!.has(node.kind)) return false;
    if (hasProjectFilter) {
      if (node.projectIds.length === 0) return false;
      const anyMatch = node.projectIds.some((pid) => projectIds!.has(pid));
      if (!anyMatch) return false;
    }
    return true;
  };

  const trimmed = normalizeForMatch(query);
  if (trimmed === "") {
    return nodes
      .filter(passesFilter)
      .slice()
      .sort((a, b) => b.lastApprovedAt.getTime() - a.lastApprovedAt.getTime())
      .slice(0, limit)
      .map((node) => ({ node, score: 0 }));
  }

  const matches: OntologySearchResult[] = [];
  for (const node of nodes) {
    if (!passesFilter(node)) continue;

    const summary = normalizeForMatch(node.summary ?? "");
    const id = normalizeForMatch(node.id);

    let score = 0;
    if (nameEquals(node, trimmed)) score = 7;
    else if (nameStartsWith(node, trimmed)) score = 6;
    else if (nameIncludes(node, trimmed)) score = 5;
    else if (nameHangulStartsWith(node, trimmed)) score = 4;
    else if (nameHangulIncludes(node, trimmed)) score = 3;
    else if (summary.includes(trimmed)) score = 2;
    else if (id.includes(trimmed)) score = 1;

    if (score > 0) matches.push({ node, score });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Within an equal score, most recent first (lastApprovedAt desc) — unified with the documents matcher.
    return b.node.lastApprovedAt.getTime() - a.node.lastApprovedAt.getTime();
  });

  return matches.slice(0, limit);
}

/**
 * One search result — a project source. S4 closure.
 */
export interface ProjectSearchResult {
  project: Project;
  /** The match score. Higher wins. */
  score: number;
}

/**
 * Project search.
 *
 * Scores — one ladder with the node matcher, so a mixed result list ranks on one scale:
 *   7 — exact name / nameEn match (same reason as the node matcher — so the recency
 *       tie-break cannot sink an exact match)
 *   6 — name / nameEn prefix match
 *   5 — name / nameEn substring match
 *   4 — Hangul-aware name prefix (chosung, or a syllable still being typed)
 *   3 — Hangul-aware name substring
 *   2 — description / tags / category substring match
 *   1 — slug substring match (searching kebab-case directly)
 *   0 — no match (excluded)
 *
 * An empty query returns a limit by updatedAt desc. Sorted by score desc, ties by
 * updatedAt desc (unified with the other matchers — ontology uses lastApprovedAt desc).
 *
 * Lowercased substring matching for mixed Korean and English.
 */
export function matchProjects(
  query: string,
  projects: readonly Project[],
  limit = 30,
): ProjectSearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return projects
      .slice()
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
      .map((project) => ({ project, score: 0 }));
  }

  const matches: ProjectSearchResult[] = [];
  for (const project of projects) {
    const name = project.name.toLowerCase();
    const nameEn = project.nameEn?.toLowerCase() ?? "";
    // Every word a screen draws for the project (`display_<locale>`) matches like its name.
    const displays = Object.values(project.displayNames ?? {}).map((value) => value.toLowerCase());
    const description = project.description?.toLowerCase() ?? "";
    const tags = project.tags.join(" ").toLowerCase();
    const category = (project.category ?? '').toLowerCase();
    const slug = project.slug.toLowerCase();

    let score = 0;
    /*
     * A `display_<locale>` is a name the screen shows, so it matches exactly where `name` and
     * `nameEn` do — including the Hangul rungs, since a Korean display name is the one a person
     * types jamo into. Merged 2026-09-20 from the Korean-keyboard ladder and the display-name
     * change, which arrived at this block from either side.
     */
    if (name === trimmed || nameEn === trimmed || displays.includes(trimmed)) score = 7;
    else if (
      name.startsWith(trimmed)
      || nameEn.startsWith(trimmed)
      || displays.some((display) => display.startsWith(trimmed))
    )
      score = 6;
    else if (
      name.includes(trimmed)
      || nameEn.includes(trimmed)
      || displays.some((display) => display.includes(trimmed))
    )
      score = 5;
    else if (
      hangulStartsWith(name, trimmed)
      || hangulStartsWith(nameEn, trimmed)
      || displays.some((display) => hangulStartsWith(display, trimmed))
    )
      score = 4;
    else if (
      hangulIncludes(name, trimmed)
      || hangulIncludes(nameEn, trimmed)
      || displays.some((display) => hangulIncludes(display, trimmed))
    )
      score = 3;
    else if (
      description.includes(trimmed)
      || tags.includes(trimmed)
      || category.includes(trimmed)
    )
      score = 2;
    else if (slug.includes(trimmed)) score = 1;

    if (score > 0) matches.push({ project, score });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.project.updatedAt.getTime() - a.project.updatedAt.getTime();
  });

  return matches.slice(0, limit);
}
