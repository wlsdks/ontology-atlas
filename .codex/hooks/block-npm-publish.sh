#!/usr/bin/env bash
# PreToolUse hook — Blocks npm/pnpm/yarn/bun publish commands in Bash.
#
# Called by Codex/agent runtime as a PreToolUse hook. Receives tool_input JSON via stdin,
# and outputs a deny JSON if the command publishes (exit 0).
#
# For passing through, exits 0 with no output — agent runtime proceeds as is.
#
# Blocking rules:
# - A `publish` argument to npm, pnpm, yarn, bun, lerna or changeset, wherever the
#   options sit (`pnpm --dir mcp publish`, `npm --prefix mcp publish`) and behind
#   env assignments, `env`, `sudo`, `npx`, subshells, `sh -c`, `eval` and `$(...)`
# - `npm pack` without `--dry-run`
# - Read-only commands like `npm whoami`, `npm view`, `npm pack --dry-run` pass
#
# To execute publish with explicit user approval, temporarily disable this file (`mv block-npm-publish.sh block-npm-publish.sh.off`) or run it directly in the terminal.

set -euo pipefail

INPUT="$(cat)"

# Passes if tool_name is not a shell execution surface. Codex desktop
# uses functions.exec_command + tool_input.cmd format.
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

# Extracts tool_input.command/cmd (handles escaped quotes inside JSON)
COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    tool_input = data.get("tool_input") or {}
    cmd = tool_input.get("command") or tool_input.get("cmd") or ""
    sys.stdout.write(cmd)
except Exception:
    sys.exit(0)
' 2>/dev/null || echo "")

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Shell words, not a line-start regex: the tool may sit behind options, wrappers,
# a subshell or a command substitution. Heredoc bodies are data and are dropped.
VERDICT=$(COMMAND="$COMMAND" python3 - <<'PY'
import os
import re
import shlex

TOOLS = {"npm", "pnpm", "yarn", "bun", "lerna", "changeset"}
WRAPPERS = {"command", "exec", "nohup", "time", "sudo", "doas", "nice", "npx", "bunx", "xargs"}
VALUED = {"-u", "-g", "-C", "-n", "-I", "-P", "-L", "-S", "--unset", "--chdir", "--split-string", "--user", "--group"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
ASSIGNMENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*=.*")


def data_only(command):
    out, skip_until = [], None
    for line in command.splitlines():
        if skip_until is not None:
            if line.strip() == skip_until:
                skip_until = None
            continue
        out.append(line)
        match = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", line)
        if match:
            skip_until = match.group(1)
    return "\n".join(out)


def program(word):
    return os.path.basename(word).split("@")[0]


def judge(words, depth):
    i = 0
    while i < len(words):
        word, name = words[i], program(words[i])
        if ASSIGNMENT.fullmatch(word):
            i += 1
        elif name in SHELLS:
            flags = [at for at in range(i + 1, len(words)) if re.fullmatch(r"-[A-Za-z]*c[A-Za-z]*", words[at])]
            return verdict(words[flags[0] + 1], depth + 1) if flags and flags[0] + 1 < len(words) else None
        elif name == "eval":
            return verdict(" ".join(words[i + 1:]), depth + 1)
        elif name == "env" or name in WRAPPERS:
            i += 1
            while i < len(words) and (words[i].startswith("-") or (name == "env" and ASSIGNMENT.fullmatch(words[i]))):
                i += 2 if words[i] in VALUED else 1
        else:
            break
    if i >= len(words) or program(words[i]) not in TOOLS:
        return None
    args = words[i + 1:]
    if "publish" in args:
        return "publish"
    if program(words[i]) == "npm" and "pack" in args and "--dry-run" not in args:
        return "pack"
    return None


def verdict(text, depth=0):
    if depth > 4:
        return None
    # \x60 is a backtick: a literal one inside this heredoc derails the enclosing $(...).
    for inner in re.findall(r"\$\(([^()]*(?:\([^()]*\)[^()]*)*)\)|\x60([^\x60]*)\x60", text):
        found = verdict(inner[0] or inner[1], depth + 1)
        if found:
            return found
    lexer = shlex.shlex(text.replace("\n", " ; "), posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    words = []
    for token in list(lexer) + [";"]:
        if token in {"{", "}", "!"} or set(token) <= set("&|;()"):
            found = judge(words, depth) if words else None
            if found:
                return found
            words = []
        else:
            words.append(token)
    return None


text = data_only(os.environ.get("COMMAND", ""))
try:
    print(verdict(text) or "")
except ValueError:
    # Unbalanced quotes: fall back to the command-start pattern rather than pass.
    start = r"(^|(&&|\|\||;|\||\()\s*)"
    print("publish" if re.search(rf"{start}(npm|pnpm|yarn|bun)\s+publish(\s|$)", text, re.M) else "")
PY
) || VERDICT="publish"

REASON=""
if [[ "$VERDICT" == "publish" ]]; then
  REASON="A package publish command was detected. It publishes permanently to an external registry, so explicit user approval is required."
elif [[ "$VERDICT" == "pack" ]]; then
  REASON="'npm pack' is about to run without --dry-run. Producing or uploading a real tarball requires user approval; add --dry-run for a read-only audit."
fi

if [[ -n "$REASON" ]]; then
  # PreToolUse deny format: Passes reason via JSON
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "npm publish guard: ${REASON}\n\nRun it only when the user explicitly asked to publish.\nBasis: AGENTS.md, section \"Verification, documentation, and Git\" — never run a publish command unless the user explicitly asks.\n\nHave the user run it themselves in the terminal, or disable .codex/hooks/block-npm-publish.sh first."
  }
}
JSON
  exit 0
fi

exit 0
