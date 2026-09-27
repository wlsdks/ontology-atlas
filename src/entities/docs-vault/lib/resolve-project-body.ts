import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

/**
 * The markdown body of a raw project.md, for display only. Keep it out of `Project.detail`, or the
 * editor would save the whole body into frontmatter (see `useProjectBody`).
 */
export function extractProjectBody(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const body = parseFrontmatter(raw).body.trim();
  return body.length > 0 ? body : undefined;
}
