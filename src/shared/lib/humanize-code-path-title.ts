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
// 사용성 검수 — "Src"·"SKILL"·"Verify" 같은 1단어 잔재가 그대로 display 로
// 새는 결함. 알려진 generic 세그먼트 단어 + (목록 밖이라도) 3글자 이하의
// 짧은 한 세그먼트는 "잔재"로 보고 부모 세그먼트로 승격한다.
const GENERIC_LEAF = new Set([
  "index",
  "mod",
  "main",
  "readme",
  "src",
  "lib",
  "ui",
  "api",
  "util",
  "utils",
  "core",
  "base",
  "types",
  "test",
  "spec",
  "skill",
]);
const MAX_PROMOTIONS = 2;
/**
 * 두문자어는 첫 글자만 대문자로 올리면 **틀린 이름**이 된다 — 실측
 * (2026-07-26 도그푸드): `mcp/src/index.js` 가 「Mcp」로 그려져 인사이트
 * 랭킹 4위에 앉았고, 같은 앱의 다른 화면은 같은 것을 「MCP」로 불렀다.
 * 한 개념이 화면마다 다른 이름으로 보이면 사용자는 둘로 센다.
 *
 * 목록은 **이 저장소의 경로에 실제로 나오는 것**만 담는다. "모든 두문자어"
 * 사전은 오탐(예: 사람 이름 `Ai`)을 만들고, 그 오탐은 조용히 데이터를
 * 왜곡한다. 새 두문자어가 경로에 등장하면 그때 한 줄 추가한다.
 */
const ACRONYMS = new Set([
  "mcp",
  "cli",
  "api",
  "ui",
  "ux",
  "ai",
  "id",
  "url",
  "uri",
  "http",
  "https",
  "json",
  "yaml",
  "css",
  "html",
  "svg",
  "sql",
  "npm",
  "db",
  "dom",
  "e2e",
  "llm",
  "byok",
  "opfs",
  "qa",
  "rfc",
  "skos",
  "tsx",
  "jsx",
]);

/** 코드 경로처럼 보이는 title 판정 — 공백 없고 '/' 포함, 그리고 (알려진 확장자 or 알려진 루트 폴더 prefix). */
export function looksLikeCodePath(title: string): boolean {
  const t = title.trim();
  if (!t.includes("/") || /\s/.test(t)) return false;
  return KNOWN_CODE_EXT.test(t) || CODE_PATH_PREFIX.test(t);
}

/** 세그먼트가 "잔재" 단어인가 — GENERIC_LEAF 목록에 있거나, 목록 밖이라도
 * 3글자 이하로 짧아 그대로 노출하면 뜻을 알기 어려운 경우. */
function isGenericSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  return GENERIC_LEAF.has(lower) || lower.length <= 3;
}

/**
 * 경로 → 사람 이름. 코드 경로가 아니면 null (호출부가 기존 display 유지).
 * 규칙: 마지막 세그먼트 → 확장자 제거 → generic 잔재 세그먼트면 부모 세그먼트로
 * 승격(승격 후에도 generic 이면 한 단계 더, 최대 2단계) → kebab/snake/camel
 * 경계 공백화 → 단어별 첫 글자 대문자(두문자어는 전부 대문자).
 * 예: "src/widgets/topology-map-v2/ui/topology-world.ts" → "Topology World"
 *     "cli/src/commands/agent-brief.mjs" → "Agent Brief"
 *     "src/features/user-auth/index.ts" → "User Auth"
 *     ".claude/skills/ontology-sync/SKILL.md" → "Ontology Sync"
 *     "src/lib/index.ts" → "Src" (부모(lib)도 generic 이라 2단계 승격, 그 이상
 *     승격할 세그먼트가 없으면 거기서 멈춘다)
 * 순수·결정론 — 렌더 전용(매칭 금지 계약은 derive-display-title.ts 와 동일).
 */
export function humanizeCodePathTitle(title: string): string | null {
  if (!looksLikeCodePath(title)) return null;
  const segs = title.trim().split("/").filter(Boolean);
  if (segs.length === 0) return null;
  let idx = segs.length - 1;
  let leaf = segs[idx].replace(KNOWN_CODE_EXT, "");
  let promotions = 0;
  while (isGenericSegment(leaf) && idx > 0 && promotions < MAX_PROMOTIONS) {
    idx -= 1;
    leaf = segs[idx];
    promotions += 1;
  }
  const words = leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_.\s]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map(capitalizeWord).join(" ");
}

/** 두문자어는 전부 대문자, 그 외는 첫 글자만. */
function capitalizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}
