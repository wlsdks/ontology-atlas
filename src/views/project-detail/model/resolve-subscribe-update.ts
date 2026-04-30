import type { Project } from "@/entities/project";

export interface SubscribeUpdate {
  /** 현재 slug 를 찾은 경우에만 set. 못 찾으면 null 로 "이전 project 유지" 신호. */
  next: Project | null;
  /** related 리스트 업데이트용 — 빈 배열이면 fallback 으로 치환. */
  related: Project[];
}

/**
 * ProjectDetailPage 의 subscribeProjects 콜백이 initialProject/fallbackProject
 * 를 null 로 덮어쓰지 않도록 하는 invariant 를 담은 순수 헬퍼.
 *
 * 배경 (iter 16 회귀 방지):
 * 공개 `/project/[slug]/` 는 빌드 타임에 seed 데이터로 static HTML 이 생성돼
 * initialProject 가 이미 있다. 사용자의 subscribe 가 (비로그인·데모 세션 등의
 * 이유로) 해당 slug 를 못 담은 리스트를 돌려줄 때 `latest.find(slug) ?? null`
 * 결과로 setProject(null) 하면 정적 HTML 이 클라이언트 하이드레이션 직후
 * "프로젝트를 찾을 수 없음" 으로 붕괴한다.
 *
 * 규칙: "찾았을 때만 갱신, 모르면 아무 것도 안 함".
 */
export function resolveSubscribeUpdate(
  latest: Project[],
  slug: string,
  fallbackProjects: Project[],
): SubscribeUpdate {
  const related = latest.length > 0 ? latest : fallbackProjects;
  const next = related.find((p) => p.slug === slug) ?? null;
  return { next, related };
}
