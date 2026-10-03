#!/usr/bin/env bash
#
# Headless replay of the app's "build a first ontology from my code" door.
#
# The door is three things the app puts together: the vault MCP bound to one
# folder, the session's appended handoff, and the first-run instruction sent as
# the person's own turn. This script assembles the same three outside the app so
# a construction-rule change can be measured without a window, a build, or a
# person clicking. What it cannot reproduce is the permission card: a headless
# run replaces it with an allow-list, so every write here is pre-approved. Say
# that in the ledger; do not report the run as proof that the card holds.
#
# The two prompt texts are read out of the app source at run time. Copying them
# into this file would let the trial keep measuring a wording the app no longer
# sends, which is the one failure that makes every number below meaningless.
#
# usage: acp-replay.sh <target-repo> [--model opus] [--out <dir>] [--starter]
set -euo pipefail

die() { printf 'acp-replay: %s\n' "$1" >&2; exit 1; }

target=""
model="opus"
starter=0
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --model) [ "$#" -ge 2 ] || die "--model needs a value"; model="$2"; shift 2 ;;
    --out) [ "$#" -ge 2 ] || die "--out needs a value"; out="$2"; shift 2 ;;
    --starter) starter=1; shift ;;
    -h|--help) sed -n '3,18p' "$0"; exit 0 ;;
    --*) die "unknown option $1" ;;
    *) [ -z "$target" ] || die "only one target repository"; target="$1"; shift ;;
  esac
done
[ -n "$target" ] || die "usage: acp-replay.sh <target-repo> [--model opus] [--out <dir>] [--starter]"
[ -d "$target" ] || die "no such folder: $target"
target="$(cd "$target" && pwd)"

# The repository root is found by walking up from this script, so the trial can
# be started from anywhere and still bind the source MCP of this checkout.
repo_root="$(cd "$(dirname "$0")" && pwd)"
while [ "$repo_root" != "/" ] && [ ! -f "$repo_root/mcp/src/index.js" ]; do
  repo_root="$(dirname "$repo_root")"
done
[ -f "$repo_root/mcp/src/index.js" ] || die "could not find mcp/src/index.js above $0"

command -v claude >/dev/null 2>&1 || die "the agent command 'claude' is not on PATH"
command -v node >/dev/null 2>&1 || die "node is not on PATH"

vault="$target/atlas"
# The app's "build from code" door creates an EMPTY atlas folder (it writes no
# starter nodes; `use-build-from-code.ts` only mkdirs). Running `init` here
# planted the starter example domain, capability and element, and two Opus
# builds on unfamiliar repositories (2026-09-22) left them in the finished map
# without a word. Pass --starter to reproduce the "start fresh" door instead.
if [ ! -d "$vault" ]; then
  if [ "$starter" = "1" ]; then
    node "$repo_root/cli/src/index.mjs" init "$vault" >/dev/null
  else
    mkdir -p "$vault"
  fi
fi

if [ -z "$out" ]; then
  out="${TMPDIR:-/tmp}/atlas-acp-replay-$(basename "$target")-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$out"
printf 'acp-replay: target %s\nacp-replay: vault  %s\nacp-replay: output %s\n' "$target" "$vault" "$out"

node -e '
const [cfg, server, vault, repo] = process.argv.slice(1);
require("node:fs").writeFileSync(cfg, JSON.stringify({
  mcpServers: { "atlas-vault": { command: process.execPath, args: [server], env: { OATLAS_VAULT: vault, OATLAS_REPO_ROOT: repo } } },
}, null, 1));
' "$out/mcp.json" "$repo_root/mcp/src/index.js" "$vault" "$target"

# ---------------------------------------------------------------------------
# The two prompts, read from the app source. A shape change is a hard stop.
# ---------------------------------------------------------------------------
node --input-type=module - "$repo_root" "$target" "$out" <<'EXTRACT'
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [repoRoot, targetRoot, outDir] = process.argv.slice(2);
const { constructionPrompts } = await import(pathToFileURL(join(repoRoot, 'scripts/lib/construction-prompts.mjs')));
const { handoff, firstTurn } = constructionPrompts(repoRoot, targetRoot);
writeFileSync(join(outDir, 'handoff.txt'), handoff);
writeFileSync(join(outDir, 'turn-one.txt'), firstTurn);
console.log(`acp-replay: handoff ${handoff.length} characters, door instruction ${firstTurn.length} characters`);
EXTRACT

# ---------------------------------------------------------------------------
# The two turns. The environment variables are cleared because a session
# launched from inside an agent inherits them and reports the wrong entrypoint.
# ---------------------------------------------------------------------------
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT || true
cd "$target"

allowed="mcp__atlas-vault__*"
started=$(date +%s)

# <prefix>.jsonl -> <prefix>.json (the final result record) and <prefix>.tools.json
# (tool name -> call count, plus every read_source call's file and mode).
extract_result() {
  node -e '
const { readFileSync, writeFileSync } = require("node:fs");
const prefix = process.argv[1];
let result = null;
const calls = {};
const reads = [];
for (const line of readFileSync(`${prefix}.jsonl`, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let event;
  try { event = JSON.parse(line); } catch { continue; }
  if (event.type === "result") result = event;
  const content = event.type === "assistant" ? event.message?.content : null;
  for (const block of Array.isArray(content) ? content : []) {
    if (block.type !== "tool_use") continue;
    const name = String(block.name).replace(/^mcp__[^_]+(?:_[^_]+)*__/, "");
    calls[name] = (calls[name] ?? 0) + 1;
    if (/read_source$/.test(String(block.name))) {
      reads.push({ path: block.input?.path ?? null, mode: block.input?.mode ?? "text" });
    }
  }
}
writeFileSync(`${prefix}.json`, result ? JSON.stringify(result) : "");
writeFileSync(`${prefix}.tools.json`, JSON.stringify({ calls, reads }, null, 2));
' "$1"
}

printf 'acp-replay: turn one (survey and proposal)\n'
# stream-json keeps every tool call in turn-<n>.jsonl; the last `result` line is
# the same record --output-format json would have written, saved as turn-<n>.json.
# Kept because the 2026-09-23 Rust row could not say whether the builder had
# outlined a file it cited: the result record alone does not carry tool calls.
claude -p "$(cat "$out/turn-one.txt")" \
  --model "$model" --max-turns 80 --output-format stream-json --verbose \
  --mcp-config "$out/mcp.json" --strict-mcp-config --allowedTools "$allowed" \
  --append-system-prompt "$(cat "$out/handoff.txt")" \
  > "$out/turn-one.jsonl" 2> "$out/turn-one.err" || true
extract_result "$out/turn-one"

session=$(node -e '
const data = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
if (!data.session_id) { console.error("acp-replay: turn one returned no session id"); process.exit(1); }
console.log(data.session_id);
' "$out/turn-one.json")

printf 'acp-replay: turn two (the person says go ahead), session %s\n' "$session"
claude -p "Yes. Go ahead and build all of it exactly as you proposed, and finish the job in this turn: create the nodes and relations, bind the code folder, validate, and tell me what the vault now holds." \
  --resume "$session" \
  --model "$model" --max-turns 120 --output-format stream-json --verbose \
  --mcp-config "$out/mcp.json" --strict-mcp-config --allowedTools "$allowed" \
  --append-system-prompt "$(cat "$out/handoff.txt")" \
  > "$out/turn-two.jsonl" 2> "$out/turn-two.err" || true
extract_result "$out/turn-two"

elapsed=$(( $(date +%s) - started ))

node -e '
const { readFileSync, writeFileSync, readdirSync, existsSync } = require("node:fs");
const [outDir, vault, target, model, elapsed] = process.argv.slice(1);
const turn = (name) => {
  try { return JSON.parse(readFileSync(`${outDir}/${name}.json`, "utf8")); } catch { return null; }
};
const summarise = (data) => data && ({
  session_id: data.session_id ?? null,
  num_turns: data.num_turns ?? null,
  total_cost_usd: data.total_cost_usd ?? null,
  duration_ms: data.duration_ms ?? null,
  is_error: data.is_error ?? null,
});
const one = turn("turn-one");
const two = turn("turn-two");
const byKind = {};
if (existsSync(vault)) {
  for (const entry of readdirSync(vault, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    byKind[entry.name] = readdirSync(`${vault}/${entry.name}`).filter((f) => f.endsWith(".md")).length;
  }
}
const finalText = typeof two?.result === "string" ? two.result : "";
const tools = (name) => {
  try { return JSON.parse(readFileSync(`${outDir}/${name}.tools.json`, "utf8")); } catch { return null; }
};
const twoTools = tools("turn-two");
// The tool trace decides; the wording of the final answer only stands in when
// the trace is missing (the 2026-09-23 Rust run finalized and said "finalization").
const finalized = twoTools
  ? Object.keys(twoTools.calls).some((name) => name.endsWith("finalize_project_meaning"))
  : finalText.includes("finalize_project_meaning") || /finali[sz]/i.test(finalText);
const report = {
  target, vault, model,
  wallClockSeconds: Number(elapsed),
  turns: { one: summarise(one), two: summarise(two) },
  nodesByKindFolder: byKind,
  finalized,
  toolCalls: twoTools?.calls ?? null,
};
writeFileSync(`${outDir}/replay.json`, JSON.stringify(report, null, 1));
const cost = (t) => (t?.total_cost_usd == null ? "?" : `$${t.total_cost_usd.toFixed(2)}`);
const secs = (t) => (t?.duration_ms == null ? "?" : `${Math.round(t.duration_ms / 1000)}s`);
const total = [one, two].reduce((sum, t) => sum + (t?.total_cost_usd ?? 0), 0);
const nodes = Object.values(byKind).reduce((sum, n) => sum + n, 0);
console.log("");
console.log(`  target        ${target}`);
console.log(`  model         ${model}`);
console.log(`  turn one      ${one?.num_turns ?? "?"} agent turns, ${secs(one)}, ${cost(one)}`);
console.log(`  turn two      ${two?.num_turns ?? "?"} agent turns, ${secs(two)}, ${cost(two)}`);
console.log(`  wall clock    ${elapsed}s      total $${total.toFixed(2)}`);
console.log(`  vault         ${nodes} nodes — ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(", ") || "empty"}`);
console.log(`  finished      ${finalized ? (twoTools ? "finalize_project_meaning was called" : "the final answer speaks of finalizing the project meaning") : (twoTools ? "finalize_project_meaning was never called — the build stopped short" : "the final answer never mentions finalizing — the build stopped short")}`);
if (twoTools) {
  const outlines = twoTools.reads.filter((r) => r.mode === "outline").length;
  console.log(`  reads         ${twoTools.reads.length} read_source calls in turn two, ${outlines} in outline mode`);
}
console.log(`  written to    ${outDir}/replay.json`);
console.log("");
console.log("  The permission card was replaced by an allow-list. This run is not evidence that the card holds.");
' "$out" "$vault" "$target" "$model" "$elapsed"
