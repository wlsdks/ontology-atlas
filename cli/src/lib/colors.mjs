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
