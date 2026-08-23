#!/usr/bin/env bash
# PreToolUse hook — blocks shell reads of the files .gitignore treats as secrets.
#
# Why this exists on the Codex side only.
#
# `.claude/rules/local-first.md` forbids scanning credential or key files and
# `.claude/rules/forbidden.md` forbids committing them. On the Claude side that
# is now mechanical: `permissions.deny` in `.claude/settings.json` refuses the
# Read tool and the file commands Claude Code recognises in Bash — `cat`, `head`,
# `tail`, `sed` — and it outranks every hook.
#
# Codex has no committable equivalent. Its deny-read filesystem policies live in
# `permissions.<name>.filesystem` and are documented only for the user-level
# `~/.codex/config.toml`; `.codexignore` was requested repeatedly and never
# shipped. A project cannot hand a teammate that protection. What a project can
# do is what this repository already does for publishing and unsafe Git: refuse
# the command at PreToolUse, which is wired here for Bash, `exec_command`, and
# `functions.exec_command` and covered by `pnpm test:claude:hooks`.
#
# The limit is the same one Claude Code states for its own rules: a reader that
# opens the file itself — `node -e`, a Python script — is invisible to a
# command-shaped guard. Closing that needs an OS sandbox, not a hook, and saying
# so is more useful than implying this is airtight.
#
# `.env.example` stays readable. It is tracked, documented, and scanned by the
# source-language gate, so the names come from `.gitignore` rather than a glob.

set -euo pipefail

INPUT="$(cat)"

COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys

try:
    data = json.load(sys.stdin)
    tool_input = data.get("tool_input") or {}
    sys.stdout.write(tool_input.get("command") or tool_input.get("cmd") or "")
except Exception:
    sys.exit(0)
' 2>/dev/null || echo "")

[[ -n "$COMMAND" ]] || exit 0

REPO_ROOT="${CODEX_PROJECT_DIR:-$(pwd)}"
GITIGNORE="$REPO_ROOT/.gitignore"
[[ -f "$GITIGNORE" ]] || exit 0

VERDICT=$(COMMAND="$COMMAND" GITIGNORE="$GITIGNORE" python3 - <<'PY'
import os
import re
import sys

command = os.environ.get("COMMAND", "")

# A heredoc body is data, not a command. The publish and Git guards strip it the
# same way; without this a commit message quoting `cat .env` would be refused.
lines = []
skip_until = None
for line in command.splitlines():
    if skip_until is not None:
        if line.strip() == skip_until:
            skip_until = None
        continue
    lines.append(line)
    opened = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", line)
    if opened:
        skip_until = opened.group(1)
command = "\n".join(lines)

secrets = []
with open(os.environ["GITIGNORE"], encoding="utf-8") as handle:
    for raw in handle:
        entry = raw.strip()
        if re.fullmatch(r"\.env(\.[A-Za-z0-9._-]+)?", entry):
            secrets.append(entry)
if not secrets:
    sys.exit(0)

# Readers only, and a guard against the ordinary path rather than against an
# author working around it; the header says so. `cp`, `tee` and `install` move bytes without putting them in a
# transcript, and `cp .env.example .env.local` is a legitimate setup step this
# guard has no business refusing. The harm named in the refusal is a value
# reaching the transcript, so that is what the list covers.
READERS = (
    "cat", "bat", "head", "tail", "less", "more", "sed", "awk", "strings",
    "xxd", "od", "grep", "rg", "nl", "cut", "sort", "uniq", "base64", "openssl",
)
reader = "|".join(READERS)
# \x60 is a backtick. Written as an escape because this heredoc sits inside a
# command substitution, where a literal backtick derails the shell parser.
start = r"(?:^|(?:&&|\|\||;|\||\$\(|\x60)[ \t]*)"

for name in secrets:
    quoted = re.escape(name)
    # The name must appear as its own path argument: `.env`, `./.env`,
    # `some/dir/.env`. `.env.example` therefore never matches `.env`.
    target = rf"(?:[^\s'\"]*/)?{quoted}(?=$|[\s'\";|&)])"
    if re.search(rf"{start}(?:{reader})\b[^\n;|&]*?{target}", command):
        print(name)
        sys.exit(0)
PY
) || VERDICT=""

[[ -n "$VERDICT" ]] || exit 0

cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "secret read guard: this command reads \`${VERDICT}\`, which .gitignore treats as a secret.\n\nBasis: .claude/rules/local-first.md, section \"Security\" — never scan password, credential or key files. A value read into a transcript has left the machine.\n\nIf you need the shape of the configuration rather than its values, read \`.env.example\`, which is tracked for exactly that. If the user explicitly asked for this, have them run it themselves in the terminal."
  }
}
JSON
exit 0
