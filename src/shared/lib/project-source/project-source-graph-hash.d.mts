export interface ProjectSourceGraphDoc {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

export function buildProjectSourceGraphHash(
  projectSlug: string,
  docs: readonly ProjectSourceGraphDoc[],
): string;
