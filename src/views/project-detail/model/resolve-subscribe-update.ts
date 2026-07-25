import type { Project } from "@/entities/project";

export interface SubscribeUpdate {
  /** 현재 slug 를 찾은 경우에만 set. 못 찾으면 null 로 "이전 project 유지" 신호. */
  next: Project | null;
  /** related 리스트 업데이트용 — 빈 배열이면 fallback 으로 치환. */
  related: Project[];
}

/**
 * ProjectDetailPage 의 subscribeProjects 콜백이 initialProject /
 * fallbackProject 를 null 로 덮어쓰지 않도록 하는 invariant 헬퍼.
 *
 * 공개 `/project/[slug]/` 는 빌드 타임 static HTML 이라 initialProject 가
 * 이미 있다. 사용자의 subscribe 가 해당 slug 를 못 담은 리스트를 돌려줄 때
 * `latest.find(slug) ?? null` 결과로 setProject(null) 하면 하이드레이션
 * 직후 "프로젝트를 찾을 수 없음" 으로 붕괴한다.
 *
 * 규칙: "찾았을 때만 갱신, 모르면 아무 것도 안 함".
 */
export function resolveSubscribeUpdate(latest: Project[], slug: string): SubscribeUpdate {
  // #74 — 정적 모드 fallback 은 제거됐다. 없는 제품을 설명하는 시드 데이터를
  // 보여주느니 "이 프로젝트가 없다" 고 말하는 편이 정직하다. 호출부의
  // not-found 상태가 그 역할을 한다.
  const next = latest.find((p) => p.slug === slug) ?? null;
  return { next, related: latest };
}
