// 모든 CLI 명령이 공유하는 단일 ANSI 색 팔레트.
//
// 이전엔 44개 명령/엔트리 파일이 각자 동일한 `const COLORS = {...}` 를 인라인
// 정의(~300 줄 중복)했다. 색 값/키가 전부 동일했으므로 단일 진실원으로 통합 —
// 새 색을 추가하거나 톤을 바꿀 때 한 곳만 고친다. diagnosis-colors.mjs 의
// 헬퍼들이 이미 `colors` 파라미터를 받도록 설계돼 있어 이 객체를 그대로 넘긴다.
export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// 노드 kind(+ edge endpoint 상태) → 표시 색. 모든 CLI 명령이 *같은* 색으로 kind
// 를 그려 일관된 시각 언어를 준다. 이전엔 16개 명령이 각자 KIND_COLORS 를 정의해
// drift 가 생겼다: pattern-walk 는 element 를 cyan(=capability 와 충돌)으로,
// find/orphans/list 는 document 를 white 로 칠해 명령마다 같은 kind 가 다른 색.
// 단일 진실원으로 통합해 그 drift 를 제거하고 재발을 막는다. external/unresolved
// 는 edge endpoint 상태(노드 kind 아님)지만 일부 그래프 명령이 같은 map 으로
// 칠하므로 포함 — 미사용 명령에선 그냥 안 쓰이는 키.
export const KIND_COLORS = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.green,
  document: COLORS.dim,
  'vault-readme': COLORS.dim,
  external: COLORS.dim,
  unresolved: COLORS.dim,
};
