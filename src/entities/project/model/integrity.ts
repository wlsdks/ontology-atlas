import type { Project } from "./types";

export type ProjectIntegrityIssue =
  | { code: "missing-category"; categoryId: string }
  | { code: "missing-status"; statusId: string }
  | { code: "missing-dependency"; dependencySlug: string }
  | { code: "duplicate-dependency"; dependencySlug: string };

// deriveProjectsFromVault 의 silent fallback 값 — frontmatter 누락 시
// 자동 채워지는 default 라 'integrity 점검 필요' 로 잡으면 사용자에게
// 모순 (' 카테고리 없음: uncategorized' 같은) 으로 보임. 이 값들은
// '분류 안 함' / '활성' 의미라 정상 상태로 취급.
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

  // R15 (Concern 1) — vault frontmatter 가 category/status 명시 안 했으면
  // undefined. 그건 *integrity issue 아님* — 사용자가 의도적으로 선택. 명시
  // 됐는데 taxonomy 에 없으면 issue (오타 / removed taxonomy).
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

