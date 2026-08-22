/**
 * Turns an element node's title into a human-readable name when that title is a
 * raw code path (`src/widgets/foo/bar-baz.ts`). Display layer only.
 *
 * Same contract as `derive-display-title.ts`: pure, deterministic, render
 * surfaces only. **Never used for search or matching** — the vault's
 * frontmatter, title and slug stay verbatim, and this result feeds display
 * values alone.
 */

const KNOWN_CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|md|mdx|css|scss|json|ya?ml|py|rs|go|java|rb|swift|kt|vue|svelte|html|sql|sh)$/i;
const CODE_PATH_PREFIX =
  /^(src|app|cli|mcp|tests?|scripts?|docs|packages?|lib|apps?|internal|pkg)\//;
// A usability review found one-word leftovers like "Src", "SKILL" and "Verify"
// leaking straight through to the display. A segment counts as a leftover if it
// is a known generic word, or (even off the list) is 3 characters or fewer, and
// is promoted to its parent segment.
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
 * Title-casing an acronym produces **the wrong name**. Measured while
 * dogfooding, 2026-07-26: `mcp/src/index.js` rendered as "Mcp" and sat fourth in
 * the insights ranking, while another screen in the same app called the same
 * thing "MCP". One concept under two names on two screens gets counted twice by
 * the user.
 *
 * The list holds **only what actually appears in this repo's paths**. An
 * "all acronyms" dictionary produces false positives (a person's name `Ai`, for
 * instance) that silently distort the data. Add a line when a new acronym shows
 * up in a path.
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

/** Does this title look like a code path — no whitespace, contains '/', and either a known extension or a known root-folder prefix. */
export function looksLikeCodePath(title: string): boolean {
  const t = title.trim();
  if (!t.includes("/") || /\s/.test(t)) return false;
  return KNOWN_CODE_EXT.test(t) || CODE_PATH_PREFIX.test(t);
}

/** Is this segment a leftover — on the GENERIC_LEAF list, or short enough
 * (3 characters or fewer) that showing it would carry no meaning. */
function isGenericSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  return GENERIC_LEAF.has(lower) || lower.length <= 3;
}

/**
 * Path → human name; null when it is not a code path, in which case the caller
 * keeps the existing display value.
 *
 * The rule: take the last segment → strip the extension → if it is a leftover,
 * promote to the parent segment (repeat once more if that is also a leftover,
 * at most twice) → split on kebab/snake/camel boundaries → title-case each word,
 * with acronyms fully uppercase.
 *
 *     "src/widgets/topology-map-v2/ui/topology-world.ts" → "Topology World"
 *     "cli/src/commands/agent-brief.mjs"                 → "Agent Brief"
 *     "src/features/user-auth/index.ts"                  → "User Auth"
 *     ".claude/skills/ontology-sync/SKILL.md"            → "Ontology Sync"
 *     "src/lib/index.ts"                                 → "Src"
 *
 * The last one promotes twice (`lib` is generic too) and then stops, because
 * there is nothing left to promote to.
 *
 * Pure and deterministic, render only — the same never-for-matching contract as
 * `derive-display-title.ts`.
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

/** Acronyms fully uppercase, everything else title-cased. */
function capitalizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}
