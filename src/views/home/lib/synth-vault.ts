import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 합성 대형 vault (topology-map-v2 S1 시각 검증) — 지도(`/`)의 숨은 `?synth=N`
 * 파라미터 전용. 번들 dogfood 샘플로는 재현되지 않는 대량-노드 밀도에서
 * `computeConcentricLayout` / `relaxCollisions` 의 시각·성능을 눈으로 확인하기
 * 위해, **결정론적**(Math.random 미사용) 합성 그래프를 파생한다.
 *
 * 이 모듈은 프로덕션 데모에도 남지만, 파라미터가 없으면 절대 실행되지 않고
 * 노출도 없다(README/FEATURES 미언급 — 코드 주석으로만). 사용자 vault 나 단일
 * 진실원(디스크 frontmatter)에는 전혀 손대지 않는다: 파생 결과는 지도 어댑터로만
 * 흘러가고 저장되지 않는다.
 *
 * 분포(오늘의 스트레스 테스트와 동일):
 * - 도메인 `round(√n / 3)`, 역량 `round(√n / 2)`, element 나머지.
 * - element 의 20% 는 도메인 직속(capability 경유 없음), 5% 는 고아(부모 없음),
 *   나머지 75% 는 역량에 매달린다.
 * - 분류는 `index % 20` 잔여로 결정한다(잔여 0 → 고아 5%, 잔여 4/8/12/16 →
 *   도메인 직속 20%, 그 외 → 역량). 결정론적이라 같은 N 은 항상 같은 그래프.
 */

export const SYNTH_MIN = 100;
export const SYNTH_MAX = 10000;

const PROJECT_ID = "synth-project";
// 결정론 고정 타임스탬프(파생마다 흔들리지 않게 — Date.now 미사용).
const FIXED_TS = new Date(0);
const APPROVED_BY = "synth";

export interface SynthVaultCounts {
  project: number;
  domain: number;
  capability: number;
  element: number;
  directElements: number;
  orphanElements: number;
}

export interface SynthVaultGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  counts: SynthVaultCounts;
}

/** `?synth=` 원시 입력을 [SYNTH_MIN, SYNTH_MAX] 정수로 clamp. 비수치면 null. */
export function clampSynthSize(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < SYNTH_MIN) return SYNTH_MIN;
  if (rounded > SYNTH_MAX) return SYNTH_MAX;
  return rounded;
}

/** 분포 카운트만 순수 계산(합성기·테스트 공용 진실원). */
export function computeSynthCounts(total: number): SynthVaultCounts {
  const s = Math.sqrt(total);
  const domain = Math.max(1, Math.round(s / 3));
  const capability = Math.max(1, Math.round(s / 2));
  const element = Math.max(0, total - 1 - domain - capability);
  let directElements = 0;
  let orphanElements = 0;
  for (let e = 0; e < element; e += 1) {
    const r = e % 20;
    if (r === 0) orphanElements += 1;
    else if (r === 4 || r === 8 || r === 12 || r === 16) directElements += 1;
  }
  return { project: 1, domain, capability, element, directElements, orphanElements };
}

function makeNode(
  id: string,
  title: string,
  kind: KnowledgeGraphNode["kind"],
  projectIds: string[],
): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: FIXED_TS,
    lastApprovedBy: APPROVED_BY,
  };
}

function makeContainsEdge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    type: "contains",
    projectIds: [PROJECT_ID],
    evidenceIds: [],
    lastApprovedAt: FIXED_TS,
    lastApprovedBy: APPROVED_BY,
  };
}

/**
 * 결정론 합성 그래프 파생. 같은 `total` → 바이트 동일한 nodes/edges 순서.
 * `clampSynthSize` 로 이미 clamp 된 값을 받는 것을 가정하되, 방어적으로 다시
 * clamp 한다.
 */
export function synthesizeVaultGraph(total: number): SynthVaultGraph {
  const n = clampSynthSize(total) ?? SYNTH_MIN;
  const counts = computeSynthCounts(n);
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];

  nodes.push(makeNode(PROJECT_ID, "Synthetic vault", "project", [PROJECT_ID]));

  for (let d = 0; d < counts.domain; d += 1) {
    const id = `synth-domain-${d}`;
    nodes.push(makeNode(id, `Domain ${d}`, "domain", [PROJECT_ID]));
    edges.push(makeContainsEdge(PROJECT_ID, id));
  }

  for (let c = 0; c < counts.capability; c += 1) {
    const id = `synth-cap-${c}`;
    const parentDomain = `synth-domain-${c % counts.domain}`;
    nodes.push(makeNode(id, `Capability ${c}`, "capability", [PROJECT_ID]));
    edges.push(makeContainsEdge(parentDomain, id));
  }

  for (let e = 0; e < counts.element; e += 1) {
    const id = `synth-el-${e}`;
    const r = e % 20;
    if (r === 0) {
      // 고아(5%) — containment 밖. 부모 edge 없음, projectIds 비움.
      nodes.push(makeNode(id, `Element ${e}`, "element", []));
      continue;
    }
    if (r === 4 || r === 8 || r === 12 || r === 16) {
      // 도메인 직속(20%) — capability 경유 없이 도메인이 바로 담는다.
      const parentDomain = `synth-domain-${e % counts.domain}`;
      nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
      edges.push(makeContainsEdge(parentDomain, id));
      continue;
    }
    // 역량 직속(75%).
    const parentCap = `synth-cap-${e % counts.capability}`;
    nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
    edges.push(makeContainsEdge(parentCap, id));
  }

  return { nodes, edges, counts };
}
