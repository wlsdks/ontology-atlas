#!/usr/bin/env node
// R13 #58 — vault path drift audit.
//
// dogfood vault (docs/ontology/) 의 capability/element 노드들이 실 코드
// path 와 drift 없는지 검증. 각 노드 frontmatter 의:
//   - `path:` (string)         — element 의 source-file path
//   - `elements:` (string[])   — capability 가 owns 하는 source paths
// 가 실제로 fs 에 존재하는지 확인. 못 찾는 path 는 drift.
//
// 사용:
//   node scripts/audit-vault-paths.mjs                    # 기본: docs/ontology vs cwd
//   node scripts/audit-vault-paths.mjs <vault> <repo>     # 명시
//   pnpm vault:audit                                       # package.json script
//
// exit 1 if drift, 0 if clean — CI gateable.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseFrontmatter } from "./lib/parse-frontmatter.mjs";
// R13 #58 logic now lives in the MCP package (shared with the agent-callable
// validate_vault pathDrift surface) — single source of truth. Atlas Track A #2.
import { detectVaultPathDrift } from "../mcp/src/detect-drift.mjs";

const COLORS = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

function usage() {
  return [
    "Usage: node scripts/audit-vault-paths.mjs [vaultDir] [repoDir]",
    "",
    "Audits dogfood ontology capability/element source paths against the repo.",
    "",
    "Arguments:",
    "  vaultDir     Ontology vault folder. Defaults to docs/ontology.",
    "  repoDir      Repository root for path resolution. Defaults to current directory.",
    "",
    "Options:",
    "  -h, --help   Show this help text.",
  ].join("\n");
}

const args = process.argv.slice(2);
if (args[0] === "--") {
  args.shift();
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}
if (args.length > 2) {
  process.stderr.write(`Unexpected argument: ${args[2]}\n${usage()}\n`);
  process.exit(2);
}
if (args[0]?.startsWith("-")) {
  process.stderr.write(`Unknown option: ${args[0]}\n${usage()}\n`);
  process.exit(2);
}
if (args[1]?.startsWith("-")) {
  process.stderr.write(`Unknown option: ${args[1]}\n${usage()}\n`);
  process.exit(2);
}
const VAULT = resolve(args[0] ?? "docs/ontology");
const REPO = resolve(args[1] ?? ".");

if (!existsSync(VAULT)) {
  process.stderr.write(`Vault path does not exist: ${VAULT}\n`);
  process.exit(2);
}
if (!statSync(VAULT).isDirectory()) {
  process.stderr.write(`Vault path is not a directory: ${VAULT}\n`);
  process.exit(2);
}
if (!existsSync(REPO)) {
  process.stderr.write(`Repo path does not exist: ${REPO}\n`);
  process.exit(2);
}
if (!statSync(REPO).isDirectory()) {
  process.stderr.write(`Repo path is not a directory: ${REPO}\n`);
  process.exit(2);
}

function walkMd(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMd(full, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// Build parsed docs, then delegate to the shared detector (single source of
// truth with the MCP validate_vault pathDrift surface). slug preserves the
// previous behavior (frontmatter.slug, else the file path).
const docs = walkMd(VAULT).map((filePath) => {
  const { frontmatter } = parseFrontmatter(readFileSync(filePath, "utf-8"));
  return { slug: String(frontmatter.slug ?? "").trim() || filePath, frontmatter };
});
const { nodesScanned, pathsChecked, drifts } = detectVaultPathDrift({
  docs,
  repoRoot: REPO,
  fileExists: existsSync,
});

if (drifts.length === 0) {
  console.log(
    `${COLORS.green}[audit-vault-paths]${COLORS.reset} ${nodesScanned} nodes · ${pathsChecked} paths checked · ${COLORS.bold}drift 0 ✓${COLORS.reset}`,
  );
  process.exit(0);
}

console.log(
  `${COLORS.bold}[audit-vault-paths]${COLORS.reset} ${nodesScanned} nodes · ${pathsChecked} paths checked · ${COLORS.red}${drifts.length} drift${COLORS.reset}\n`,
);

// Group by slug for readability
const bySlug = new Map();
for (const d of drifts) {
  if (!bySlug.has(d.slug)) bySlug.set(d.slug, { kind: d.kind, items: [] });
  bySlug.get(d.slug).items.push(d);
}

for (const [slug, { kind, items }] of bySlug) {
  console.log(`  ${COLORS.bold}${slug}${COLORS.reset} ${COLORS.dim}(${kind})${COLORS.reset}`);
  for (const d of items) {
    console.log(
      `    ${COLORS.red}✗${COLORS.reset} ${d.key}: ${COLORS.yellow}${d.missingPath}${COLORS.reset} ${COLORS.dim}— path not found in repo${COLORS.reset}`,
    );
  }
}

console.log(
  `\n${COLORS.dim}fix: edit the .md to point at a real path, or remove the entry if the code was deleted.${COLORS.reset}`,
);
process.exit(1);
