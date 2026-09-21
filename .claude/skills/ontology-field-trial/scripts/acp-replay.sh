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
# usage: acp-replay.sh <target-repo> [--model opus] [--out <dir>]
set -euo pipefail

die() { printf 'acp-replay: %s\n' "$1" >&2; exit 1; }

target=""
model="opus"
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --model) [ "$#" -ge 2 ] || die "--model needs a value"; model="$2"; shift 2 ;;
    --out) [ "$#" -ge 2 ] || die "--out needs a value"; out="$2"; shift 2 ;;
    -h|--help) sed -n '3,18p' "$0"; exit 0 ;;
    --*) die "unknown option $1" ;;
    *) [ -z "$target" ] || die "only one target repository"; target="$1"; shift ;;
  esac
done
[ -n "$target" ] || die "usage: acp-replay.sh <target-repo> [--model opus] [--out <dir>]"
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
if [ ! -d "$vault" ]; then
  node "$repo_root/cli/src/index.mjs" init "$vault" >/dev/null
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
cat > "$out/extract-prompts.mjs" <<'EXTRACT'
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [repoRoot, targetRoot, outDir] = process.argv.slice(2);
const SESSION = 'src/features/acp-session/model/use-acp-session.ts';
const DOOR = 'src/features/first-run-starter/model/build-from-code-prompt.ts';

function fail(file, why) {
  console.error(`acp-replay: cannot read the prompt from ${file}: ${why}.`);
  console.error('acp-replay: that file changed shape. Repair this extractor; never replay a stale copy of a prompt the app no longer sends.');
  process.exit(1);
}

function read(file) {
  try {
    return readFileSync(join(repoRoot, file), 'utf8');
  } catch {
    fail(file, 'the file is missing');
  }
}

/** Walk source that may contain strings and comments, stopping at one delimiter. */
function walk(source, from, stop) {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      if (end === -1) return -1;
      i = end;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      for (; j < source.length; j += 1) {
        if (source[j] === '\\') { j += 1; continue; }
        if (source[j] === quote) break;
      }
      if (j >= source.length) return -1;
      i = j;
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else continue;
    const answer = stop(ch, depth, i);
    if (answer !== undefined) return answer;
  }
  return -1;
}

/** The right-hand side of `const NAME = …;`, comments and all — valid JavaScript. */
function constantExpression(source, name, file) {
  const match = new RegExp(`(?:^|\\n)const ${name}\\s*(?::[^=\\n]*)?=`).exec(source);
  if (!match) fail(file, `the declaration of ${name} is gone`);
  const start = match.index + match[0].length;
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') { const end = source.indexOf('\n', i); if (end === -1) break; i = end; continue; }
    if (ch === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); if (end === -1) break; i = end + 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      for (; j < source.length; j += 1) {
        if (source[j] === '\\') { j += 1; continue; }
        if (source[j] === quote) break;
      }
      if (j >= source.length) break;
      i = j;
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ';' && depth === 0) return source.slice(start, i);
  }
  fail(file, `the declaration of ${name} does not end`);
}

/** One function turned into an arrow expression: its parameter types dropped, its body untouched. */
function functionExpression(source, name, file) {
  const head = `function ${name}(`;
  const at = source.indexOf(head);
  if (at === -1) fail(file, `the function ${name} is gone`);
  const parenAt = at + head.length - 1;
  const parenEnd = walk(source, parenAt, (ch, depth, i) => (ch === ')' && depth === 0 ? i : undefined));
  if (parenEnd === -1) fail(file, `the parameter list of ${name} does not close`);
  const params = source
    .slice(parenAt + 1, parenEnd)
    .split(',')
    .map((part) => part.split(':')[0].trim())
    .filter(Boolean);
  const braceAt = source.indexOf('{', parenEnd);
  if (braceAt === -1) fail(file, `the body of ${name} is gone`);
  const braceEnd = walk(source, braceAt, (ch, depth, i) => (ch === '}' && depth === 0 ? i : undefined));
  if (braceEnd === -1) fail(file, `the body of ${name} does not close`);
  return `(${params.join(', ')}) => ${source.slice(braceAt, braceEnd + 1)}`;
}

function evaluate(expression, names, values, file, what) {
  try {
    // Parenthesised, because several of these declarations put their value on
    // the line after the `=`, and a bare `return` before a newline returns nothing.
    return new Function(...names, `return (${expression}\n);`)(...values);
  } catch (error) {
    fail(file, `${what} could not be evaluated (${error.message})`);
  }
}

const sessionSource = read(SESSION);
const doorSource = read(DOOR);

const slot = evaluate(constantExpression(sessionSource, 'ANSWER_LANGUAGE_SLOT', SESSION), [], [], SESSION, 'the answer-language slot');
const mcpSentence = evaluate(constantExpression(sessionSource, 'VAULT_MCP_SENTENCE', SESSION), [], [], SESSION, 'the MCP sentence');
const constructionSentence = evaluate(constantExpression(sessionSource, 'VAULT_CONSTRUCTION_SENTENCE', SESSION), [], [], SESSION, 'the construction sentence');
const base = evaluate(constantExpression(sessionSource, 'VAULT_HANDOFF_BASE', SESSION), ['ANSWER_LANGUAGE_SLOT'], [slot], SESSION, 'the handoff base');
const languageName = evaluate(functionExpression(sessionSource, 'languageName', SESSION), [], [], SESSION, 'the language name');
const answerLanguageSentence = evaluate(functionExpression(sessionSource, 'answerLanguageSentence', SESSION), ['languageName'], [languageName], SESSION, 'the answer-language sentence');
const vaultHandoffPrompt = evaluate(
  functionExpression(sessionSource, 'vaultHandoffPrompt', SESSION),
  ['VAULT_HANDOFF_BASE', 'VAULT_MCP_SENTENCE', 'VAULT_CONSTRUCTION_SENTENCE', 'ANSWER_LANGUAGE_SLOT', 'answerLanguageSentence'],
  [base, mcpSentence, constructionSentence, slot, answerLanguageSentence],
  SESSION,
  'the handoff',
);
const buildFromCodePrompt = evaluate(functionExpression(doorSource, 'buildFromCodePrompt', DOOR), [], [], DOOR, 'the door instruction');

const handoff = vaultHandoffPrompt(true, 'en');
const firstTurn = buildFromCodePrompt(targetRoot, null);

if (typeof handoff !== 'string' || !handoff.includes('atlas-vault') || !handoff.includes('connection_info')) {
  fail(SESSION, 'the rendered handoff no longer names the vault server or its first read call');
}
if (typeof firstTurn !== 'string' || !firstTurn.includes('analyze_repo_structure') || !firstTurn.includes(targetRoot)) {
  fail(DOOR, 'the rendered door instruction no longer names the survey call or the target folder');
}

writeFileSync(join(outDir, 'handoff.txt'), handoff);
writeFileSync(join(outDir, 'turn-one.txt'), firstTurn);
console.log(`acp-replay: handoff ${handoff.length} characters, door instruction ${firstTurn.length} characters`);
EXTRACT

node "$out/extract-prompts.mjs" "$repo_root" "$target" "$out"

# ---------------------------------------------------------------------------
# The two turns. The environment variables are cleared because a session
# launched from inside an agent inherits them and reports the wrong entrypoint.
# ---------------------------------------------------------------------------
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT || true
cd "$target"

allowed="mcp__atlas-vault__*"
started=$(date +%s)

printf 'acp-replay: turn one (survey and proposal)\n'
claude -p "$(cat "$out/turn-one.txt")" \
  --model "$model" --max-turns 80 --output-format json \
  --mcp-config "$out/mcp.json" --strict-mcp-config --allowedTools "$allowed" \
  --append-system-prompt "$(cat "$out/handoff.txt")" \
  > "$out/turn-one.json" 2> "$out/turn-one.err" || true

session=$(node -e '
const data = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
if (!data.session_id) { console.error("acp-replay: turn one returned no session id"); process.exit(1); }
console.log(data.session_id);
' "$out/turn-one.json")

printf 'acp-replay: turn two (the person says go ahead), session %s\n' "$session"
claude -p "Yes. Go ahead and build all of it exactly as you proposed, and finish the job in this turn: create the nodes and relations, bind the code folder, validate, and tell me what the vault now holds." \
  --resume "$session" \
  --model "$model" --max-turns 120 --output-format json \
  --mcp-config "$out/mcp.json" --strict-mcp-config --allowedTools "$allowed" \
  --append-system-prompt "$(cat "$out/handoff.txt")" \
  > "$out/turn-two.json" 2> "$out/turn-two.err" || true

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
const finalized = finalText.includes("finalize_project_meaning") || /finali[sz]/i.test(finalText);
const report = {
  target, vault, model,
  wallClockSeconds: Number(elapsed),
  turns: { one: summarise(one), two: summarise(two) },
  nodesByKindFolder: byKind,
  finalizeMentionedInFinalText: finalized,
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
console.log(`  finished      ${finalized ? "the final answer speaks of finalizing the project meaning" : "the final answer never mentions finalizing — the build stopped short"}`);
console.log(`  written to    ${outDir}/replay.json`);
console.log("");
console.log("  The permission card was replaced by an allow-list. This run is not evidence that the card holds.");
' "$out" "$vault" "$target" "$model" "$elapsed"
