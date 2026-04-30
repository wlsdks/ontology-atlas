import type { Project } from "./types";

export type ProjectIntegrityIssue =
  | { code: "missing-category"; categoryId: string }
  | { code: "missing-status"; statusId: string }
  | { code: "missing-dependency"; dependencySlug: string }
  | { code: "duplicate-dependency"; dependencySlug: string };

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

  if (!categoryIds.has(project.category)) {
    issues.push({
      code: "missing-category",
      categoryId: project.category,
    });
  }

  if (!statusIds.has(project.status)) {
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
      return `카테고리 없음: ${issue.categoryId}`;
    case "missing-status":
      return `상태 없음: ${issue.statusId}`;
    case "missing-dependency":
      return `의존성 누락: ${issue.dependencySlug}`;
    case "duplicate-dependency":
      return `의존성 중복: ${issue.dependencySlug}`;
  }
}

