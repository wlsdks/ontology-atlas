/** Display only, like `derive-display-title.ts`: never used for search or matching. */

const KNOWN_CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|md|mdx|css|scss|json|ya?ml|py|rs|go|java|rb|swift|kt|vue|svelte|html|sql|sh)$/i;
const CODE_PATH_PREFIX =
  /^(src|app|cli|mcp|tests?|scripts?|docs|packages?|lib|apps?|internal|pkg)\//;
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
 * Title-casing an acronym gives the wrong name (`mcp/src/index.js` as "Mcp"). The list holds only
 * acronyms that appear in this repo's paths; a broad dictionary gives false positives such as a
 * person's name `Ai`.
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

export function looksLikeCodePath(title: string): boolean {
  const t = title.trim();
  if (!t.includes("/") || /\s/.test(t)) return false;
  return KNOWN_CODE_EXT.test(t) || CODE_PATH_PREFIX.test(t);
}

function isGenericSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  return GENERIC_LEAF.has(lower) || lower.length <= 3;
}

/**
 * Null when not a code path. A generic last segment is promoted to its parent, at most twice:
 *
 *     "src/features/user-auth/index.ts"       → "User Auth"
 *     ".claude/skills/ontology-sync/SKILL.md" → "Ontology Sync"
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

function capitalizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}
