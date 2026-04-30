import type { Project } from './types';

/**
 * 프로젝트 배열에서 허브로 표시된 프로젝트의 slug 배열을 뽑아낸다.
 * 이전의 HUB_SLUGS 하드코딩 상수를 대체 — isHub 플래그에서 런타임 계산.
 */
export function computeHubSlugs(projects: Project[]): string[] {
  return projects.filter((p) => p.isHub).map((p) => p.slug);
}

/**
 * 주어진 의존성 배열이 두 개 이상의 허브에 의존하는지 — SHARED 배지 판정.
 * 호출자는 현재 프로젝트 목록에서 계산한 hubSlugs를 넘겨야 한다.
 */
export function isSharedNode(dependencies: string[], hubSlugs: string[]): boolean {
  const matched = hubSlugs.filter((h) => dependencies.includes(h));
  return matched.length >= 2;
}
