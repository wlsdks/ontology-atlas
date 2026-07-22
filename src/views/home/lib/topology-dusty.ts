import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 살아있는 지도 드리프트 — "먼지 앉은"(dusty) 노드 파생.
 *
 * 오래 손대지 않은 노드를 엔진의 기존 stale 채널(dash [3,3] + 불투명
 * stale 토큰 페어, `model/freshness.ts`)로 가라앉혀 방치가 그래프 위치와
 * 함께 읽히게 한다. Guardian 1차 검수(2026-07-23) 처방:
 * - 신규 드로우 코드·토큰 0 — `topology-world` 의 `stale` 플래그에만 배선.
 * - 판정은 상대(중앙값 strict 미만) + 절대(`max(30일, 2 × 중앙값-age)` 초과)
 *   이중 조건. 동률은 fresh — 벌크 import / `git clone` 직후(전원 동일
 *   mtime)는 전원 fresh 가 되는 것이 의도된 알려진 한계다(합성/추정 금지,
 *   조용히 꺼짐). 배수 조건은 Guardian 1차 처방의 fallback — 순수 중앙값
 *   미만+30일 조건은 dogfood 실측에서 과반(56/105)을 dusty 로 마킹해
 *   "건강하지만 천천히 관리되는 vault 절반이 항상 먼지" 였다. 중앙값 age 의
 *   2배 이상 뒤처진 꼬리만 마킹하면 신호가 진짜 방치로 좁혀진다.
 * - 최하위 사분위 캡: dusty 는 어떤 분포에서도 전체의 25% 를 넘지 못한다
 *   (가장 오래된 순). dogfood 실측 2차 — 활발히 관리되는 vault(중앙값
 *   4일)에 방치 꼬리가 크면 배수 조건도 못 잡는다(이봉 분포). 이 신호의
 *   목적은 "가장 먼지 쌓인 구석"이지 낡음 센서스가 아니다 — 캡이 지도의
 *   주의 경제를 보존한다.
 * - 날짜 출처는 vault 문서 mtime(`useVaultDocFreshnessIndex` — local 은
 *   `file.lastModified`, dogfood 는 빌드타임 git 스탬프). 노드→문서 키는
 *   `evidenceIds[0]`(= derive 의 sourceSlug). 날짜 없는 노드는 fresh.
 */
export const DUSTY_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function deriveDustySlugs(
  nodes: readonly Pick<KnowledgeGraphNode, "id" | "evidenceIds">[],
  freshnessIndex: ReadonlyMap<string, string>,
  nowMs: number,
): ReadonlySet<string> {
  const mtimeById = new Map<string, number>();
  for (const node of nodes) {
    const sourceSlug = node.evidenceIds[0];
    if (!sourceSlug) continue;
    const raw = freshnessIndex.get(sourceSlug);
    if (!raw) continue;
    const ts = Date.parse(raw);
    if (Number.isNaN(ts)) continue;
    mtimeById.set(node.id, ts);
  }
  if (mtimeById.size === 0) return new Set();

  const sorted = [...mtimeById.values()].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const medianAgeMs = Math.max(0, nowMs - median);
  const minAgeMs = Math.max(DUSTY_MIN_AGE_MS, 2 * medianAgeMs);

  const candidates: Array<{ id: string; ts: number }> = [];
  for (const [id, ts] of mtimeById) {
    if (ts < median && nowMs - ts > minAgeMs) candidates.push({ id, ts });
  }
  // 최하위 사분위 캡 — 가장 오래된 순으로 전체 모수의 25%까지만.
  // 동률 ts 는 id 오름차순 tie-break (결정론).
  candidates.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  // 소규모 vault 에서도 진짜 오래된 노드 하나는 보이도록 하한 1 (모수 4 미만
  // 이어도 조건을 통과한 노드가 있으면 최소 1개는 표시).
  const cap = Math.max(1, Math.floor(mtimeById.size / 4));
  return new Set(candidates.slice(0, cap).map((c) => c.id));
}
