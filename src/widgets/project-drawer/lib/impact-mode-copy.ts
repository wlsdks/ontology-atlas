import type { ProjectImpactMode } from "@/entities/project";

export interface ImpactModeCopyKeys {
  mode: ProjectImpactMode;
  labelKey: string;
  helpKey: string;
}

/**
 * design-council B6 rank16 — ProjectDrawer 의 4개 임팩트 모드 필이 각기
 * 다른 그래프 연산(none=강조 없음 · upstream=의존 폐쇄집합 · downstream=
 * 피의존 폐쇄집합 · network=양방향 폐쇄집합, `resolveProjectImpactInsight`)
 * 을 트리거하는데 도움말은 항상 같은 한 줄이었다 — 정직성 결함. 라벨/도움말
 * i18n 키 쌍을 여기 한 곳에 선언해 ProjectDrawer 렌더와 테스트가 같은
 * 목록을 참조하게 한다(drift 방지).
 *
 * 방향 어휘는 rank13(FullDetailA1 reach direction 토글)과 통일한다:
 * upstream(의존) = "이게 기대는 곳", downstream(영향) = "이걸 기대받는 곳".
 */
export const IMPACT_MODE_COPY_KEYS: ImpactModeCopyKeys[] = [
  { mode: "none", labelKey: "impactModeNone", helpKey: "impactHelpNone" },
  {
    mode: "upstream",
    labelKey: "impactModeUpstream",
    helpKey: "impactHelpUpstream",
  },
  {
    mode: "downstream",
    labelKey: "impactModeDownstream",
    helpKey: "impactHelpDownstream",
  },
  {
    mode: "network",
    labelKey: "impactModeNetwork",
    helpKey: "impactHelpNetwork",
  },
];
