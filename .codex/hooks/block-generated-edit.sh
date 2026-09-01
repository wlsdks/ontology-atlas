#!/usr/bin/env bash
# PreToolUse hook — Blocks **manual editing** of generated files.
#
# **This is a rule based on observed incidents.** `AGENTS.md` points to git discipline:
#   *"Do not manually edit generated JSON conflicts. … Manually removing conflict
#   markers has left them inside the JSON, breaking type checks in past cases."*
# The rule existed and incidents occurred — because prose is not enforced.
# (2026-07-31 Hanes audit prescription)
#
# The targets are the **outputs** of `pnpm docs-vault:build`:
#   - src/entities/docs-vault/data/**
#   - public/docs-vault/**
#
# What needs fixing is not the output but the **input** (`docs/**/*.md`) or the builder
# (`scripts/build-docs-vault.mjs`). Thanks to the determinism contract, regenerated
# results are identical bytes on any machine (`docs/DEVELOPMENT-CHECKS.md`).
#
# ⚠️ **Bash does not block this.** `pnpm docs-vault:build` itself and the conflict resolution convention
# (`git checkout --ours … && pnpm docs-vault:build`) are both Bash and both valid
# paths. This hook blocks only **the act of fixing line-by-line via editor tools**.

set -euo pipefail

INPUT="$(cat)"

VERDICT=$(printf '%s' "$INPUT" | python3 -c '
import json, re, sys

GENERATED_PREFIXES = (
    "src/entities/docs-vault/data/",
    "public/docs-vault/",
)

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tool = str(data.get("tool_name") or "")
if tool not in {"Edit", "Write", "NotebookEdit", "MultiEdit", "apply_patch", "functions.apply_patch"}:
    sys.exit(0)

tool_input = data.get("tool_input") or {}

# ⚠️ **Codex edits arrive as a patch envelope, not as a path** (measured
# 2026-09-01, codex-cli 0.151.0). Its `apply_patch` payload carries only
# `tool_input.command`, holding `*** Update File: <path>` lines; the tool name
# is `apply_patch`, not `Edit`. This guard read `file_path` and matched the
# Claude tool names, so on the Codex side it denied nothing at all: measured by
# feeding it a real captured payload naming `public/docs-vault/manifest.json`
# and watching it pass. A mirrored guard that cannot read the payload its own
# runtime sends is the dead gate this repository keeps finding, and it is worse
# than no guard because the mirror table says it is covered.
paths = [
    value
    for value in (tool_input.get("file_path"), tool_input.get("path"))
    if isinstance(value, str) and value
]
command = tool_input.get("command")
if isinstance(command, str) and command:
    paths.extend(re.findall(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", command, re.M))

if not paths:
    sys.exit(0)

# Normalizes paths so that absolute paths can be determined as repository-relative prefixes.
# Every path in one patch is judged: a single generated target refuses the whole patch.
for raw_path in paths:
    normalized = raw_path.strip().replace("\\", "/")
    for prefix in GENERATED_PREFIXES:
        idx = normalized.find(prefix)
        if idx != -1 and (idx == 0 or normalized[idx - 1] == "/"):
            sys.stdout.write(prefix)
            sys.exit(0)
' 2>/dev/null || true)

if [[ -n "$VERDICT" ]]; then
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Generated-output guard: \`${VERDICT}\` is produced by \`pnpm docs-vault:build\`, so it is never hand-edited.\n\nEdit the **input** instead — \`docs/**/*.md\` for content, \`scripts/build-docs-vault.mjs\` for how it is generated — then regenerate with \`pnpm docs-vault:build\`.\n\nOn a merge conflict either side is acceptable (determinism contract):\n  git checkout --ours src/entities/docs-vault/data public/docs-vault && pnpm docs-vault:build\n\nBasis: AGENTS.md, section \"Verification, documentation, and Git\" — generated docs-vault output is created only by \`pnpm docs-vault:build\` and never hand-edited."
  }
}
JSON
  exit 0
fi

exit 0
