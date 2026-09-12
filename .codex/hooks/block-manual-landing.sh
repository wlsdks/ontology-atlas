#!/usr/bin/env bash
# PreToolUse hook — Blocks landing a pull request by hand.
#
# **Why a hook instead of prose.** `AGENTS.md` points to git discipline, which says landing goes through
# `pnpm pr:land`. A rule file is *context*, not enforcement, and this particular rule
# is one an agent breaks while being helpful: `gh pr merge` is the obvious command and
# it works, right up to the moment two agents run it in the same minute.
#
# **The measurement** (2026-09-12). `main` required eight status contexts with the
# classic "branch must be up to date" policy on, so every merge turned every other
# open pull request BEHIND. Each agent then ran `gh pr update-branch` and paid a full
# CI round, and the next merge did the same thing to everyone else: five pull requests
# cost roughly four CI rounds each. Two agents merging in the same window lost both.
#
# What is blocked:
# - `gh pr merge` in any form - it merges without waiting for the landing already
#   in flight, which is the race itself.
# - `gh pr update-branch` - `pnpm pr:land` pours main into the branch itself, once,
#   at landing. By hand it is a CI round nobody asked for.
# - `gh pr create` without `--draft` - a ready pull request runs CI immediately, on a
#   branch that is not yet the thing being merged. The owner's shape (2026-09-12) is
#   one CI run per pull request, fired by `pnpm pr:land` after main is merged in.
#
# What is passed: `pnpm pr:land`, `pnpm pr:queue`, `pnpm pr:ci`, `node
# scripts/pr-land.mjs`, `gh pr create --draft`, and everything else. Exits 0 with no
# output.
#
# Each refusal is appended to `.tmp/harness/refusals.jsonl` so `pnpm harness:report`
# can say how often this guard fired. A guard nobody counted is the dead gate this
# repository keeps rediscovering.
#
# **If the user explicitly instructed**, the user runs it themselves in the terminal
# (via `! <command>` for this session) or temporarily disables this hook
# (`mv block-manual-landing.sh block-manual-landing.sh.off`).

set -euo pipefail

INPUT="$(cat)"

TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    sys.stdout.write(str(data.get("tool_name") or ""))
except Exception:
    sys.exit(0)
' 2>/dev/null || true)
if [[ "$TOOL_NAME" != "Bash" && "$TOOL_NAME" != "exec_command" && "$TOOL_NAME" != "functions.exec_command" ]]; then
  exit 0
fi

COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    tool_input = data.get("tool_input") or {}
    sys.stdout.write(tool_input.get("command") or tool_input.get("cmd") or "")
except Exception:
    sys.exit(0)
' 2>/dev/null || echo "")

[[ -z "$COMMAND" ]] && exit 0

# Removes heredoc bodies and drops the statements that *are* the lander, so a PR
# body quoting `gh pr merge` and the sanctioned command itself both pass. The
# heredoc strip is the same reason the publish and git guards carry one.
MATCH=$(COMMAND="$COMMAND" python3 - <<'PY'
import os
import re

command = os.environ.get("COMMAND", "")

# 1. Heredoc bodies are data: a PR description or commit message may quote the
#    very commands this guard refuses.
lines = []
skip_until = None
for line in command.splitlines():
    if skip_until is not None:
        if line.strip() == skip_until:
            skip_until = None
        continue
    lines.append(line)
    match = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", line)
    if match:
        skip_until = match.group(1)

# 2. Split into statements and drop the sanctioned lander. It never contains the
#    refused strings, so this is the rule made explicit rather than a loophole.
SANCTIONED = re.compile(
    r"^(?:pnpm(?:\s+run)?\s+pr:(?:land|queue|ci)\b|node\s+scripts/pr-land\.mjs\b)"
)
statements = [
    statement.strip()
    for statement in re.split(r"&&|\|\||;|\|", "\n".join(lines).replace("\n", ";"))
]
print("\n".join(s for s in statements if s and not SANCTIONED.match(s)))
PY
)

REASON=""
RULE=""

# ① gh pr merge — merges without waiting for the landing already in flight.
if echo "$MATCH" | grep -Eq -- '(^|[^[:alnum:]_-])gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)'; then
  RULE="gh-pr-merge"
  REASON="\`gh pr merge\` does not wait for the agent already landing, so two of them merge into the same window and both pay another CI round. Run \`pnpm pr:land <number>\` instead: it takes the shared landing lock, waits out the landing ahead, waits for the required checks, merges, deletes the branch and prunes."

# ② gh pr update-branch — an unconditional CI round the lander only pays when it must.
elif echo "$MATCH" | grep -Eq -- '(^|[^[:alnum:]_-])gh[[:space:]]+pr[[:space:]]+update-branch([[:space:]]|$)'; then
  RULE="gh-pr-update-branch"
  REASON="\`gh pr update-branch\` by hand buys a CI round every time. \`pnpm pr:land <number>\` pours main into the branch itself, once, while the pull request is still a draft and a push costs nothing."

# ③ gh pr create without --draft — a ready pull request starts CI on a branch that is
#    not yet the thing being merged, which is the round the draft rule exists to save.
elif echo "$MATCH" | grep -Eq -- '(^|[^[:alnum:]_-])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' \
  && ! echo "$MATCH" | grep -Eq -- '(^|[[:space:]])(--draft|-d)([[:space:]]|=|$)'; then
  RULE="gh-pr-create-without-draft"
  REASON="\`gh pr create\` without \`--draft\` fires CI immediately on a branch that is not yet what will be merged. Open it with \`gh pr create --draft\`, then \`pnpm pr:land <number>\`: that merges today's main in, runs the local lanes, and marks it ready, so the one CI run measures exactly the tree that lands."
fi

if [[ -n "$REASON" ]]; then
  # Count the refusal. A failure here costs one report line, never the block.
  REPO_ROOT="${ATLAS_HOOK_ROOT:-$(pwd)}"
  (
    mkdir -p "$REPO_ROOT/.tmp/harness" 2>/dev/null &&
      printf '{"at":"%s","guard":"block-manual-landing","tree":"codex","rule":"%s"}\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$RULE" \
        >>"$REPO_ROOT/.tmp/harness/refusals.jsonl"
  ) 2>/dev/null || true

  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "landing guard: ${REASON}\n\nBasis: AGENTS.md, section \"Verification, documentation, and Git\".\n\nIf the user explicitly asked for this, have them run it themselves in the terminal, or disable .codex/hooks/block-manual-landing.sh for that one run."
  }
}
JSON
  exit 0
fi

exit 0
