import { isArchitectureProfile } from '../lib/docs-vault-collection';

export /** An architecture profile is never the unattended first document (`a11y-vault-backed.spec.ts`). */
function firstReadableSlug<T extends { slug: string; frontmatter: Record<string, unknown> }>(
  docs: readonly T[],
): string | undefined {
  // No fallback to `docs[0]`; callers handle "no document".
  return docs.find((doc) => !isArchitectureProfile(doc))?.slug;
}
