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
 * Every name that refers to this node — the canonical title plus display names
 * (current locale and all locales). Duplicates and empties removed; the
 * canonical title is always first.
 */
export function nodeNameCandidates(node: NodeNameSource): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed === "") return;
    const key = normalizeForMatch(trimmed);
    if (key === "" || seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  push(node.title);
  push(node.display);
  for (const value of Object.values(node.displayLocales ?? {})) push(value);
  return out;
}

/** Does any name equal the query exactly (takes an already-normalised query). */
export function nameEquals(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameCandidates(node).some((name) => normalizeForMatch(name) === normalizedQuery);
}

/** Does any name start with the query (takes an already-normalised query). */
export function nameStartsWith(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameCandidates(node).some((name) => normalizeForMatch(name).startsWith(normalizedQuery));
}

/** Does any name contain the query (takes an already-normalised query). */
export function nameIncludes(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameCandidates(node).some((name) => normalizeForMatch(name).includes(normalizedQuery));
}
