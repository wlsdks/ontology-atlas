/**
 * 프로젝트 상세 탭 계약 (#87, fable 설계 PR-1).
 *
 * ## 왜 탭인가
 *
 * 상세가 단일 스크롤 덤프였다 — 히어로 → 도메인 구성 → **project.md 전문**
 * (dogfood 기준 수천 px) → 연결/핸드오프 → 푸터. 소유자: *"스크롤로 모든거
 * 보여주려 안해도 되니까?"*
 *
 * 탭은 "정보 종류" 가 아니라 **답하는 질문**으로 가른다:
 *
 * - `overview` — 이 프로젝트가 **무엇인가** (project.md 본문)
 * - `composition` — **무엇으로 이루어졌나** (미니 지도 + 도메인 구성)
 *
 * ## 왜 URL 인가
 *
 * 이 앱은 세션 상태를 URL 에 둔다(`?p=` · `?realm=` · `?open=` · `?recent=`).
 * 이유가 둘: **공유 가능**하고 **에이전트가 읽고 재현**할 수 있다. 탭을 숨은
 * 상태로 두면 핸드오프 패킷에 "어느 탭을 보던 중" 이 빠진다.
 *
 * 기본 탭은 파라미터를 **생략**한다 — `?tab=overview` 는 없어도 될 소음이고,
 * 공유 링크가 짧을수록 붙여넣기가 쉽다.
 */

export const PROJECT_DETAIL_TABS = ["overview", "composition"] as const;

export type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number];

export const DEFAULT_PROJECT_DETAIL_TAB: ProjectDetailTab = "overview";

/**
 * `?tab=` 을 탭으로 해석한다. 모르는 값·없음은 기본 탭 — **에러가 아니다.**
 * 낡은 링크나 오타가 화면을 막으면 안 된다(공유 링크는 남의 손에서 편집된다).
 */
export function parseProjectDetailTab(raw: string | null | undefined): ProjectDetailTab {
  if (!raw) return DEFAULT_PROJECT_DETAIL_TAB;
  const found = PROJECT_DETAIL_TABS.find((tab) => tab === raw);
  return found ?? DEFAULT_PROJECT_DETAIL_TAB;
}

/**
 * 탭을 URL 쿼리로 직렬화한다. 기본 탭이면 `null` — 호출부가 파라미터를 지운다.
 * "기본값을 URL 에 쓰지 않는다" 를 한 곳에서 결정해 화면마다 달라지지 않게.
 */
export function serializeProjectDetailTab(tab: ProjectDetailTab): string | null {
  return tab === DEFAULT_PROJECT_DETAIL_TAB ? null : tab;
}

/**
 * 구성 탭을 보여줄 수 있는가.
 *
 * 도메인이 0개여도 **탭은 숨기지 않는다** — 탭 세트가 프로젝트마다 흔들리면
 * 공간 기억이 깨진다(같은 자리를 눌렀는데 다른 게 나온다). 대신 탭 안에서
 * 빈 상태 + "첫 도메인 연결" 로 안내한다. 이 함수는 **카운트 배지**를 붙일지만
 * 판단한다 — 0 을 배지로 그리면 "없음" 을 강조하는 꼴이라 생략한다.
 */
export function compositionTabCount(domainCount: number): number | undefined {
  return domainCount > 0 ? domainCount : undefined;
}
