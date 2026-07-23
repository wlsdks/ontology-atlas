/**
 * element 노드의 title 이 코드 경로 원문(`src/widgets/foo/bar-baz.ts`)일 때
 * 사람이 읽는 이름으로 변환하는 순수 함수 — display 레이어 전용.
 *
 * `derive-display-title.ts` 와 동일한 계약: 순수·결정론·렌더링 표면 전용.
 * **검색/매칭에는 쓰지 않는다** — vault frontmatter / title / slug 는 원문
 * 그대로 유지되고, 이 함수의 결과는 표시(display) 값 파생에만 쓰인다.
 */

const KNOWN_CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|md|mdx|css|scss|json|ya?ml|py|rs|go|java|rb|swift|kt|vue|svelte|html|sql|sh)$/i;
const CODE_PATH_PREFIX =
  /^(src|app|cli|mcp|tests?|scripts?|docs|packages?|lib|apps?|internal|pkg)\//;
const GENERIC_LEAF = new Set(["index", "mod", "main", "readme"]);

/** 코드 경로처럼 보이는 title 판정 — 공백 없고 '/' 포함, 그리고 (알려진 확장자 or 알려진 루트 폴더 prefix). */
export function looksLikeCodePath(title: string): boolean {
  const t = title.trim();
  if (!t.includes("/") || /\s/.test(t)) return false;
  return KNOWN_CODE_EXT.test(t) || CODE_PATH_PREFIX.test(t);
}

/**
 * 경로 → 사람 이름. 코드 경로가 아니면 null (호출부가 기존 display 유지).
 * 규칙: 마지막 세그먼트 → 확장자 제거 → index/mod/main/README 면 부모 세그먼트
 * 승격 → kebab/snake/camel 경계 공백화 → 단어별 첫 글자 대문자.
 * 예: "src/widgets/topology-map-v2/ui/topology-world.ts" → "Topology World"
 *     "cli/src/commands/agent-brief.mjs" → "Agent Brief"
 *     "src/features/user-auth/index.ts" → "User Auth"
 * 순수·결정론 — 렌더 전용(매칭 금지 계약은 derive-display-title.ts 와 동일).
 */
export function humanizeCodePathTitle(title: string): string | null {
  if (!looksLikeCodePath(title)) return null;
  const segs = title.trim().split("/").filter(Boolean);
  if (segs.length === 0) return null;
  let leaf = segs[segs.length - 1].replace(KNOWN_CODE_EXT, "");
  if (GENERIC_LEAF.has(leaf.toLowerCase()) && segs.length >= 2) leaf = segs[segs.length - 2];
  const words = leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_.\s]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
