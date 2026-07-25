import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 의존 사이클 카드 (전략 verdict B 후보 ④) — "구조적으로 위험한 순환이
 * 생겼나?"에 답한다. depends_on 방향 그래프의 순환만 목록으로 낸다.
 *
 * 데이터: 페이지에 이미 로드된 nodes/edges 에서 client 계산 (단일 진실원 —
 * 별도 store 없음). 의존 계열 판정은 MCP `query_ontology({operation:"cycles"})`
 * 파생과 같은 의미다: containment(contains/belongs_to)가 아닌 depends_on
 * (frontmatter 저장 키가 canonicalize 전 `dependencies` 일 수 있어 둘 다 허용).
 *
 * 알고리즘: 각 노드를 시작점으로 하는 깊이 제한 DFS + Johnson 식 최소-정점
 * 제약(현재 시작점보다 큰 id 로만 전진)으로 각 단순 방향 사이클을 그 최소
 * 노드에서 정확히 1번만 찾는다 → 회전 중복이 구조적으로 배제된다. 희소한
 * 온톨로지 의존 그래프에서 300 노드급도 ms 급.
 */

/** 의존(방향) 계열 edge 타입 — 구조(containment) 아님. MCP cycles 와 동일 의미. */
const DEPENDENCY_EDGE_TYPES = new Set(["depends_on", "dependencies"]);

export function isDependencyEdgeType(type: string): boolean {
  return DEPENDENCY_EDGE_TYPES.has(type);
}

export interface DependencyCycle {
  /** 안정 id — 최소 노드에서 시작하는 방향 경로를 join 한 canonical key. */
  id: string;
  /** 사이클의 실제 노드 수(distinct). 표기 상한과 무관한 정직한 길이. */
  length: number;
  /**
   * 표기용 distinct 노드 경로(시작 반복 없음). maxPathNodes 로 캡됨.
   * UI 는 마지막에 nodeIds[0] 를 붙여 "A → B → C → A" 로 닫는다.
   */
  nodeIds: string[];
  /** length - nodeIds.length. >0 이면 경로가 잘림 → "외 N" 표기. */
  hiddenNodeCount: number;
}

export interface DependencyCyclesResult {
  /** maxCycles 로 캡된, 짧은 것 우선 정렬된 사이클. */
  cycles: DependencyCycle[];
  /** 탐지된 서로 다른 사이클 총수(maxCycles 초과 가능). */
  totalCycles: number;
  /** totalCycles - cycles.length. >0 이면 "외 N개" 표기. */
  hiddenCycles: number;
  /** 표시 상한과 무관한 현재 전체 사이클 id. exact review 판정에 쓴다. */
  activeCycleIds: string[];
  /** 깊이 상한/작업 예산에 걸려 탐색이 잘렸는가(더 긴 사이클을 놓쳤을 수 있음). */
  limited: boolean;
}

export interface FindDependencyCyclesOptions {
  /** 노출할 최대 사이클 수. 기본 5. */
  maxCycles?: number;
  /** 경로에 표기할 최대 노드 수. 기본 8. */
  maxPathNodes?: number;
  /**
   * 탐지 깊이 상한(경로 distinct 노드 수). 기본 16 — 표기 상한(8)보다 크게
   * 둬서 "경로 외 N" 절단이 실제로 의미를 갖게 한다. MCP cycles 자체 기본은
   * maxDepth 8 이지만, 여기선 표기 절단을 위해 넉넉히 잡는다.
   */
  maxHops?: number;
}

/** 탐색 폭주 하드 가드 — 병리적 밀집 그래프에서도 ms 보장. */
const STEP_BUDGET = 500_000;

export function findDependencyCycles(
  graphNodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options: FindDependencyCyclesOptions = {},
): DependencyCyclesResult {
  const maxCycles = options.maxCycles ?? 5;
  const maxPathNodes = options.maxPathNodes ?? 8;
  const maxHops = options.maxHops ?? 16;

  const nodeIdSet = new Set(graphNodes.map((node) => node.id));

  // 의존 edge 만 인접 리스트로. 양 끝이 모두 알려진 노드여야(MCP edge.resolved
  // 대응 — dangling 참조 무시). self-loop 는 자기참조 사이클로 따로 수집.
  const adjacency = new Map<string, Set<string>>();
  const selfLoops = new Set<string>();
  for (const edge of edges) {
    if (!isDependencyEdgeType(edge.type)) continue;
    if (!nodeIdSet.has(edge.from) || !nodeIdSet.has(edge.to)) continue;
    if (edge.from === edge.to) {
      selfLoops.add(edge.from);
      continue;
    }
    let outs = adjacency.get(edge.from);
    if (!outs) {
      outs = new Set();
      adjacency.set(edge.from, outs);
    }
    outs.add(edge.to);
  }

  const foundPaths = new Map<string, string[]>();
  // depthTruncated: 어떤 가지가 깊이 상한에 걸려 더 긴 사이클을 놓쳤을 수
  // 있음(가지 단위 prune, 전역 중단 아님). budgetExhausted: 하드 작업 예산
  // 소진 → 전역 중단. 둘 중 하나라도면 결과의 limited=true.
  let depthTruncated = false;
  let budgetExhausted = false;
  let steps = 0;

  // ① 자기참조 — A depends_on A.
  for (const id of [...selfLoops].sort()) {
    foundPaths.set(id, [id]);
  }

  // ② 다중 노드 사이클 — 최소-정점 제약 DFS.
  const path: string[] = [];
  const inPath = new Set<string>();
  const starts = [...adjacency.keys()].sort();

  for (const start of starts) {
    if (budgetExhausted) break;
    dfs(start, start);
  }

  function dfs(start: string, current: string): void {
    if (steps++ > STEP_BUDGET) {
      budgetExhausted = true;
      return;
    }
    // 깊이 상한 = 가지 단위 prune. 형제 가지(더 짧은 사이클)는 계속 탐색해야
    // 하므로 전역 중단이 아니라 이 가지만 접는다.
    if (path.length >= maxHops) {
      depthTruncated = true;
      return;
    }
    path.push(current);
    inPath.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (next === start) {
        if (path.length > 1) {
          const key = path.join(" ");
          if (!foundPaths.has(key)) foundPaths.set(key, [...path]);
        }
        continue;
      }
      // Johnson 최소-정점 제약: 시작점보다 큰 id 로만 전진 → 각 사이클을 그
      // 최소 노드에서만 발견(회전 중복 배제 + 작업량 절감).
      if (next < start) continue;
      if (inPath.has(next)) continue;
      dfs(start, next);
      if (budgetExhausted) break;
    }
    path.pop();
    inPath.delete(current);
  }

  const allCycles = [...foundPaths.values()].sort(
    (a, b) => a.length - b.length || a.join(" ").localeCompare(b.join(" ")),
  );

  const totalCycles = allCycles.length;
  const cycles: DependencyCycle[] = allCycles.slice(0, maxCycles).map((nodeIdsFull) => {
    const shown = nodeIdsFull.slice(0, maxPathNodes);
    return {
      id: nodeIdsFull.join(" "),
      length: nodeIdsFull.length,
      nodeIds: shown,
      hiddenNodeCount: nodeIdsFull.length - shown.length,
    };
  });

  return {
    cycles,
    totalCycles,
    hiddenCycles: Math.max(0, totalCycles - cycles.length),
    activeCycleIds: allCycles.map((nodeIds) => nodeIds.join(" ")),
    limited: depthTruncated || budgetExhausted,
  };
}
