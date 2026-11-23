---
id: 929c2179-7882-4c40-a4bc-83cfbb2612cf
date: 2026-11-23
---
## 2026-11-23 — Work status reads Claude Code's session list with no network

**Why**: The owner asked for the room that waits for the person. Criterion 27's probe (Claude Code 2.1.330): Record 7's call tried one HTTPS connection per run; with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` none; under `sandbox-exec` `(deny network*)` it printed the same six sessions. A listed `startedAt` came 1.2 to 36.9 s after its process's start. Shown this, the owner chose to block the connection over adding an outbound row.
**Prior**: Amends Record 7 in `docs/specs/2026-11-22-work-status-criteria.md` (environment `HOME` alone; equal starts; a confirm and outbound row). Keeps `docs/records/decisions/2026-11-22-work-status-agent-processes-87d3ada9-4740-430a-8cee-a580ce7e638e.md`.
**Decision**: macOS only: `/usr/bin/sandbox-exec -p "(version 1)(allow default)(deny network*)" <claude> agents --json`, `<claude>` the first file among `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, never `PATH`; environment `HOME` plus that switch; killed with its group after 5 s or 1 MiB. While Work status is visible and a Claude Code process is seen: once in 10 s, or 1 s after one appears or ends, one at a time. Entries parse into `pid`, `cwd`, `startedAt`, `kind`, `status`, `waitingFor`, `state` from closed lists; any other field or value makes an entry unknown; `name`, `sessionId`, `id` are never read. An entry counts when that pid is a seen Claude Code process started no later than it and its `cwd` lies in a worktree. The page gets worktree id, pid and one of five states; nothing is written.
**Dissent**: `sandbox-exec` is deprecated; its loss ends the read. A new field in a release silences every room. Background sessions, subagent waits and other settings folders were not probed. 142 MB per call.
**Falsifier**: A connection from a process this call started; a name, session id or folder in a payload or log; a `claude` found through `PATH`; a call while hidden; two at once; a child alive after 5 s.
**Owner**: Stark
