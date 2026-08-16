// 내보내기가 **무엇을 안 담았는지** 세어서 말한다.
//
// ## 왜 (2026-08-17 실측)
//
// `export --format jsonld` 의 상태 줄은 `80 nodes · 174 edges` 였다. 노드와
// 관계는 정말 다 나간다(174 = 174, 확인함). 그런데 우리 볼트의 **관계 이유
// 7개**(`relation_notes`)는 하나도 안 나가고, 구현 경로(`path`)와 설명도
// 마찬가지다.
//
// 이 저장소가 스스로 적어 둔 말이 있다: *"근거 없는 엣지는 마인드맵 선이지
// 온톨로지 주장이 아니다."* Protégé 로 옮긴 사람은 「80 노드 · 174 관계」를
// 보고 온톨로지를 다 가져온 줄 안다 — 실제로는 이 제품을 이 제품이게 하는
// 것이 빠진 채다.
//
// `surfaces.md` 의 강등 규율과 같다: **못 하는 것은 못 한다고 말한다.**
//
// ## 목록을 손으로 적지 않는다
//
// 「무엇이 빠지나」를 상수로 적어 두면 스키마가 늘 때 조용히 낡는다. 그래서
// **볼트에 실제로 있는 칸**과 **형식이 담는 칸**을 비교해서 낸다. 새 칸이
// 생기고 형식이 안 담으면 그날부터 저절로 보고된다.

/**
 * 그래프 내부용 파생 칸 — 사용자가 적은 것이 아니라 컴파일러가 붙인 것이다.
 * 이것들을 「잃었다」고 하면 상태 줄이 매번 시끄러워지고 진짜 손실이 묻힌다.
 */
const DERIVED_KEYS = new Set([
  'mtime',
  'filePath',
  'path_exists',
  'degree',
  'inDegree',
  'outDegree',
  'projectIds',
  'aliases',
  'merged_uids',
]);

/** 값이 실제로 들어 있나 — 빈 칸을 「잃었다」고 하지 않는다. */
function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * @param {object} input
 * @param {Array<Record<string, unknown>>} input.nodes 컴파일된 노드들.
 * @param {Array<Record<string, unknown>>} [input.edges] 컴파일된 엣지들.
 *   **관계의 이유(`rationale`)가 여기 산다** — 노드가 아니다. 이 제품이
 *   「마인드맵 선」과 「온톨로지 주장」을 가르는 바로 그 값이라, 안 나가면
 *   반드시 말해야 한다.
 * @param {readonly string[]|null} input.carriedKeys 이 형식이 실제로 담는 노드 칸.
 *   `null` 이면 원본 그대로라는 뜻이라 손실을 안 따진다.
 * @param {boolean} [input.carriesEdgeRationale] 이 형식이 엣지 이유를 담나.
 * @returns {{omitted: string[], counts: Record<string, number>, sentence: string|null}}
 */
export function describeExportOmissions({ nodes, edges, carriedKeys, carriesEdgeRationale = false }) {
  // `null` = 「이 형식은 원본 그대로다」 — 손실을 따지지 않는다.
  if (carriedKeys === null || carriedKeys === undefined) return { omitted: [], counts: {}, sentence: null };
  const carried = new Set(carriedKeys);
  const counts = {};
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== 'object') continue;
    for (const [key, value] of Object.entries(node)) {
      if (carried.has(key) || DERIVED_KEYS.has(key)) continue;
      if (!hasValue(value)) continue;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  if (!carriesEdgeRationale) {
    const withRationale = (Array.isArray(edges) ? edges : []).filter((edge) =>
      hasValue(edge?.rationale),
    ).length;
    if (withRationale > 0) counts['relation rationale'] = withRationale;
  }
  const omitted = Object.keys(counts).sort();
  if (omitted.length === 0) return { omitted, counts, sentence: null };
  const parts = omitted.map((key) => `${key} (${counts[key]})`);
  return {
    omitted,
    counts,
    sentence: `not carried by this format: ${parts.join(' · ')}`,
  };
}
