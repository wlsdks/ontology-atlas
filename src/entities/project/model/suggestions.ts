import type { Project } from "./types";

export interface SuggestedDependency {
  slug: string;
  name: string;
  /** A short excerpt showing why the match fired. */
  excerpt: string;
}

const MIN_NAME_LENGTH = 3;
const EXCERPT_HALF_WINDOW = 28;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiAlphaNumeric(value: string): boolean {
  return /^[\x20-\x7e]+$/.test(value);
}

function findMatchIndex(haystack: string, needle: string): number {
  const trimmed = needle.trim();
  if (trimmed.length < MIN_NAME_LENGTH) return -1;
  // ASCII-only names match on word boundaries; Korean or mixed names match by containment.
  if (isAsciiAlphaNumeric(trimmed)) {
    const regex = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i");
    const match = regex.exec(haystack);
    return match?.index ?? -1;
  }
  return haystack.indexOf(trimmed);
}

function extractExcerpt(corpus: string, index: number, needleLength: number): string {
  const start = Math.max(0, index - EXCERPT_HALF_WINDOW);
  const end = Math.min(corpus.length, index + needleLength + EXCERPT_HALF_WINDOW);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < corpus.length ? "…" : "";
  return `${prefix}${corpus.slice(start, end).trim()}${suffix}`;
}

/**
 * Finds other projects whose name (or English name) is mentioned verbatim in this
 * project's description/detail, and returns them as dependency suggestions.
 *
 * Rules:
 * - excludes itself and any slug already in `dependencies`
 * - skips names shorter than three characters, which produce false hits (AI, UI)
 * - ASCII names match on word boundaries so they do not match inside a longer word;
 *   names containing Korean match by containment
 * - deduplicates by slug, returning only the first match
 */
export function computeSuggestedDependencies(
  current: Pick<Project, "slug" | "dependencies" | "description" | "detail">,
  candidates: readonly Project[],
): SuggestedDependency[] {
  const corpus = `${current.description ?? ""}\n${current.detail ?? ""}`;
  if (!corpus.trim()) return [];

  const excluded = new Set<string>([current.slug, ...current.dependencies]);
  const seen = new Set<string>();
  const suggestions: SuggestedDependency[] = [];

  for (const candidate of candidates) {
    if (excluded.has(candidate.slug) || seen.has(candidate.slug)) continue;

    const namesToTry = [candidate.name, candidate.nameEn].filter(
      (name): name is string => typeof name === "string" && name.trim().length > 0,
    );

    let bestIndex = -1;
    let matchedName = "";
    for (const name of namesToTry) {
      const index = findMatchIndex(corpus, name);
      if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
        bestIndex = index;
        matchedName = name;
      }
    }

    if (bestIndex < 0) continue;

    seen.add(candidate.slug);
    suggestions.push({
      slug: candidate.slug,
      name: candidate.name,
      excerpt: extractExcerpt(corpus, bestIndex, matchedName.length),
    });
  }

  return suggestions;
}
