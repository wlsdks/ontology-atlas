import type { Project } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DetectStaleOptions {
  /** 기준 "지금" — 테스트 주입용. 런타임에선 new Date(). */
  now: Date;
  /** 이 일수를 초과(strict `>`) 해야 stale 로 판정. */
  daysThreshold: number;
  /** 상위 N개로 잘라 반환. 미지정 시 전체. */
  limit?: number;
}

/**
 * 정한 일수 이상 수정되지 않은 프로젝트를 가장 오래된 것부터 반환한다.
 * "수리 대기 목록" 시각화용.
 */
export function detectStaleProjects(
  projects: readonly Project[],
  { now, daysThreshold, limit }: DetectStaleOptions,
): Project[] {
  const stale = projects.filter((project) => {
    const ageMs = now.getTime() - project.updatedAt.getTime();
    return ageMs > daysThreshold * MS_PER_DAY;
  });
  stale.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  return typeof limit === "number" ? stale.slice(0, limit) : stale;
}

/**
 * 들어오는 참조도 나가는 의존도 모두 0 인 "고립" 프로젝트를 반환한다.
 * 허브는 허브 자체로 의미가 있으니 제외. 이름순 정렬.
 */
export function detectOrphanProjects(projects: readonly Project[]): Project[] {
  const referencedSlugs = new Set<string>();
  for (const project of projects) {
    for (const dep of project.dependencies) {
      referencedSlugs.add(dep);
    }
  }

  const orphans = projects.filter((project) => {
    if (project.isHub) return false;
    if (project.dependencies.length > 0) return false;
    if (referencedSlugs.has(project.slug)) return false;
    return true;
  });

  orphans.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return orphans;
}

export interface DetectPromotionOptions {
  /** isHub=false 인 프로젝트가 이 수 이상 참조되면 허브 승격 후보. */
  minFanIn: number;
  /** 상위 N개만. 미지정 시 전체. */
  limit?: number;
}

export interface PromotionCandidate extends Project {
  fanIn: number;
}

/**
 * 비허브인데 실질적으로 많이 참조되고 있는 노드 — `isHub` 플래그를 빠뜨렸을
 * 가능성이 큰 승격 후보. fan-in 내림차순 정렬.
 */
export function detectPromotionCandidates(
  projects: readonly Project[],
  { minFanIn, limit }: DetectPromotionOptions,
): PromotionCandidate[] {
  const fanInBySlug = new Map<string, number>();
  for (const project of projects) {
    for (const dep of project.dependencies) {
      fanInBySlug.set(dep, (fanInBySlug.get(dep) ?? 0) + 1);
    }
  }

  const candidates: PromotionCandidate[] = projects
    .filter((project) => !project.isHub)
    .map((project) => ({ ...project, fanIn: fanInBySlug.get(project.slug) ?? 0 }))
    .filter((project) => project.fanIn >= minFanIn);

  candidates.sort((a, b) => b.fanIn - a.fanIn);
  return typeof limit === "number" ? candidates.slice(0, limit) : candidates;
}
