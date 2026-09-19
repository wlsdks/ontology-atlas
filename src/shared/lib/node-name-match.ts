/**
 * The one rule for matching node names — however many search surfaces exist, the
 * contract "type the name you see on screen and it is found" must be single.
 *
 * **Why it was needed:** the map, INDEX, popovers and the studio all draw
 * locale-specific display names (frontmatter `display_ko:` / `display_en:`)
 * while global search indexed only the canonical `title`. So reading
 * "Ontology Core" on a Korean screen and searching for it returned 0 results;
 * only the original "Ontology Core", which the user had never seen, worked. The
 * studio picker did look at display names, so the two search surfaces even
 * behaved differently.
 *
 * The contract (`AGENTS.md`): `title` is the single source of truth for search
 * and matching. Display names **add to it rather than replace it** — they only
 * widen the match, so anyone searching by the original still finds it. Every
 * locale the vault uses is included because an English name must be findable on
 * a Korean screen and vice versa.
 *
 * Normalisation: NFC → lowercase → trim → collapse runs of whitespace. NFC
 * matters because Hangul can arrive decomposed (NFD) from local vault filenames
 * and the macOS clipboard.
 */

import { chosungKey, hangulIncludes, hangulStartsWith, isChosungQuery } from "./hangul-match";

/** Pre-match normalisation — the same function runs over the query and the haystack. */
export function normalizeForMatch(value: string): string {
  return value.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

/** The minimum shape of a named node — satisfied by graph nodes and picker candidates alike. */
export interface NodeNameSource {
  /** The canonical title from frontmatter — the single source of truth for search and matching. */
  title: string;
  /** The display name resolved for the current locale, if any. */
  display?: string;
  /** Every raw `display_<locale>` — all searchable regardless of screen language. */
  displayLocales?: Readonly<Record<string, string>>;
}

/**
 * Every name that refers to this node, already normalised, plus the initials of
 * each one — the canonical title first, then the display names, duplicates and
 * empties removed.
 *
 * **Built once per node and kept.** Each question below used to rebuild this list
 * and re-normalise every name, so one keystroke ran NFC + lowercase + a whitespace
 * regex three to five times per node. Measured 2026-09-19 over 12,000 nodes, best of
 * five: a plain query cost 243 ms and a half-typed Hangul one 358 ms — a palette that
 * stalls for a third of a second on every character. With the index cached the same
 * two cost 29.8 ms and 30.0 ms, and a chosung query 14.3 ms.
 * `node-name-match.perf.test.ts` holds the ratio against a rebuild-every-time baseline.
 *
 * The cache is a `WeakMap` on the node object, so it costs nothing to hold and
 * disappears with the graph. It assumes nodes are **replaced** rather than mutated
 * in place when a vault reloads, which is how `entities/knowledge-graph` builds them.
 */
interface NodeNameIndex {
  /** Normalised names, canonical title first. */
  readonly names: readonly string[];
  /** The same names reduced to syllable initials, spaces dropped — what a chosung query is compared against. */
  readonly chosung: readonly string[];
}

const NAME_INDEX = new WeakMap<NodeNameSource, NodeNameIndex>();

function nodeNameIndex(node: NodeNameSource): NodeNameIndex {
  const cached = NAME_INDEX.get(node);
  if (cached) return cached;
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    if (!value) return;
    const key = normalizeForMatch(value);
    if (key === "" || seen.has(key)) return;
    seen.add(key);
    names.push(key);
  };
  push(node.title);
  push(node.display);
  for (const value of Object.values(node.displayLocales ?? {})) push(value);
  const index: NodeNameIndex = { names, chosung: names.map(chosungKey) };
  NAME_INDEX.set(node, index);
  return index;
}

/** Does any name equal the query exactly (takes an already-normalised query). */
export function nameEquals(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameIndex(node).names.some((name) => name === normalizedQuery);
}

/** Does any name start with the query (takes an already-normalised query). */
export function nameStartsWith(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameIndex(node).names.some((name) => name.startsWith(normalizedQuery));
}

/** Does any name contain the query (takes an already-normalised query). */
export function nameIncludes(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameIndex(node).names.some((name) => name.includes(normalizedQuery));
}

/**
 * The same two questions, asked the way a Hangul keyboard writes a query:
 * consonant initials alone, and the half-typed syllable every Korean word passes
 * through. `shared/lib/hangul-match` owns the rule, says why it is bounded to those
 * two states, and its test file carries the worked examples.
 *
 * These **widen** the match, exactly as display names do; they never replace a
 * literal one. Rank them below the literal tier so a name that really contains
 * what was typed still wins.
 */
export function nameHangulStartsWith(node: NodeNameSource, normalizedQuery: string): boolean {
  const { names, chosung } = nodeNameIndex(node);
  if (isChosungQuery(normalizedQuery)) {
    const key = normalizedQuery.replace(/ /g, "");
    return chosung.some((initials) => initials.startsWith(key));
  }
  return names.some((name) => hangulStartsWith(name, normalizedQuery));
}

/** Does any name contain the query, read the Hangul-aware way. */
export function nameHangulIncludes(node: NodeNameSource, normalizedQuery: string): boolean {
  const { names, chosung } = nodeNameIndex(node);
  if (isChosungQuery(normalizedQuery)) {
    const key = normalizedQuery.replace(/ /g, "");
    return chosung.some((initials) => initials.includes(key));
  }
  return names.some((name) => hangulIncludes(name, normalizedQuery));
}
