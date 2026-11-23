#!/usr/bin/env bash
#
# Headless replay of the app's "map the rest of the code" run: request after
# request, each in a fresh agent session, until the project note's
# `Not mapped yet` line is gone or a stop rule fires, with a ledger line per
# request that says what it gained, cost and damaged.
#
# Everything is written under --out: a copy of the target (vault at
# <out>/repo/atlas), the vault's history after each request (a throwaway Git
# directory, <out>/vault-history), every transcript, and <out>/ledger.jsonl.
# The target and a --vault folder are only read. The request text and the note
# parser are read from the app source at run time (map-area-request.mjs).
#
# Writes are pre-approved by an allow-list, as in acp-replay.sh: a chain is not
# evidence that the permission card holds.
#
# usage: map-rest-replay.sh <target-repo> [--agent claude|codex] [--model <name>]
#          [--max-requests 12] [--out <dir>] [--vault <existing vault dir>]
#
# --agent codex runs `codex exec` with CODEX_HOME under --out, so it needs
# CODEX_API_KEY in the environment: the sign-in under ~/.codex is never used.
set -euo pipefail

die() { printf 'map-rest-replay: %s\n' "$1" >&2; exit 2; }
say() { printf 'map-rest-replay: %s\n' "$1"; }

target=""
agent="claude"
model=""
max_requests=12
out=""
vault_source=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --agent) [ "$#" -ge 2 ] || die "--agent needs a value"; agent="$2"; shift 2 ;;
    --model) [ "$#" -ge 2 ] || die "--model needs a value"; model="$2"; shift 2 ;;
    --max-requests) [ "$#" -ge 2 ] || die "--max-requests needs a value"; max_requests="$2"; shift 2 ;;
    --out) [ "$#" -ge 2 ] || die "--out needs a value"; out="$2"; shift 2 ;;
    --vault) [ "$#" -ge 2 ] || die "--vault needs a value"; vault_source="$2"; shift 2 ;;
    -h|--help) sed -n '3,21p' "$0"; exit 0 ;;
    --*) die "unknown option $1" ;;
    *) [ -z "$target" ] || die "only one target repository"; target="$1"; shift ;;
  esac
done
[ -n "$target" ] || die "usage: map-rest-replay.sh <target-repo> [--agent claude|codex] [--model <name>] [--max-requests 12] [--out <dir>] [--vault <dir>]"
[ -d "$target" ] || die "no such folder: $target"
target="$(cd "$target" && pwd)"
case "$agent" in claude|codex) ;; *) die "--agent is claude or codex, not $agent" ;; esac
case "$max_requests" in ''|*[!0-9]*) die "--max-requests takes a whole number" ;; esac
if [ -n "$vault_source" ]; then
  [ -d "$vault_source" ] || die "no such vault folder: $vault_source"
  vault_source="$(cd "$vault_source" && pwd)"
fi
if [ "$agent" = "claude" ] && [ -z "$model" ]; then model="opus"; fi

scripts="$(cd "$(dirname "$0")" && pwd)"
repo_root="$scripts"
while [ "$repo_root" != "/" ] && [ ! -f "$repo_root/mcp/src/index.js" ]; do
  repo_root="$(dirname "$repo_root")"
done
[ -f "$repo_root/mcp/src/index.js" ] || die "could not find mcp/src/index.js above $0"

command -v node >/dev/null 2>&1 || die "node is not on PATH"
command -v rsync >/dev/null 2>&1 || die "rsync is not on PATH"
command -v "$agent" >/dev/null 2>&1 || die "the agent command '$agent' is not on PATH"
if [ "$agent" = "codex" ] && [ -z "${CODEX_API_KEY:-}" ]; then
  die "--agent codex needs CODEX_API_KEY: the chain gives Codex its own CODEX_HOME under --out and never reuses the sign-in under ~/.codex, which Codex would write to"
fi

if [ -z "$out" ]; then
  out="${TMPDIR:-/tmp}/atlas-map-rest-$(basename "$target")-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$out"
out="$(cd "$out" && pwd)"
[ ! -e "$out/ledger.jsonl" ] || die "$out already holds a ledger; give a fresh --out"

work="$out/repo"
vault="$work/atlas"
session="$out/session"
history="$out/vault-history"
requests="$out/requests"
mkdir -p "$work" "$session" "$requests"
# The chain works on its own copy, so neither the target nor a --vault folder is written.
rsync -a --exclude .git --exclude atlas "$target"/ "$work"/
if [ -n "$vault_source" ]; then
  mkdir -p "$vault"
  rsync -a --exclude .git "$vault_source"/ "$vault"/
fi
say "target  $target"
say "copy    $work"
say "agent   $agent${model:+ ($model)}, at most $max_requests requests"
say "output  $out"

node "$scripts/map-area-request.mjs" session "$repo_root" "$work" "$vault" "$session"

history_git() {
  git --git-dir="$history" --work-tree="$vault" -c core.hooksPath=/dev/null -c commit.gpgsign=false \
    -c user.name=map-rest-replay -c user.email=map-rest-replay@localhost "$@"
}
git init -q --bare "$history"
mkdir -p "$vault"

# Prints the vault's commit after request <n>, so `git --git-dir <out>/vault-history diff` shows each step.
commit_vault() {
  history_git add . >/dev/null
  history_git commit -q --allow-empty -m "request $1" >/dev/null
  history_git rev-parse HEAD
}

unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT || true

# One fresh session: run_agent <prompt-file> <transcript-prefix>. Returns the agent's exit code.
run_claude() {
  ( cd "$work" && claude -p "$(cat "$1")" \
      --model "$model" --max-turns 80 --output-format stream-json --verbose \
      --mcp-config "$session/mcp.json" --strict-mcp-config --allowedTools "mcp__atlas-vault__*" \
      --tools "ToolSearch" --permission-mode dontAsk \
      --append-system-prompt "$(cat "$session/handoff.txt")" \
      > "$2.jsonl" 2> "$2.err" )
}

# Shell commands run read-only; the vault is written only by the Atlas server, which runs outside
# Codex's sandbox. CODEX_HOME under --out keeps Codex's state, logs and caches away from ~/.codex.
run_codex() {
  local overrides=()
  local override
  while IFS= read -r -d '' override; do overrides+=(-c "$override"); done < "$session/codex-overrides.nul"
  mkdir -p "$out/codex-home"
  ( cd "$work" && CODEX_HOME="$out/codex-home" codex exec \
      --ignore-user-config --ignore-rules --ephemeral --skip-git-repo-check --json \
      --sandbox read-only --cd "$work" ${model:+--model "$model"} "${overrides[@]}" \
      "$(cat "$1")" < /dev/null > "$2.jsonl" 2> "$2.err" )
}

run_agent() {
  if [ "$agent" = "codex" ]; then run_codex "$1" "$2"; else run_claude "$1" "$2"; fi
}

# Request 0 is the starting state: a first build, or the copied vault.
started=$(date +%s)
build_status=0
transcript=""
if [ -n "$vault_source" ]; then
  say "starting from a copy of $vault_source"
elif [ "$agent" = "claude" ]; then
  say "request 0: first build through acp-replay.sh"
  "$scripts/acp-replay.sh" "$work" --model "$model" --out "$out/first-build" || build_status=$?
  transcript="$out/first-build/turn-one.jsonl"
else
  say "request 0: first build, the door instruction in one Codex session"
  run_agent "$session/door.txt" "$requests/0" || build_status=$?
  transcript="$requests/0.jsonl"
fi
commit=$(commit_vault 0)
node "$scripts/map-rest-ledger.mjs" record "$repo_root" "$work" "$vault" "$out" 0 "$agent" \
  "$build_status" "$(( $(date +%s) - started ))" "$commit" "$transcript"

request=0
while :; do
  verdict=$(node "$scripts/map-rest-ledger.mjs" next "$out" "$max_requests")
  [ "$verdict" = "continue" ] || break
  request=$((request + 1))
  prefix="$requests/$request"
  node "$scripts/map-area-request.mjs" prompt "$repo_root" "$vault" > "$prefix.prompt.txt"
  say "request $request"
  started=$(date +%s)
  status=0
  run_agent "$prefix.prompt.txt" "$prefix" || status=$?
  commit=$(commit_vault "$request")
  node "$scripts/map-rest-ledger.mjs" record "$repo_root" "$work" "$vault" "$out" "$request" "$agent" \
    "$status" "$(( $(date +%s) - started ))" "$commit" "$prefix.jsonl"
done

say "stopped: $verdict"
echo ""
node "$scripts/map-rest-ledger.mjs" table "$out"
