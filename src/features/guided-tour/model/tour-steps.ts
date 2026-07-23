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

export const TOUR_STORAGE_KEY = "guided-tour:v1";

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
    anchor: { type: "testid", value: "topology-relation-legend" },
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
