---
id: 67a26c36-cbaf-4458-92b1-a59caae30b0b
date: 2026-11-27
---
## 2026-11-27 — Workshop reads Claude Code's subagent files to show which subagents run, with their type and model

**Why**: The owner, 2026-11-27, wants each session's running subagents in the tower's first slice, with their model, to see whether an unwanted model is used. A subagent is no process; only Claude Code's files say it runs. Measured: 27 subagent meta files in one session, no status field in them; the parent session's file gains a `<task-notification>` record with the agent's id and an end status.
**Prior**: Amends `929c2179`, which never reads `sessionId`: Rust now holds it, never returns it, to find a session's subagent folder. Shares `d73dd377`'s config homes. Spec: `docs/specs/2026-11-27-workshop-control-tower.md`.
**Decision**: macOS, while Workshop is visible and the session list is on, with each list read: in `~/.claude`, `CLAUDE_CONFIG_DIR` when the app sees it, and Orca's `claude-profiles/*/home`, list `projects/<encoded cwd>/<sessionId>/subagents/`, kept only when the session file's own `cwd` is a listed worktree; from each `agent-<id>.meta.json` (64 KiB, no link followed) only `agentType`, `model` and the worktree, a key outside the twelve measured making that subagent unknown; the times of its files; from the session's `.jsonl`, read onward, only that `cwd` and the id and status of a record whose text begins `<task-notification>`. Running: a meta file, a live session, no end status. The page gets per session pid: type, model, worktree id or none, quiet minutes, or unknown. `description` and all other text are never read into a field, shown, logged or sent.
**Dissent**: The files are undocumented and may change any release; a planted record in a tool's output could fake an end, which only the record-type check prevents; a 66 MB file is scanned once.
**Falsifier**: `description`, a path, a session id or any text beyond type, model and status in a payload or log; a finished subagent shown running, or a running one shown finished, in criterion 4's plants; an error shown when the files change.
**Owner**: stark (request, 2026-11-27, relayed by the lead)
