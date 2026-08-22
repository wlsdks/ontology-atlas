import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

/**
 * Extracts just the body from a raw project.md file (frontmatter included).
 *
 * Why it exists: the "body" card on `/project/[slug]` must show project.md's
 * markdown body, but `Project.detail` reads only the explicit frontmatter `detail:`
 * key (a separate editor-form field that `project-frontmatter.ts` round-trips). Real
 * vault documents almost always write their content in the body with no `detail:`,
 * so the body card always looked empty.
 *
 * Display only. Assigning the return value to `Project.detail` makes the editor form
 * mistake the whole body for the "detail" field and duplicate it into frontmatter on
 * save — the caller must keep it in a separate field (see `useProjectBody` in
 * project-data-source).
 */
export function extractProjectBody(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const body = parseFrontmatter(raw).body.trim();
  return body.length > 0 ? body : undefined;
}
