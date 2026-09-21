#!/usr/bin/env bash
#
# Phase 3 of the field trial, run headlessly: a fresh reader that has the vault
# and nothing else.
#
# The whole measurement rests on one thing — the reader must not be able to
# reach the source. Here that is enforced twice: the allow-list names only the
# vault's read tools, and the disallow-list names every way back to the disk.
# A reader that can open a file will open it, and then the run measures the
# repository instead of the vault.
#
# Two runs are made. The first answers the sealed questions written before any
# vault existed. The second always asks the same seventh question, because a
# vault that never admits a doubt is the failure this trial keeps finding and
# no question set written in advance ever thinks to ask for it.
#
# usage: sealed-reader.sh <target-repo> <questions.md> [--out <dir>]
set -euo pipefail

die() { printf 'sealed-reader: %s\n' "$1" >&2; exit 1; }

target=""
questions=""
out=""
model="sonnet"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out) [ "$#" -ge 2 ] || die "--out needs a value"; out="$2"; shift 2 ;;
    --model) [ "$#" -ge 2 ] || die "--model needs a value"; model="$2"; shift 2 ;;
    -h|--help) sed -n '3,17p' "$0"; exit 0 ;;
    --*) die "unknown option $1" ;;
    *)
      if [ -z "$target" ]; then target="$1"
      elif [ -z "$questions" ]; then questions="$1"
      else die "too many arguments"; fi
      shift ;;
  esac
done
[ -n "$target" ] && [ -n "$questions" ] || die "usage: sealed-reader.sh <target-repo> <questions.md> [--out <dir>]"
[ -d "$target" ] || die "no such folder: $target"
[ -f "$questions" ] || die "no such questions file: $questions"
target="$(cd "$target" && pwd)"
questions="$(cd "$(dirname "$questions")" && pwd)/$(basename "$questions")"

repo_root="$(cd "$(dirname "$0")" && pwd)"
while [ "$repo_root" != "/" ] && [ ! -f "$repo_root/mcp/src/index.js" ]; do
  repo_root="$(dirname "$repo_root")"
done
[ -f "$repo_root/mcp/src/index.js" ] || die "could not find mcp/src/index.js above $0"

command -v claude >/dev/null 2>&1 || die "the agent command 'claude' is not on PATH"
vault="$target/atlas"
[ -d "$vault" ] || die "no vault at $vault — run acp-replay.sh first"

if [ -z "$out" ]; then
  out="${TMPDIR:-/tmp}/atlas-sealed-reader-$(basename "$target")-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$out"
printf 'sealed-reader: vault  %s\nsealed-reader: output %s\n' "$vault" "$out"

node -e '
const [cfg, server, vault, repo] = process.argv.slice(1);
require("node:fs").writeFileSync(cfg, JSON.stringify({
  mcpServers: { "atlas-vault": { command: process.execPath, args: [server], env: { OATLAS_VAULT: vault, OATLAS_REPO_ROOT: repo } } },
}, null, 1));
' "$out/mcp.json" "$repo_root/mcp/src/index.js" "$vault" "$target"

# Only the numbered questions reach the reader. Everything a question file says
# about scoring, or about which files hold the ground truth, is for the grader.
awk '/^Q[0-9]+\./ { keep = 1 } /^(Scoring|Ground truth|##)/ { keep = 0 } keep' "$questions" > "$out/questions.txt"
[ -s "$out/questions.txt" ] || die "no question lines (Q1. …) found in $questions"

read_tools=$(printf '%s' \
  "mcp__atlas-vault__get_concept,mcp__atlas-vault__get_concepts,mcp__atlas-vault__list_concepts," \
  "mcp__atlas-vault__list_kinds,mcp__atlas-vault__find_neighbors,mcp__atlas-vault__find_path," \
  "mcp__atlas-vault__find_backlinks,mcp__atlas-vault__query_concepts,mcp__atlas-vault__query_ontology," \
  "mcp__atlas-vault__find_evidence,mcp__atlas-vault__connection_info")
sealed_tools="Bash,Read,Glob,Grep,WebFetch,WebSearch,Edit,Write,NotebookEdit,Task"

preamble="You are a new engineer on this project. You have ONLY the atlas-vault MCP read tools; you cannot read source, run commands, or open files, and you must not guess. Answer from the vault. For every factual claim, cite the vault slug you read in full and, when the vault gives one, the source path it records. If the vault does not settle a question, say 'the vault does not say' rather than inventing."

unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT || true
cd "$target"

printf 'sealed-reader: the sealed questions\n'
claude -p "$preamble Questions:
$(cat "$out/questions.txt")" \
  --model "$model" --max-turns 60 --output-format json \
  --mcp-config "$out/mcp.json" --strict-mcp-config \
  --allowedTools "$read_tools" --disallowedTools "$sealed_tools" \
  > "$out/answers.json" 2> "$out/answers.err" || true

printf 'sealed-reader: the fixed seventh question\n'
claude -p "$preamble Question: Which claims in this vault does the vault itself mark as uncertain, unverified, or resting on files the builder says it did not read? List each such statement with its slug. If the vault records none, say so plainly." \
  --model "$model" --max-turns 40 --output-format json \
  --mcp-config "$out/mcp.json" --strict-mcp-config \
  --allowedTools "$read_tools" --disallowedTools "$sealed_tools" \
  > "$out/uncertainty.json" 2> "$out/uncertainty.err" || true

node -e '
const { readFileSync } = require("node:fs");
const outDir = process.argv[1];
for (const [label, file] of [["sealed questions", "answers"], ["uncertainty", "uncertainty"]]) {
  let data = null;
  try { data = JSON.parse(readFileSync(`${outDir}/${file}.json`, "utf8")); } catch { /* left below as unreadable */ }
  if (!data) { console.log(`  ${label}: no readable result — see ${outDir}/${file}.err`); continue; }
  const cost = data.total_cost_usd == null ? "?" : `$${data.total_cost_usd.toFixed(2)}`;
  const secs = data.duration_ms == null ? "?" : `${Math.round(data.duration_ms / 1000)}s`;
  console.log(`  ${label}: ${data.num_turns ?? "?"} turns, ${secs}, ${cost} → ${outDir}/${file}.json`);
}
console.log("");
console.log("  Grade the answers against the clone yourself (phase 4). A cited slug is not a verified claim.");
' "$out"
