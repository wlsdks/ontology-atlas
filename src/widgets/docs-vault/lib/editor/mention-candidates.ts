import type { VaultDoc } from '@/entities/docs-vault';

const MENTION_CANDIDATE_LIMIT = 8;

/**
 * The documents an `@` mention offers: the first few for a bare `@`, else those whose title or
 * slug contains the query. The document being edited is never offered.
 */
export function matchMentionCandidates(
  allDocs: readonly VaultDoc[],
  query: string,
  editingSlug: string,
): VaultDoc[] {
  const q = query.toLowerCase();
  if (!q) return allDocs.filter((d) => d.slug !== editingSlug).slice(0, MENTION_CANDIDATE_LIMIT);
  return allDocs
    .filter(
      (d) =>
        d.slug !== editingSlug &&
        (d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q)),
    )
    .slice(0, MENTION_CANDIDATE_LIMIT);
}

/** The next index in a list that wraps at both ends; `step` is 1 or -1. */
export function cycleIndex(index: number, step: 1 | -1, length: number): number {
  return (index + step + length) % length;
}
