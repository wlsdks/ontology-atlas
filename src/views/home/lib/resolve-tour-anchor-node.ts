/**
 * 가이드 투어의 캔버스 노드 앵커(2·4단계, `guided-tour` feature 의
 * `TourAnchor` `{ type: 'canvas-node' }`) 를 실제 그래프 노드 id 로 해석한다.
 * feature 레이어(`src/features/guided-tour`)는 위젯의 그래프 타입을 몰라야
 * 하므로(FSD: feature → widgets 금지) 이 해석은 view 레이어가 담당하고,
 * 결과 id 만 `TopologyMapV2Props.tourAnchorNodeId` 로 내려보낸다
 * (`resolve-agent-focus-node.ts` 와 같은 "kind:slug" id 규약을 그대로 쓴다 —
 * 별도 파싱 없이 `TopologyV2Node.id`/`.kind` 를 직접 읽는다).
 *
 * - `target: "project"` (2단계 "점의 크기와 모양") — 첫 project 노드, 없으면
 *   첫 domain 노드.
 * - `target: "domain"` (4단계 "직접 눌러보세요") — 첫 domain 노드, 없으면
 *   project 폴백. **isHub 노드를 겨냥하지 않는다** (2026-07-23 Guardian 실측
 *   정정): hub 는 capability 티어라 스파인 뷰에서 "+N" 클러스터 칩으로 접혀
 *   있고, 그 좌표를 클릭하면 select 가 아니라 클러스터 확장(element view 로의
 *   전면 재배치)이 일어나 투어가 4단계에서 영구히 멈췄다. domain 은 스파인
 *   티어(tier 1)에서 항상 렌더되고 클릭 = 선택(데이터시트 오픈)이므로
 *   인터랙티브 단계의 자동 진행(hasSelection false→true)이 결정론적이다.
 *
 * 둘 다 못 찾으면 `null` — 호출부(`computeVisibleSteps`)가 해당 단계를
 * 자동 스킵한다.
 */
export interface TourAnchorCandidateNode {
  id: string;
  kind: string;
  isHub: boolean;
}

export function resolveTourAnchorNodeId(
  nodes: readonly TourAnchorCandidateNode[],
  target: "project" | "domain",
): string | null {
  const project = nodes.find((n) => n.kind === "project");
  const domain = nodes.find((n) => n.kind === "domain");
  if (target === "domain") {
    return domain?.id ?? project?.id ?? null;
  }
  return project?.id ?? domain?.id ?? null;
}
