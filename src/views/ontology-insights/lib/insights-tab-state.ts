/**
 * `/ontology/insights` 탭 state. URL `?tab=` 이 진실원 — 새로고침/공유 링크에서도
 * 같은 탭이 열려야 하므로 컴포넌트 local state 가 아니라 순수 함수로 파싱/직렬화한다.
 *
 * 탭은 **질문 단위**로 5종이다: 할 일(기본) · 구성 · 연결 · 경계 · 신선도.
 * 한 탭이 여러 질문을 담으면 사용자는 자기 질문에 답하려고 무관한 두 화면
 * 분량을 지나쳐야 한다 — 실제로 구 `구조` 탭이 "뭐가 있나 / 뭐가 중심인가 /
 * 경계가 건강한가" 셋을 한 방에 쌓아 뷰포트의 2.2배가 됐다. 탭 하나가 답하는
 * 질문이 하나면 스크롤이 다시 길어질 여지도 사라진다.
 */
export const INSIGHTS_TABS = [
  "do-next",
  "composition",
  "connections",
  "boundaries",
  "freshness",
] as const;

export type InsightsTab = (typeof INSIGHTS_TABS)[number];

export const DEFAULT_INSIGHTS_TAB: InsightsTab = "do-next";

function isInsightsTab(value: string): value is InsightsTab {
  return (INSIGHTS_TABS as readonly string[]).includes(value);
}

/**
 * 옛 탭 이름으로 저장된 URL 호환 — 북마크와 에이전트 인계 링크(`via=insights:<tab>`
 * 복귀 칩 포함)는 한 번 새겨지면 오래 산다. 새 이름으로 갈아탈 때마다 옛 이름을
 * 여기 남겨 링크를 죽이지 않는다.
 */
const LEGACY_TAB_ALIASES: Record<string, InsightsTab> = {
  // 구 개요/관계 2탭 → 구 구조 1탭
  overview: "composition",
  relations: "connections",
  // 구 구조 탭 → 구성/연결/경계 3분할. 첫 질문("뭐가 얼마나 있나")이 구성이라
  // 그쪽으로 보낸다.
  structure: "composition",
};

/** `searchParams.get("tab")` 의 raw 값 (string | null) → 유효 탭. 모르는 값/누락은 기본 탭. */
export function parseInsightsTab(raw: string | null | undefined): InsightsTab {
  if (!raw) return DEFAULT_INSIGHTS_TAB;
  if (isInsightsTab(raw)) return raw;
  return LEGACY_TAB_ALIASES[raw] ?? DEFAULT_INSIGHTS_TAB;
}

/**
 * 탭 전환 시 갈 pathname — 기본 탭은 `?tab=` 을 아예 붙이지 않아 URL 이
 * 깔끔하다. native history 로 현재 문서 안에서 query 만 바꿀 때는 locale 이
 * 붙은 현재 pathname 을 넘겨 WebView URL과 키보드 포커스를 함께 보존한다.
 */
export function buildInsightsTabHref(
  tab: InsightsTab,
  pathname = "/ontology/insights/",
): string {
  return tab === DEFAULT_INSIGHTS_TAB ? pathname : `${pathname}?tab=${tab}`;
}
