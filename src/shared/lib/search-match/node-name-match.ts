/**
 * The one rule for matching a node on every search surface: "type what you see and it is found".
 * Every `display_<locale>` widens a match on `title` and never replaces it. NFC first: Hangul
 * arrives decomposed from macOS file names and the clipboard.
 */

import { chosungKey, hangulIncludes, hangulStartsWith, isChosungQuery } from "./hangul-match";

/** Pre-match normalisation — the same function runs over the query and the haystack. */
export function normalizeForMatch(value: string): string {
  return value.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

export interface NodeNameSource {
  title: string;
  display?: string;
  /** Every raw `display_<locale>` — all searchable regardless of screen language. */
  displayLocales?: Readonly<Record<string, string>>;
}

/**
 * Cached per node in a `WeakMap` so a keystroke re-normalises no name (12,000 nodes cost hundreds
 * of ms per character otherwise). Assumes a reload replaces nodes rather than mutating them.
 */
interface NodeNameIndex {
  /** Normalised names, canonical title first. */
  readonly names: readonly string[];
  /** As written, index for index: a result row shows the name that matched. */
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

/** Strongest first; the palette's ladder follows this order. */
const NAME_MATCH_TIERS = [
  "equals",
  "prefix",
  "includes",
  "hangul-prefix",
  "hangul-includes",
] as const;

export type NameMatchTier = (typeof NAME_MATCH_TIERS)[number];

/** The palette score each tier earns, one ladder for concepts and projects. */
export const NAME_TIER_SCORE: Readonly<Record<NameMatchTier, number>> = {
  equals: 7,
  prefix: 6,
  includes: 5,
  "hangul-prefix": 4,
  "hangul-includes": 3,
};

export interface NameMatch {
  /** The name as written — what a result row shows when it is not the one already on screen. */
  readonly name: string;
  readonly tier: NameMatchTier;
}

/**
 * The best match across every name this node answers to, with which name matched so the row can
 * show why it is in the list.
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
 * The part of an id a query may match: only the slug, since every element carries the kind prefix.
 * A query with a colon matches the whole id. Shared by palette, map INDEX and docs tree.
 */
export function idSearchText(id: string, normalizedQuery: string): string | null {
  if (normalizedQuery.includes(":")) return id;
  const separator = id.indexOf(":");
  if (separator === -1) return id;
  const slug = id.slice(separator + 1);
  return slug === "" ? null : slug;
}
