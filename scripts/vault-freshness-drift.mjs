#!/usr/bin/env node
// R+ — PR vault freshness bot (⑦).
//
// Computes which vault capability/element nodes reference source files that
// changed in a PR diff, but whose own `.md` was NOT updated in the same
// diff — i.e. the vault description of that code risks going stale. The
// `.github/workflows/vault-freshness.yml` Action calls this script and only
// wires up `git`/GitHub comment plumbing; all the actual drift logic lives
// here (and is unit tested in scripts/lib/vault-freshness-drift.test.mjs)
// so it's runnable and testable locally without touching GitHub Actions.
//
// Usage:
//   node scripts/vault-freshness-drift.mjs --base <ref> --head <ref>
//        [--vault docs/ontology] [--repo .] [--json]
//   node scripts/vault-freshness-drift.mjs --changed-files a.ts,b.ts --json
//
// Exit 0 always (informational — same non-blocking principle as the
// pre-commit preflight command). `--json` output is what the Action reads.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseFrontmatter } from "./lib/parse-frontmatter.mjs";
import {
  buildFreshnessCommentMarkdown,
  computeVaultFreshnessDrift,
} from "./lib/vault-freshness-drift.mjs";

function usage() {
  return [
    "Usage: node scripts/vault-freshness-drift.mjs [--vault docs/ontology] [--repo .] --base <ref> --head <ref> [--json]",
    "       node scripts/vault-freshness-drift.mjs --changed-files a.ts,b.ts [--vault docs/ontology] [--json]",
    "",
    "Finds vault capability/element nodes whose referenced source changed in a diff",
    "but whose own .md was not updated in the same diff (PR freshness check).",
    "",
    "Options:",
    "  --vault DIR            Vault folder, repo-relative. Default docs/ontology.",
    "  --repo DIR             Repo root paths resolve against. Default cwd.",
    "  --base REF             git diff base (e.g. origin/main, a commit SHA).",
    "  --head REF             git diff head. Default HEAD.",
    "  --changed-files LIST   Comma-separated changed files instead of running git diff",
    "                         (dry-run / testing without a real diff range).",
    "  --json                 Machine-readable output.",
    "  -h, --help             Show this help text.",
  ].join("\n");
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

function loadVaultDocs(vaultDir) {
  return walkMd(vaultDir).map((filePath) => {
    const { frontmatter } = parseFrontmatter(readFileSync(filePath, "utf-8"));
    return { slug: String(frontmatter.slug ?? "").trim() || filePath, frontmatter };
  });
}

function getChangedFiles({ repoRoot, base, head }) {
  const range = `${base}...${head}`;
  const out = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", range], {
    cwd: repoRoot,
    encoding: "utf-8",
  });
  return out.split("\n").map((line) => line.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  const flags = { vault: "docs/ontology", repo: ".", base: null, head: "HEAD", json: false, changedFiles: null };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--vault") flags.vault = args[++i];
    else if (a.startsWith("--vault=")) flags.vault = a.slice("--vault=".length);
    else if (a === "--repo") flags.repo = args[++i];
    else if (a.startsWith("--repo=")) flags.repo = a.slice("--repo=".length);
    else if (a === "--base") flags.base = args[++i];
    else if (a.startsWith("--base=")) flags.base = a.slice("--base=".length);
    else if (a === "--head") flags.head = args[++i];
    else if (a.startsWith("--head=")) flags.head = a.slice("--head=".length);
    else if (a === "--changed-files") flags.changedFiles = args[++i];
    else if (a.startsWith("--changed-files=")) flags.changedFiles = a.slice("--changed-files=".length);
    else if (a === "--json") flags.json = true;
    else return { error: `Unknown option: ${a}` };
  }
  if (!flags.changedFiles && !flags.base) {
    return { error: "Either --base <ref> or --changed-files <list> is required." };
  }
  return flags;
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.help) {
  console.log(usage());
  process.exit(0);
}
if (parsed.error) {
  process.stderr.write(`${parsed.error}\n${usage()}\n`);
  process.exit(2);
}

const repoRoot = resolve(parsed.repo);
const vaultDir = resolve(repoRoot, parsed.vault);

if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
  process.stderr.write(`Repo path does not exist: ${repoRoot}\n`);
  process.exit(2);
}

// Vault missing — nothing to check. Silent (exit 0, empty-shaped result),
// same "no vault → no noise" principle as the pre-commit preflight command.
let docs = [];
if (existsSync(vaultDir) && statSync(vaultDir).isDirectory()) {
  docs = loadVaultDocs(vaultDir);
}

let changedFiles;
if (parsed.changedFiles !== null) {
  changedFiles = parsed.changedFiles.split(",").map((f) => f.trim()).filter(Boolean);
} else {
  try {
    changedFiles = getChangedFiles({ repoRoot, base: parsed.base, head: parsed.head });
  } catch (err) {
    process.stderr.write(`git diff failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}

const result = computeVaultFreshnessDrift({
  docs,
  changedFiles,
  vaultDir: parsed.vault,
});
const commentMarkdown = buildFreshnessCommentMarkdown(result.staleNodes);

const payload = {
  vaultDir: parsed.vault,
  repoRoot,
  changedFilesCount: changedFiles.length,
  matchedTotal: result.matchedTotal,
  staleNodes: result.staleNodes,
  touchedNodeSlugs: result.touchedNodeSlugs,
  hasDrift: result.staleNodes.length > 0,
  commentMarkdown,
};

if (parsed.json) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (!payload.hasDrift) {
  console.log(`[vault-freshness] ${changedFiles.length} changed file(s) · 0 node(s) at risk of going stale ✓`);
  process.exit(0);
}

console.log(`[vault-freshness] ${payload.staleNodes.length} node(s) may go stale:\n`);
for (const node of payload.staleNodes) {
  console.log(`  ${node.kind.padEnd(11)} ${node.slug}`);
  for (const file of node.matchedFiles) console.log(`    - ${file}`);
}
console.log(`\nfix: update the node's .md in this PR, or it's a false positive — nothing blocks the PR.`);
process.exit(0);
