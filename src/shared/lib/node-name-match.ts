/**
 * The one rule for matching a node — however many search surfaces exist, the
 * contract "type what you see on screen and it is found" must be single. Names are
 * the subject of most of this file; {@link idSearchText} owns the id half.
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
  /**
   * The same names as written, index for index. A result row has to be able to
   * **show** the name that carried the match, and the normalised form is
   * lowercased, so the original is kept beside it.
   */
  readonly raw: readonly string[];
  /** The same names reduced to syllable initials, spaces dropped — what a chosung query is compared against. */
  readonly chosung: readonly string[];
}

const NAME_INDEX = new WeakMap<NodeNameSource, NodeNameIndex>();

function nodeNameIndex(node: NodeNameSource): NodeNameIndex {
  const cached = NAME_INDEX.get(node);
  if (cached) return cached;
  const names: string[] = [];
  const raw: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    if (!value) return;
    const key = normalizeForMatch(value);
    if (key === "" || seen.has(key)) return;
    seen.add(key);
    names.push(key);
    raw.push(value.trim());
  };
  push(node.title);
  push(node.display);
  for (const value of Object.values(node.displayLocales ?? {})) push(value);
  const index: NodeNameIndex = { names, raw, chosung: names.map(chosungKey) };
  NAME_INDEX.set(node, index);
  return index;
}

/**
 * How strongly a name matched, strongest first. The ladder the palette scores on
 * is built from this, so the order is the contract: a name that really contains
 * what was typed beats one the Hangul rules had to reach for.
 */
const NAME_MATCH_TIERS = [
  "equals",
  "prefix",
  "includes",
  "hangul-prefix",
  "hangul-includes",
] as const;

export type NameMatchTier = (typeof NAME_MATCH_TIERS)[number];

/** Which name matched, and how. */
export interface NameMatch {
  /** The name as written — what a result row shows when it is not the one already on screen. */
  readonly name: string;
  readonly tier: NameMatchTier;
}

/**
 * The best match across every name this node answers to, in one pass.
 *
 * **Why one call rather than the five booleans above.** A search result that gives
 * no sign of why it is in the list reads as a broken search. Measured on the bundled
 * sample, 2026-09-19: 30.6% of result rows over thirty English queries carried no
 * highlight at all, and a large share of those had matched a name the screen was not
 * showing — the canonical `title`, or another locale's display name. Matching was
 * widened to every name (that is this file's whole reason), but the row was never
 * widened with it. Returning *which* name matched is what lets the row say so.
 *
 * It is also cheaper: the tier questions used to walk the name list up to five times.
 */
export function findNameMatch(node: NodeNameSource, normalizedQuery: string): NameMatch | null {
  if (normalizedQuery === "") return null;
  const { names, raw, chosung } = nodeNameIndex(node);
  const chosungMode = isChosungQuery(normalizedQuery);
  const chosungNeedle = chosungMode ? normalizedQuery.replace(/ /g, "") : "";
  let best: NameMatch | null = null;
  let bestRank: number = NAME_MATCH_TIERS.length;

  const consider = (index: number, tier: NameMatchTier) => {
    const rank = NAME_MATCH_TIERS.indexOf(tier);
    if (rank >= bestRank) return;
    bestRank = rank;
    best = { name: raw[index] ?? names[index] ?? "", tier };
  };

  for (let i = 0; i < names.length; i += 1) {
    const name = names[i] ?? "";
    if (name === normalizedQuery) {
      consider(i, "equals");
      break; // Nothing outranks an exact match.
    }
    if (name.startsWith(normalizedQuery)) {
      consider(i, "prefix");
      continue;
    }
    if (name.includes(normalizedQuery)) {
      consider(i, "includes");
      continue;
    }
    if (chosungMode) {
      const initials = chosung[i] ?? "";
      if (initials.startsWith(chosungNeedle)) consider(i, "hangul-prefix");
      else if (initials.includes(chosungNeedle)) consider(i, "hangul-includes");
      continue;
    }
    if (hangulStartsWith(name, normalizedQuery)) consider(i, "hangul-prefix");
    else if (hangulIncludes(name, normalizedQuery)) consider(i, "hangul-includes");
  }

  return best;
}

/**
 * The part of an id a query is allowed to match, or null when nothing is.
 *
 * Node ids are `<kind>:<slug>`. The kind half is not meaning anybody searched for —
 * every element carries it — so only the slug is offered. Measured 2026-09-19 on the
 * bundled sample: typing the word "element" returned twenty palette rows and every
 * one of them was that prefix. A query containing a colon is someone pasting a real
 * id, and for that the whole id answers.
 *
 * It lives here rather than beside the palette because the map's INDEX filter and the
 * docs tree ask the same question, and a person typing into one of the three boxes on
 * a screen should not get three different answers.
 */
export function idSearchText(id: string, normalizedQuery: string): string | null {
  if (normalizedQuery.includes(":")) return id;
  const separator = id.indexOf(":");
  if (separator === -1) return id;
  const slug = id.slice(separator + 1);
  return slug === "" ? null : slug;
}
