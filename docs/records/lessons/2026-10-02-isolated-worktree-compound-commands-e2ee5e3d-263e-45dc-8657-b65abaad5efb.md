---
id: e2ee5e3d-263e-45dc-8657-b65abaad5efb
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: agent-shell
---
**Observed**: in a worktree-isolated agent session, six Bash calls were refused before running ("this command is too complex to verify that it stays inside the worktree"): a `python3 - <<'PYEOF'` heredoc edit, a `cat >> file <<'EOF'` append, `time ( ... )`, `$(git diff --name-only ...)` inside an eslint call, and a chained `cmd && python3 /dev/stdin <<EOF && pnpm ...`. The same edits ran at once as a script written to the session scratchpad and invoked as `python3 <file>`, or through the Edit tool.
**Cost**: about six wasted round trips (minutes, not CI rounds).
**Suspected cause**: the isolation guard cannot prove that heredocs, subshells or command substitution stay inside the worktree, so it refuses the whole command rather than part of it.
**Proposed change**: skill — one line where agents edit in worktrees (parallel-brief or the implementer brief): put multi-line edits in a scratch script or the Edit tool, list changed files with a plain `git status --short` first, and keep each Bash call to one simple command chain.
