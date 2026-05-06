import {
  collectProjectConnectedClosure,
  collectProjectDependencyClosure,
  collectProjectDependentClosure,
} from "./dependencies";
import type { Project } from "./types";

export type ProjectImpactMode = "none" | "upstream" | "downstream" | "network";

export interface ProjectImpactInsight {
  mode: ProjectImpactMode;
  highlightedSlugs: string[];
  highlightedEdgeIds: string[];
  relatedCount: number;
}

export interface ProjectCompletenessInsight {
  score: number;
  completedCount: number;
  totalCount: number;
  missingFields: string[];
  prompts: string[];
}

export interface ProjectFreshnessInsight {
  level: "fresh" | "active" | "stale";
  label: string;
  ageDays: number;
}

const COMPLETENESS_FIELDS = [
  {
    key: "description",
    label: "short description",
    filled: (project: Project) => project.description.trim().length > 0,
    prompt: "짧은 설명을 채워 노드와 드로어 첫인상을 정리하세요.",
  },
  {
    key: "detail",
    label: "detail",
    filled: (project: Project) => (project.detail?.trim().length ?? 0) > 0,
    prompt: "detail 본문을 채워 서비스 소개를 더 깊게 설명하세요.",
  },
  {
    key: "screenshots",
    label: "screenshots",
    filled: (project: Project) => project.screenshots.length > 0,
    prompt: "스크린샷을 추가해 시각적 이해를 높이세요.",
  },
  {
    key: "links",
    label: "links",
    filled: (project: Project) => project.links.length > 0,
    prompt: "대표 링크를 연결해 바로 이동할 수 있게 하세요.",
  },
  {
    key: "owner",
    label: "owner",
    filled: (project: Project) => (project.owner?.trim().length ?? 0) > 0,
    prompt: "담당자를 넣어 운영 주체를 명확히 하세요.",
  },
  {
    key: "timeline",
    label: "timeline",
    filled: (project: Project) =>
      Boolean(project.timeline?.startedAt || project.timeline?.launchedAt),
    prompt: "시작일이나 출시일을 입력해 시간축 맥락을 보강하세요.",
  },
  {
    key: "tags",
    label: "tags",
    filled: (project: Project) => project.tags.length > 0,
    prompt: "태그를 보강해 검색성과 분류 가독성을 높이세요.",
  },
  {
    key: "stack",
    label: "stack",
    filled: (project: Project) => project.stack.length > 0,
    prompt: "기술 스택을 적어 구현 맥락을 드러내세요.",
  },
] as const;

export function resolveProjectImpactInsight(
  projects: Project[],
  selectedSlug: string | null,
  mode: ProjectImpactMode,
): ProjectImpactInsight {
  if (!selectedSlug || mode === "none") {
    return {
      mode,
      highlightedSlugs: [],
      highlightedEdgeIds: [],
      relatedCount: 0,
    };
  }

  const highlightedProjects =
    mode === "upstream"
      ? collectProjectDependencyClosure(projects, [selectedSlug])
      : mode === "downstream"
        ? collectProjectDependentClosure(projects, [selectedSlug])
        : collectProjectConnectedClosure(projects, [selectedSlug]);

  const highlightedSet = new Set(highlightedProjects.map((project) => project.slug));
  const highlightedEdgeIds: string[] = [];

  for (const project of projects) {
    if (!highlightedSet.has(project.slug)) continue;

    for (const dependency of project.dependencies) {
      if (!highlightedSet.has(dependency)) continue;
      highlightedEdgeIds.push(`${project.slug}->${dependency}`);
    }
  }

  return {
    mode,
    highlightedSlugs: [...highlightedSet],
    highlightedEdgeIds,
    relatedCount: Math.max(0, highlightedSet.size - 1),
  };
}

export function resolveProjectCompletenessInsight(
  project: Project,
): ProjectCompletenessInsight {
  const missingFields = COMPLETENESS_FIELDS.filter(
    (field) => !field.filled(project),
  );
  const completedCount = COMPLETENESS_FIELDS.length - missingFields.length;

  return {
    score: Math.round((completedCount / COMPLETENESS_FIELDS.length) * 100),
    completedCount,
    totalCount: COMPLETENESS_FIELDS.length,
    missingFields: missingFields.map((field) => field.label),
    prompts: missingFields.map((field) => field.prompt),
  };
}

export function resolveProjectFreshnessInsight(
  project: Project,
  now = new Date(),
): ProjectFreshnessInsight {
  const ageMs = Math.max(0, now.getTime() - project.updatedAt.getTime());
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays <= 7) {
    return { level: "fresh", label: "이번 주 업데이트", ageDays };
  }

  if (ageDays <= 30) {
    return { level: "active", label: "이번 달 업데이트", ageDays };
  }

  return { level: "stale", label: "업데이트 권장", ageDays };
}

export function isProjectRecentlyUpdated(
  project: Project,
  days: number,
  now = new Date(),
): boolean {
  const ageMs = Math.max(0, now.getTime() - project.updatedAt.getTime());
  return ageMs <= days * 24 * 60 * 60 * 1000;
}
