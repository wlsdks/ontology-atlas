import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildDuplicatePairs,
  buildSimilarityCandidates,
  scoreNodeSimilarity,
} from "./duplicate-pairs";

/**
 * 성능 게이트 — 쌍 비교 안쪽 루프의 재토큰화 회귀 차단.
 *
 * ## 무엇이 있었나 (2026-08-19 실측)
 *
 * `buildDuplicatePairs` 는 후보를 낱말 역색인으로 좁히지만, 같은 폴더 이름
 * (`capabilities/…`, `elements/…`)이 **모든** 노드의 slug 낱말에 들어가서
 * 한 버킷이 사실상 전수 n² 이 된다. 그 안쪽 루프가 쌍마다
 * `scoreNodeSimilarity` 를 불러 slug·title 을 **다시 토큰화**하고 Set 을
 * 4개씩 새로 만들었다 — 번들 샘플 볼트(125 문서)로 `/ontology/insights` 에
 * 콜드 진입할 때 이 함수 하나가 페이지 파생 계산 시간의 74%(CPU 4x 스로틀
 * 실측 34.8ms/46.9ms)를 먹었고, 렌더 한 조각을 62~66ms 롱태스크로 만들었다.
 * 처방: 노드당 낱말 집합을 한 번만 잘라 두고 쌍 비교는 그 집합만 본다.
 *
 * ## 게이트 설계 — 절대 벽시계가 아니라 **자기보정 비율**
 *
 * 처음엔 절대 임계(80ms)로 놓았는데, 병렬 에이전트가 같은 머신에서 빌드를
 * 돌리는 동안 초록이어야 할 실행이 82~91ms 로 흔들려 5회 중 1회 헛빨강이
 * 났다(2026-08-19 실측). 벽시계는 CI 머신 속도와 동시 부하의 함수다. 그래서
 * 같은 쌍 전부를 결함 형태 그대로(쌍마다 재토큰화) 채점하는 naive 루프를
 * **같은 실행 안에서** 재고, 그 대비 몇 배 빠른지를 단언한다 — 분자와 분모가
 * 같은 부하를 타므로 판정이 머신에 좌우되지 않는다.
 *
 * 실측(2026-08-19, 600 노드 ≈ 18만 쌍, min of 3): buildDuplicatePairs ~45ms ·
 * naive ~175ms → 비율 3.8~4.2. 결함 재주입(안쪽 루프의 `scorePair` 를
 * `scoreNodeSimilarity(left, right).total` 로 되돌림) 시 비율 0.88 로
 * 3회 연속 빨간불 — gate-probe 확인. 임계 2 는 두 상태의 기하평균(≈1.9)
 * 바로 위다.
 */
function node(id: string, kind: string, title: string, slug: string): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [slug],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  };
}

describe("buildDuplicatePairs 성능 게이트", () => {
  it("공유 폴더 낱말로 버킷이 전수가 되어도(600 노드 ≈ 18만 쌍) 쌍당 재토큰화 없이 끝난다", () => {
    const N = 600;
    const nodes: KnowledgeGraphNode[] = [];
    for (let i = 0; i < N; i += 1) {
      // 폴더 낱말(`elements`) 하나만 공유 → 역색인 버킷 하나가 전수가 되어
      // n² 쌍이 비교된다. 제목 낱말은 노드마다 유일해 어떤 쌍도 임계값
      // (0.6)에 못 닿고, 제목이 길수록 「쌍마다 재토큰화」의 비용 비중이
      // 커져 결함과 수정의 분리가 넓어진다(실제 볼트 제목도 여러 낱말이다).
      nodes.push(
        node(
          `element:u${i}x`,
          "element",
          `u${i}a u${i}b u${i}c u${i}d u${i}e`,
          `elements/u${i}x`,
        ),
      );
    }
    // 측정기가 헛돌지 않는다는 증명용 — 임계값을 실제로 넘는 한 쌍을 심는다.
    // 이 쌍이 안 잡히면 fixture 가 비교 자체를 안 한 것이다.
    nodes.push(node("element:node-drawer", "element", "Node drawer", "elements/node-drawer"));
    nodes.push(node("element:node-drawer-copy", "element", "Node drawer", "elements/node-drawer-copy"));
    const edges: KnowledgeGraphEdge[] = [];

    // 기준선: 같은 쌍 전부를 결함 형태 그대로(쌍마다 재토큰화하는
    // `scoreNodeSimilarity`) 채점하는 naive 루프 — 같은 머신·같은 부하에서
    // 재므로 CI 속도에 자기보정된다.
    const candidates = [...buildSimilarityCandidates(nodes, edges).values()];
    const naiveScan = () => {
      let above = 0;
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
          if (scoreNodeSimilarity(candidates[i], candidates[j]).total >= 0.6) above += 1;
        }
      }
      return above;
    };

    // JIT 워밍업 각 1회 + 3회 중 최솟값 — 단발 측정의 GC/스케줄링 노이즈 제거.
    buildDuplicatePairs(nodes, edges, 3);
    naiveScan();
    let bestBuild = Infinity;
    let bestNaive = Infinity;
    let result: ReturnType<typeof buildDuplicatePairs> | null = null;
    let naiveAbove = -1;
    for (let run = 0; run < 3; run += 1) {
      let start = performance.now();
      result = buildDuplicatePairs(nodes, edges, 3);
      bestBuild = Math.min(bestBuild, performance.now() - start);
      start = performance.now();
      naiveAbove = naiveScan();
      bestNaive = Math.min(bestNaive, performance.now() - start);
    }

    // 측정기가 헛돌지 않는다는 증명 — 심어 둔 중복 쌍을 양쪽 다 잡았다.
    expect(result?.suspectCount).toBe(1);
    expect(result?.rows[0]?.dissolveSlug).toBe("elements/node-drawer-copy");
    expect(naiveAbove).toBe(1);

    // 실측(2026-08-19, min of 3): 단독 실행 비율 3.8~4.2 (build ~45ms ·
    // naive ~175ms) · vitest 전체 스위트(2,183 테스트) 병렬 부하 아래 통과
    // 확인. 결함 재주입(쌍마다 scoreNodeSimilarity 재토큰화) 시 0.88 로
    // 3회 연속 빨간불(gate-probe). 임계 2 는 두 상태의 기하평균(≈1.9) 바로
    // 위 — 벽시계가 아니라 비율이라 머신 속도·동시 부하에 판정이 뒤집히지
    // 않는다.
    expect(bestNaive / bestBuild).toBeGreaterThan(2);
  });
});
