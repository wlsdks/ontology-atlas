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
 * 결정론적이고 순수 — 같은 좌표면 항상 같은 포트. 갈래:
 *  1. 세로 스택 + 포함선(containment) → source-bottom→target-top(또는 반대).
 *     위/아래로 곧게 흐르는 세로 bezier. dagre LR 에서 포함선은 거의 항상 좌우
 *     라 이 분기는 force 레이아웃 등에서만 드물게 탄다.
 *  2. 세로 스택 + 관계선(relation) → **같은 쪽(오른쪽) 포트**로 나가고 들어와
 *     카드 컬럼 바깥으로 호(arc)를 그린다. 왜(2차 owner 피드백): 같은 컬럼에
 *     세로로 쌓인 도메인끼리의 relates 를 상/하 포트로 이으면 제어점이 끝점과
 *     같은 x 라 곡률이 0 인 **직선 세로선**이 되어 그 사이 카드들을 관통하는
 *     스큐어(skewer)처럼 보였다. 같은 쪽 포트는 카드 옆으로 확실히 돌아 나가
 *     "선은 카드 사이·바깥에서만 읽힌다"는 계약을 지킨다. 포함선은 왼쪽(프로젝트
 *     쪽)에서 들어오므로, 관계선을 오른쪽으로 몰면 두 계열이 좌/우로 분리된다.
 *  3. 그 외 전부(좌우로 갈린 랭크 포함) → 서로 마주보는 좌/우 포트. 오른쪽
 *     타깃이면 source-right→target-left, 왼쪽이면 source-left→target-right.
 */
export function resolveBuilderEdgeEndpointHandles(
  source: Pick<Node, "position">,
  target: Pick<Node, "position">,
  semanticType: BuilderEdgeSemanticType = "relation",
): Pick<Edge, "sourceHandle" | "targetHandle"> {
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
  if (absX < VERTICAL_STACK_MAX_DX && absY > NODE_HEIGHT) {
    // 관계선은 같은 쪽(오른쪽) 포트로 카드 옆을 호로 감아 나간다 — 직선 세로
    // 스큐어 방지. 포함선은 상/하 마주보기로 곧게.
    if (semanticType === "relation") {
      return { sourceHandle: "source-right", targetHandle: "target-right" };
    }
    return deltaY >= 0
      ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
      : { sourceHandle: "source-top", targetHandle: "target-bottom" };
  }

  // 그 외 전부 — 마주보는 좌/우 포트. 세로 오프셋은 bezier 가 흡수.
  return deltaX >= 0
    ? { sourceHandle: "source-right", targetHandle: "target-left" }
    : { sourceHandle: "source-left", targetHandle: "target-right" };
}
