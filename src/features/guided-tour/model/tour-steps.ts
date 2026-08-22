/**
 * 가이드 투어 — 선언적 단계 배열 (`docs/PRODUCT-OWNER-OPERATING-SYSTEM.md` PO
 * 패스 §2). 지도 화면(/)의 의미 문해 전담 표면 — 8단계, 기본 페르소나는
 * 비개발자(1–7), 7단계에서 "개발자예요" 분기 시 8단계.
 *
 * 앵커는 testid 문자열(DOM) 또는 canvas-node(캔버스 프로젝션) 둘 중 하나 —
 * 이 파일은 위젯/뷰를 import 하지 않는다(FSD: feature → widgets 금지). 실제
 * DOM/캔버스 해석은 `resolve-anchor-rect.ts`(testid) 와 HomePage/TopologyMapV2
 * (canvas-node) 가 각자 담당한다.
 */

export type TourPersona = "all" | "dev";

export type TourAnchor =
  | { type: "testid"; value: string }
  /**
   * 캔버스 노드 앵커 — `domain` 은 "hub" 에서 정정된 값(2026-07-23 Guardian
   * 실측): isHub 노드는 스파인 뷰에서 "+N" 클러스터 칩으로 접혀 있어 클릭이
   * select 가 아니라 클러스터 확장(지도 전면 재배치)을 일으켰다. domain 은
   * 스파인 티어에서 항상 보이고 클릭 = 선택(데이터시트)이라 인터랙티브
   * 4단계의 "눌러보세요 → 카드가 열려요" 약속을 결정론적으로 지킨다.
   */
  | { type: "canvas-node"; target: "project" | "domain" }
  | null;

export interface TourStep {
  id: string;
  anchor: TourAnchor;
  /** 인터랙티브 단계(4) — [다음] 대신 실제 노드 클릭을 기다린다. */
  interactive?: boolean;
  persona: TourPersona;
  /** `messages/*.json` `guidedTour.steps.<copyKey>` 로 이어지는 카피 키. */
  copyKey: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "welcome", anchor: null, persona: "all", copyKey: "welcome" },
  {
    id: "nodes",
    anchor: { type: "canvas-node", target: "project" },
    persona: "all",
    copyKey: "nodes",
  },
  {
    id: "relations",
    // 관계 범례는 상시 코너에서 pull-only 「?」 도움말로 이동했다. 이 단계는
    // 지도 전체를 보며 선 의미를 읽는 중앙 설명이라 특정 DOM 상자를 가리키지 않는다.
    anchor: null,
    persona: "all",
    copyKey: "relations",
  },
  {
    id: "try-click",
    anchor: { type: "canvas-node", target: "domain" },
    interactive: true,
    persona: "all",
    copyKey: "tryClick",
  },
  {
    id: "datasheet",
    anchor: { type: "testid", value: "topology-v2-detail-panel" },
    persona: "all",
    copyKey: "datasheet",
  },
  {
    id: "index",
    anchor: { type: "testid", value: "topology-index-panel" },
    persona: "all",
    copyKey: "index",
  },
  {
    id: "recent",
    anchor: { type: "testid", value: "topology-spotlight-toggle" },
    persona: "all",
    copyKey: "recent",
  },
  {
    id: "agent",
    anchor: { type: "testid", value: "first-run-starter" },
    persona: "dev",
    copyKey: "agent",
  },
];

/**
 * 목적지별 안내 (2026-07-26 소유자 요청: "각 LNB탭 들어갔을때 가이드는 다 각각
 * 있으면 좋겠네? 지금은 지도쪽만 있어서!").
 *
 * **두 번째 가이드 체계를 만들지 않는다** — 지도가 쓰던 이 투어 기제를 그대로
 * 쓰고, 목적지마다 스텝 배열만 다르게 넣는다. 카드/스크림/컷아웃/진행 점/
 * 건너뛰기·다시 보기 계약이 전 화면에서 같아야 사용자가 한 번 배운 문법을
 * 재사용한다.
 *
 * 각 목적지는 **두 장**이다 — ①이 화면이 무엇을 하는 곳인지(앵커 없음, 중앙
 * 카드) ②여기서 처음 볼 것 하나(실제 요소 스포트라이트). 기능 나열이 아니라
 * "여기서 무엇을 할 수 있는가" 한 질문에만 답한다. ②의 앵커가 그 순간 화면에
 * 없으면(예: 문서 목록 접힘) `computeVisibleSteps` 가 자동으로 빼서 한 장짜리
 * 안내로 접힌다.
 *
 * 지도(`map`)는 여기 없다 — 캔버스 노드 앵커·인터랙티브 클릭·개발자 분기를
 * 쓰는 8단계 여정이라 `TOUR_STEPS` 가 계속 소유한다.
 */
export type DestinationTourId =
  | "docs"
  | "insights"
  | "projects"
  | "agents"
  | "git";

export const DESTINATION_TOURS: Record<DestinationTourId, readonly TourStep[]> = {
  docs: [
    { id: "docs-what", anchor: null, persona: "all", copyKey: "docsWhat" },
    {
      id: "docs-list",
      anchor: { type: "testid", value: "docs-vault-doc-list" },
      persona: "all",
      copyKey: "docsList",
    },
  ],
  /*
   * 「에이전트」 — 2026-08-20 목적지 신설(원장 90). 두 장이다: 이 화면이 무엇을
   * 하는지, 그리고 도구가 없을 때 어디를 누르면 되는지.
   */
  agents: [
    { id: "agents-what", anchor: null, persona: "all", copyKey: "agentsWhat" },
    {
      id: "agents-check",
      anchor: { type: "testid", value: "app-settings-runtimes-recheck" },
      persona: "all",
      copyKey: "agentsCheck",
    },
  ],
  insights: [
    { id: "insights-what", anchor: null, persona: "all", copyKey: "insightsWhat" },
    {
      id: "insights-today",
      anchor: { type: "testid", value: "do-next-touchups" },
      persona: "all",
      copyKey: "insightsToday",
    },
  ],
  projects: [
    { id: "projects-what", anchor: null, persona: "all", copyKey: "projectsWhat" },
    {
      id: "projects-card",
      anchor: { type: "testid", value: "project-selector-card" },
      persona: "all",
      copyKey: "projectsCard",
    },
  ],
  git: [
    { id: "git-what", anchor: null, persona: "all", copyKey: "gitWhat" },
    {
      id: "git-changes",
      anchor: { type: "testid", value: "atlas-git-panel" },
      persona: "all",
      copyKey: "gitChanges",
    },
  ],
};

export interface VisibleStepsContext {
  persona: TourPersona;
  /** 4단계에서 실제 선택이 생겼는가 — false 면 5단계(datasheet) 스킵. */
  hasSelection: boolean;
  /** 앵커가 지금 해석 가능한가 (요소 부재/`display:none`/뷰포트 밖이면 false). */
  canResolveAnchor: (anchor: TourAnchor) => boolean;
}

/**
 * 단계 스킵 규칙 (spec §2): `canResolveAnchor` 가 false 인 단계는 자동
 * 제외되고, 진행 점 분모(`visibleSteps.length`)도 그만큼 줄어든다. `datasheet`
 * 는 4단계에서 선택이 실제로 생겼을 때만 포함(선택 실패/건너뛰기 시 제외).
 * `agent` 는 `persona === 'dev'` 일 때만 포함.
 */
export function computeVisibleSteps(
  steps: readonly TourStep[],
  ctx: VisibleStepsContext,
): TourStep[] {
  return steps.filter((step) => {
    if (step.persona === "dev" && ctx.persona !== "dev") return false;
    if (step.id === "datasheet" && !ctx.hasSelection) return false;
    if (step.anchor === null) return true;
    return ctx.canResolveAnchor(step.anchor);
  });
}
