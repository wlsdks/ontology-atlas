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
 * ## 분포는 «실측 볼트의 모양» 이다 (2026-07-31 정정)
 *
 * 종전 분포는 역량을 `round(√n / 2)` 개만 만들고 element 를 라운드로빈으로
 * **균등** 배분했다. n=3000 이면 역량 27개에 element 2954개 → **역량당 평균 82**.
 * 그런데 이 저장소 자신의 볼트(dogfood, 98노드)를 실측하면:
 *
 * | | 직속 자식 수 |
 * |---|---|
 * | 중앙값 | **3** |
 * | 평균 | 7.2 |
 * | 최댓값 | **92** (`capabilities/cli-developer-entry` 하나뿐) |
 * | 2위 | 54 |
 * | 나머지 42개 부모 | 한 자릿수~10대 |
 *
 * 즉 실제는 **허브 한둘 + 극단적 롱테일**인데, 종전 합성은 «허브가 27개 동시에
 * 존재하는 세상» 을 만들고 있었다 — **그런 볼트는 실재하지 않는다.** 그 위에서
 * 잰 성능 수치는 전부 허수 기준선이었다(지킴이 판정 2026-07-31).
 *
 * 그래서 둘을 함께 고쳤다. 분배 함수만 바꾸는 것으로는 부족했다 — 역량이 27개뿐이면
 * **어떤 분배를 써도 평균 82** 라서다.
 *
 * 1. **역량 수를 노드 수에 비례**시킨다(`CAPABILITY_SHARE`). √n 은 부모를 너무
 *    적게 만들어, 어떤 분배를 써도 부모당 평균이 부푼다.
 * 2. **element 배분을 멱법칙**으로 — 역량 하나가 허브가 되어 큰 몫을 흡수하고
 *    나머지는 한 자릿수에 머문다.
 *
 * 나머지 규율은 그대로: 도메인 `round(√n / 3)`, element 의 20% 는 도메인 직속,
 * 5% 는 고아, 분류는 `index % 20` 잔여. 결정론적이라 같은 N 은 항상 같은 그래프
 * (`Math.random` 미사용).
 */

/**
 * 역량이 전체 노드에서 차지하는 몫. 실측 볼트(역량 38 / 98노드 ≈ 0.39)에서 왔다.
 * 이 값이 작으면 부모당 자식이 비현실적으로 부풀어, 지도가 «실재하지 않는 밀도» 를
 * 상대로 튜닝된다.
 */
const CAPABILITY_SHARE = 0.15;

/**
 * 멱법칙 지수 — 클수록 허브 하나로 더 몰린다.
 *
 * **고른 게 아니라 맞춘 값이다.** 목표는 실측 볼트의 두 수(중앙값 3 · 최댓값 92)이고,
 * `CAPABILITY_SHARE × SKEW` 격자를 훑어 그 둘을 동시에 내는 조합을 골랐다
 * (1.8 → 최대 65 / 2.2 → 119 / **2.0 → 89**). n=3000 실측: 중앙값 3 · p90 8 · 최대 89.
 *
 * 규모가 커져도 중앙값은 3 에 머물고 허브만 자란다 — 실제 볼트에서
 * `cli-developer-entry` 가 라운드를 거치며 누적된 방식과 같은 모양이다.
 */
const CAPABILITY_SKEW = 2.0;

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
  // 역량은 **노드 수에 비례**한다 — √n 은 부모를 너무 적게 만들어 부모당 자식이
  // 실재하지 않는 규모로 부푼다(위 주석의 실측 표).
  const capability = Math.max(1, Math.min(total - 2 - domain, Math.round(total * CAPABILITY_SHARE)));
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

/**
 * element 인덱스를 역량 인덱스로 사상 — **앞쪽으로 몰리는 멱법칙**.
 *
 * `hash(e)` 로 결정론적 [0,1) 을 얻고 `CAPABILITY_SKEW` 승해 0 근처로 몰아붙인다. 결과적으로
 * 역량 0~1번이 허브가 되고 뒤로 갈수록 급격히 얇아진다 — 실측 볼트의 모양이다.
 * `Math.random` 을 쓰지 않으므로 같은 N 은 항상 같은 그래프다.
 */
function skewedCapabilityIndex(e: number, capabilityCount: number): number {
  if (capabilityCount <= 1) return 0;
  // Knuth 승수 해시 — 인접 인덱스가 인접 역량으로 가지 않게 흩는다.
  const u = ((e * 2654435761) >>> 0) / 4294967296;
  const idx = Math.floor(capabilityCount * Math.pow(u, CAPABILITY_SKEW));
  return Math.min(capabilityCount - 1, idx);
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
    // 역량 직속(75%) — **멱법칙 배분**.
    //
    // 라운드로빈(`e % capability`)은 모든 역량을 똑같이 부풀린다. 실측 볼트는
    // 허브 하나(92)와 롱테일(중앙값 3)이므로, 앞쪽 소수 인덱스로 몰리는 사상을
    // 쓴다. `u³` 은 [0,1) 균등을 0 근처로 강하게 몰아붙인다.
    const parentCap = `synth-cap-${skewedCapabilityIndex(e, counts.capability)}`;
    nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
    edges.push(makeContainsEdge(parentCap, id));
  }

  return { nodes, edges, counts };
}
