---
id: ed30a160-8c82-4942-a3ca-40c0e59f1c53
date: 2026-11-27
---
## 2026-11-27 — Workshop acts on leftover processes, merged worktrees and agents' builds only on a press, and never signals an agent program

**Why**: The owner, 2026-11-27: judge the load, warn, and "if possible" control, like a control tower. Measured: load 34.3 on 12 cores; 62 orphans in repository folders.
**Prior**: Replaces the never-recorded Record 2 of the superseded coordination spec, without Automatic, pause, holds or deletion. Amends `43842310`: load average; for launchd-parented processes, folder, terminal and child; memory of a leftover. Defers owner answer (5) of 2026-11-22. Specs: `docs/specs/2026-11-27-workshop-control-tower.md`, `…-controls.md`.
**Decision**: While Workshop is visible, after one press on a list Rust offered (generation id valid while its targets pass, at most 10 minutes), logged first: `SIGTERM` to a leftover (own uid, parent launchd, no terminal, no child, a closed tool name, folder removed or a merged worktree no one holds); `PRIO_DARWIN_BG` and back for an agent's build; `git worktree unlock` of a stale lock, then `git worktree remove` without `--force`, after a confirm naming other ignored files. Before acting Rust refuses a pid whose start, uid, parent, name or folder changed, and re-reads clean and ignored state. Never `SIGKILL`, `SIGSTOP`, a group signal, an agent program, Atlas or its ancestors, pid 1, another user, a terminal's job, automatic action, or removal on Windows.
**Dissent**: The owner asked for control; a live session or subagent is never ended, and his answer (5), ordering checks by load, waits for the check queue. macOS has no pidfd, so reuse between check and signal stays possible in theory. Atlas edges toward a process manager.
**Falsifier**: a signal outside the offered generation, to a session host or agent program; a `SIGKILL` or `SIGSTOP`; any action while hidden or unpressed; a removal deleting a file outside the build-output list that its confirm did not name; the owner still using `ps` or `git` for these after slices 2 and 3.
**Owner**: stark (request, 2026-11-27); the session refusal is the spec writer's, reversible by a new record
