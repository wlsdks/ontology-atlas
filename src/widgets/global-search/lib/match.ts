import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { hangulIncludes, hangulStartsWith } from "@/shared/lib/hangul-match";
import {
  findNameMatch,
  idSearchText,
  normalizeForMatch,
  type NameMatchTier,
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
 * What carried the match, so a result row can say why it is in the list. One shape
 * for both sources, because the two kinds of row sit in one list and a person
 * reading it should not have to learn two explanations.
 *
 * `text` is the exact string that matched. The three seats:
 *
 * - `name` — one specific name. For a concept that is the canonical `title` or any
 *   `display_<locale>`; for a project, its name or `nameEn`. It is often **not** the
 *   name the row is drawing, which is the whole reason this type exists.
 * - `summary` — the descriptive prose beside the name: a concept's summary, or a
 *   project's description, tag or category.
 * - `id` — the identifier: a concept's id slug, or a project's slug.
 */
export interface SearchMatchEvidence {
  field: "name" | "summary" | "id";
  text: string;
}

/**
 * One page of results plus the size of what was found.
 *
 * **The number on screen has to be the answer, not the page.** The palette showed
 * its limit as if it were the count: typing a common letter put "match · 20" in the
 * heading and "21 matches" in the footer when the vault held far more, and the footer
 * is the one place that names the scope it searched — so the sentence read as a fact
 * about the folder. The empty state already did this correctly ("20 / 125"), which is
 * the shape the query state now uses too (measured 2026-09-19).
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
 * Every scored result carries `matched` — the field and the exact text that earned
 * it — because a row that gives no sign of why it is in the list reads as a broken
 * search. Measured 2026-09-19 on the bundled sample: 30.6% of rows over thirty
 * English queries showed no highlight at all.
 *
 * **The id matches on its slug, not its `kind:` prefix.** Every element's id begins
 * `element:`, so typing that word used to return twenty rows, every one of them
 * unexplained — that is the kind, which the filter chips already select properly, not
 * a search result. A query that carries a colon is someone pasting a real id, so the
 * whole id is still matched for them.
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
/** The score each name tier earns. The ladder above is this table read downwards. */
const NAME_TIER_SCORE: Readonly<Record<NameMatchTier, number>> = {
  equals: 7,
  prefix: 6,
  includes: 5,
  "hangul-prefix": 4,
  "hangul-includes": 3,
};

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
    if (hasProjectFilter) {
      if (node.projectIds.length === 0) return false;
      const anyMatch = node.projectIds.some((pid) => projectIds!.has(pid));
      if (!anyMatch) return false;
    }
    return true;
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
 * One search result — a project source. S4 closure.
 */
export interface ProjectSearchResult {
  project: Project;
  /** The match score. Higher wins. */
  score: number;
  /** Which field carried the match; absent for an empty query. */
  matched?: SearchMatchEvidence;
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
 * Substring matching for mixed Korean and English, through the **same** `normalizeForMatch`
 * the node matcher uses: NFC, then lowercase, then a whitespace tidy. The NFC half is not
 * cosmetic — Hangul arrives decomposed from local vault filenames and the macOS clipboard, and
 * a raw comparison sent an exactly typed name down to the Hangul rung while a decomposed word
 * in a description matched nothing at all.
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

  const matches: ProjectSearchResult[] = [];
  for (const project of projects) {
    const name = normalizeForMatch(project.name);
    const nameEn = normalizeForMatch(project.nameEn ?? "");
    const slug = normalizeForMatch(project.slug);

    // Which of the two names matched decides what the row shows, so the pair is
    // resolved once rather than asked about twice.
    const nameTier = (candidate: string): number => {
      if (candidate === "") return 0;
      if (candidate === trimmed) return 7;
      if (candidate.startsWith(trimmed)) return 6;
      if (candidate.includes(trimmed)) return 5;
      if (hangulStartsWith(candidate, trimmed)) return 4;
      if (hangulIncludes(candidate, trimmed)) return 3;
      return 0;
    };
    /*
     * A `display_<locale>` is a name a screen draws for this project, so it is a candidate on the
     * same ladder as `name` and `nameEn` — including the Hangul rungs, since the Korean display
     * name is the one a person types jamo into. It enters as a *candidate* rather than as extra
     * score, so a row that matched on the Korean word shows the Korean word: the point of the
     * display name is that the screen and the search agree about what this project is called.
     */
    const displays = Object.values(project.displayNames ?? {});
    const named: ReadonlyArray<readonly [number, string]> = [
      [nameTier(name), project.name],
      [nameTier(nameEn), project.nameEn ?? ""],
      ...displays.map((display) => [nameTier(normalizeForMatch(display)), display] as const),
    ];
    const bestName = named.reduce((best, entry) => (entry[0] > best[0] ? entry : best));

    if (bestName[0] > 0) {
      matches.push({ project, score: bestName[0], matched: { field: "name", text: bestName[1] } });
      continue;
    }

    const prose = [project.description, ...project.tags, project.category]
      .find((value) => typeof value === "string" && normalizeForMatch(value).includes(trimmed));
    if (prose) {
      matches.push({ project, score: 2, matched: { field: "summary", text: prose } });
      continue;
    }

    if (slug.includes(trimmed)) {
      matches.push({ project, score: 1, matched: { field: "id", text: project.slug } });
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.project.updatedAt.getTime() - a.project.updatedAt.getTime();
  });

  return { results: matches.slice(0, limit), total: matches.length };
}
