#!/usr/bin/env node
// Vault path drift audit: for each capability/element node of the dogfood vault (docs/ontology/), the
// frontmatter `path:` (string) and `elements:` (string[]) must exist on disk; a path that cannot be
// found is drift.
//
// Usage:
//   node scripts/vault/audit-vault-paths.mjs                    # default: docs/ontology vs cwd
//   node scripts/vault/audit-vault-paths.mjs <vault> <repo>     # explicit
//   pnpm vault:audit
//
// Exit 1 if drift, 0 if clean.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
// The detection lives in the server: this script asks `validate_vault` for its `pathDrift`, the
// same answer an agent gets, so the two cannot disagree.
import { callMcpTool } from "../../mcp/scripts/call-tool.mjs";

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
    "Usage: node scripts/vault/audit-vault-paths.mjs [vaultDir] [repoDir]",
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

// A whole-vault validation takes about 6 s here alone and more under a busy machine.
const validation = await callMcpTool(VAULT, "validate_vault", {}, { repoRoot: REPO, timeoutMs: 120_000 });
const { pathDrift } = validation;
if (!pathDrift?.checked) {
  process.stderr.write(`validate_vault did not check paths: ${pathDrift?.reason ?? "no pathDrift in its answer"}\n`);
  process.exit(2);
}
const { pathsChecked, drifts } = pathDrift;
const nodesScanned = pathDrift.nodesScanned;

if (drifts.length === 0) {
  console.log(
    `${COLORS.green}[audit-vault-paths]${COLORS.reset} ${nodesScanned} nodes · ${pathsChecked} paths checked · ${COLORS.bold}drift 0 ✓${COLORS.reset}`,
  );
  process.exit(0);
}

console.log(
  `${COLORS.bold}[audit-vault-paths]${COLORS.reset} ${nodesScanned} nodes · ${pathsChecked} paths checked · ${COLORS.red}${drifts.length} drift${COLORS.reset}\n`,
);

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
