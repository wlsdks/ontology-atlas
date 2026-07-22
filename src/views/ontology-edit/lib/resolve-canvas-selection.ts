/**
 * xyflow `onSelectionChange` → 부모 selectedId 로의 순수 배선 판정.
 *
 * 토스 #1 결함(캔버스 드래프트 노드를 클릭해도 우측 인스펙터가 그 노드로
 * 전환되지 않음)의 근본 원인:
 *
 * 노드를 클릭하면 `onNodeClick → openNodeDetails(id)` 가 `focusNodeId` 를
 * 바꾼다. focusNodeId 변화는 `buildFocusedBuilderManifest` 를 다시 계산해
 * 캔버스 graphKey 를 바꾸고, ReactFlow 노드 배열이 통째로 새 객체로 교체된다.
 * 그 재빌드 프레임에 xyflow 는 "선택된 노드가 방금 사라졌다"고 보고
 * `onSelectionChange({ nodes: [], edges: [] })` 를 순간적으로 발화한다.
 * 예전 핸들러는 이 빈 보고를 `selectedId = null` 로 전파해, 부모가 방금
 * 세팅한 선택을 곧바로 지워버렸다 — 인스펙터가 클릭한 노드로 전환됐다가
 * 즉시 빈 상태로 되돌아가는 체감 버그.
 *
 * 규율: **선택 해제는 이 구독이 소유하지 않는다.** 진짜 해제는
 * `onPaneClick`(빈 캔버스 클릭 → 명시적 null), Escape 단축키, 인스펙터의 ✕
 * 버튼이 각자 명시적으로 처리한다. 따라서 이 판정은 실제 노드 선택만
 * 전파하고, 빈 노드 보고(재빌드 잡음 · 엣지-only 박스 선택)는 무시한다.
 */
export interface CanvasSelectionParams {
  nodes: ReadonlyArray<{ id: string }>;
  edges: ReadonlyArray<unknown>;
}

export type CanvasSelectionResolution =
  | { propagate: false }
  | { propagate: true; selectedId: string };

export function resolveBuilderCanvasSelection(
  params: CanvasSelectionParams,
): CanvasSelectionResolution {
  // 빈 노드 보고는 절대 부모 선택을 건드리지 않는다 — 재빌드 잡음이든
  // 엣지-only 선택(B-3)이든 동일. 노드가 하나라도 있을 때만 전파한다.
  const first = params.nodes[0];
  if (!first) return { propagate: false };
  return { propagate: true, selectedId: first.id };
}
