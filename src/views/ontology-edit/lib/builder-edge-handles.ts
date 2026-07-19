import type { Edge, Node } from "@xyflow/react";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

type BuilderEdgeSemanticType = "containment" | "relation";

/**
 * 두 노드가 "같은 세로줄"에 있다고 볼 최대 수평 겹침(중심 간 |Δx|). 이 안이면
 * 상/하 포트로 세로 연결, 밖이면 서로 마주보는 좌/우 포트로 가로 연결.
 *
 * 왜 이 임계가 중요한가 (owner 스크린샷의 헤어핀 원인): dagre LR 레이아웃은
 * 한 rank 가 세로로 길게 퍼지면 project→domain 처럼 명백히 좌우로 갈린
 * 노드쌍인데도 |Δy| > |Δx| 가 된다. 예전 로직은 그 케이스를 "세로 스택" 으로
 * 오판해 same-side 포트(right→right / left→left)를 골랐고, 그 결과 엣지가
 * 타깃 노드를 크게 감아도는 U-턴 루프(헤어핀/S자)가 캔버스 중앙에서 뒤엉켰다.
 *
 * 새 규칙: 수평 분리가 카드 폭의 절반(=이 임계)을 넘으면 무조건 마주보는
 * 좌/우 포트를 쓴다. 세로 오프셋이 아무리 커도 bezier 접선이 매끄럽게
 * 흡수하므로 루프가 생기지 않는다. same-side 포트 분기는 완전히 제거됐다.
 */
const VERTICAL_STACK_MAX_DX = NODE_WIDTH * 0.6; // 132px

/**
 * 소스·타깃의 상대 위치로 최적 포트(좌/우/상/하)를 고른다. 반환한 handle
 * id 는 AtlasNode 가 렌더한 8개 handle(4 source + 4 target) 과 1:1.
 *
 * 결정론적이고 순수 — 같은 좌표면 항상 같은 포트. 두 갈래뿐이다:
 *  1. 세로 스택(|Δx| 작고 |Δy| > 카드 높이) → source-bottom→target-top 또는
 *     그 반대. 위/아래로 곧게 흐르는 세로 bezier.
 *  2. 그 외 전부(좌우로 갈린 랭크 포함) → 서로 마주보는 좌/우 포트. 오른쪽
 *     타깃이면 source-right→target-left, 왼쪽이면 source-left→target-right.
 *
 * `semanticType` 은 더 이상 포트 선택에 영향을 주지 않는다(포함선도 관계선도
 * 같은 마주보기 규칙). 시그니처는 호출부 호환을 위해 보존.
 */
export function resolveBuilderEdgeEndpointHandles(
  source: Pick<Node, "position">,
  target: Pick<Node, "position">,
  semanticType: BuilderEdgeSemanticType = "relation",
): Pick<Edge, "sourceHandle" | "targetHandle"> {
  void semanticType;
  const sourceCenter = {
    x: source.position.x + NODE_WIDTH / 2,
    y: source.position.y + NODE_HEIGHT / 2,
  };
  const targetCenter = {
    x: target.position.x + NODE_WIDTH / 2,
    y: target.position.y + NODE_HEIGHT / 2,
  };
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  // 세로 스택 — 수평 겹침이 작고 세로로 카드 하나보다 더 벌어졌을 때만.
  // 상/하 포트가 마주봐 곧은 세로 연결이 된다.
  if (absX < VERTICAL_STACK_MAX_DX && absY > NODE_HEIGHT) {
    return deltaY >= 0
      ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
      : { sourceHandle: "source-top", targetHandle: "target-bottom" };
  }

  // 그 외 전부 — 마주보는 좌/우 포트. 세로 오프셋은 bezier 가 흡수.
  return deltaX >= 0
    ? { sourceHandle: "source-right", targetHandle: "target-left" }
    : { sourceHandle: "source-left", targetHandle: "target-right" };
}
