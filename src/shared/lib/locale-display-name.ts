/**
 * The name a document is called in the current UI language — the single rule for resolving
 * `display_<locale>`.
 *
 * Why it was needed: the map popover read `내 프로젝트` while the docs quick search read
 * `My project` — same session, same document, two names (measured 2026-07-26). The graph side
 * already resolved `display_<locale>` in `derivationToInsight`, but the document-list surfaces
 * rendered the canonical `title` as-is. With two copies of the rule, that mismatch returns
 * every time a surface is added.
 *
 * Contract (AGENTS.md): `title` is the single source of truth for search and matching and
 * does not change. A display name is **for rendering only** — never use this function for
 * matching. Matching belongs to `shared/lib/node-name-match`, which considers both the title
 * and the display names as candidates.
 */

/** Collects only `display_` keys followed by a two-letter locale, e.g. `display_ko:`. */
export function readDisplayLocales(
  frontmatter: Record<string, unknown> | null | undefined,
): Record<string, string> | undefined {
  if (!frontmatter) return undefined;
  let out: Record<string, string> | undefined;
  for (const [key, value] of Object.entries(frontmatter)) {
    const match = /^display_([a-z]{2})$/.exec(key);
    if (!match || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    (out ??= {})[match[1]] = trimmed;
  }
  return out;
}

/**
 * What to call this document in the current UI language: `display_<locale>` when present,
 * otherwise the fallback as given (usually the canonical title). A name that does not exist
 * is never invented.
 */
export function resolveLocaleDisplayName(
  frontmatter: Record<string, unknown> | null | undefined,
  locale: string | undefined,
  fallback: string,
): string {
  if (!locale) return fallback;
  const localized = readDisplayLocales(frontmatter)?.[locale];
  return localized ?? fallback;
}
