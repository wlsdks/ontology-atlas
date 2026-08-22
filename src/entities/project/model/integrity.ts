import type { Project } from "./types";

export type ProjectIntegrityIssue =
  | { code: "missing-category"; categoryId: string }
  | { code: "missing-status"; statusId: string }
  | { code: "missing-dependency"; dependencySlug: string }
  | { code: "duplicate-dependency"; dependencySlug: string };

// Silent fallback values from `deriveProjectsFromVault`, filled in automatically when
// frontmatter is missing. Flagging them as an integrity problem would show the user a
// contradiction ("no category: uncategorized"), since these mean "unclassified" and
// "active" — normal states.
const SILENT_CATEGORY_FALLBACKS = new Set(["uncategorized"]);
const SILENT_STATUS_FALLBACKS = new Set(["active"]);

export function getProjectIntegrityIssues(
  project: Project,
  options: {
    allProjects: Project[];
    categoryIds: Iterable<string>;
    statusIds: Iterable<string>;
  },
): ProjectIntegrityIssue[] {
  const categoryIds = new Set(options.categoryIds);
  const statusIds = new Set(options.statusIds);
  const projectSlugs = new Set(options.allProjects.map((item) => item.slug));
  const issues: ProjectIntegrityIssue[] = [];

  // Frontmatter that does not state category/status yields undefined, and that is
  // *not* an integrity issue — the user chose to leave it out. It becomes an issue
  // only when a value is stated but is not in the taxonomy (a typo, or a removed term).
  if (
    project.category &&
    !categoryIds.has(project.category) &&
    !SILENT_CATEGORY_FALLBACKS.has(project.category)
  ) {
    issues.push({
      code: "missing-category",
      categoryId: project.category,
    });
  }

  if (
    project.status &&
    !statusIds.has(project.status) &&
    !SILENT_STATUS_FALLBACKS.has(project.status)
  ) {
    issues.push({
      code: "missing-status",
      statusId: project.status,
    });
  }

  const seenDependencies = new Set<string>();
  for (const dependencySlug of project.dependencies) {
    if (seenDependencies.has(dependencySlug)) {
      issues.push({
        code: "duplicate-dependency",
        dependencySlug,
      });
      continue;
    }
    seenDependencies.add(dependencySlug);

    if (!projectSlugs.has(dependencySlug)) {
      issues.push({
        code: "missing-dependency",
        dependencySlug,
      });
    }
  }

  return issues;
}

export function formatProjectIntegrityIssue(issue: ProjectIntegrityIssue): string {
  switch (issue.code) {
    case "missing-category":
      return `분류 사전에 없는 카테고리: ${issue.categoryId}`;
    case "missing-status":
      return `분류 사전에 없는 상태: ${issue.statusId}`;
    case "missing-dependency":
      return `의존성 누락: ${issue.dependencySlug}`;
    case "duplicate-dependency":
      return `의존성 중복: ${issue.dependencySlug}`;
  }
}

