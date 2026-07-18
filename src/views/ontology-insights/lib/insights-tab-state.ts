/**
 * `/ontology/insights` 3-tab state — RATIO-SYSTEM (`docs/prototypes/RATIO-SYSTEM.md`)
 * final round. URL `?tab=` 이 진실원 — 새로고침/공유 링크에서도 같은 탭이
 * 열려야 하므로 컴포넌트 local state 가 아니라 순수 함수로 파싱/직렬화한다.
 *
 * 탭 3 종 고정: 개요(overview) · 관계(relations) · 신선도(freshness).
 * 이전 라운드의 4-tab 리더 페르소나 시스템(proof/collaboration/agent/census)
 * 은 insights-final.html 승인안에 없어 제거 — 탭 바 자체가 유일한 내비게이션.
 */
export const INSIGHTS_TABS = ["overview", "relations", "freshness"] as const;

export type InsightsTab = (typeof INSIGHTS_TABS)[number];

export const DEFAULT_INSIGHTS_TAB: InsightsTab = "overview";

function isInsightsTab(value: string): value is InsightsTab {
  return (INSIGHTS_TABS as readonly string[]).includes(value);
}

/** `searchParams.get("tab")` 의 raw 값 (string | null) → 유효 탭. 모르는 값/누락은 기본 탭. */
export function parseInsightsTab(raw: string | null | undefined): InsightsTab {
  if (!raw) return DEFAULT_INSIGHTS_TAB;
  return isInsightsTab(raw) ? raw : DEFAULT_INSIGHTS_TAB;
}

/** 탭 전환 시 갈 pathname — 기본 탭은 `?tab=` 을 아예 붙이지 않아 URL 이 깔끔. */
export function buildInsightsTabHref(tab: InsightsTab): string {
  return tab === DEFAULT_INSIGHTS_TAB ? "/ontology/insights/" : `/ontology/insights/?tab=${tab}`;
}
