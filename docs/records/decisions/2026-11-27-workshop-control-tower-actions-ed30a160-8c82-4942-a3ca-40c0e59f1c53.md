---
id: ed30a160-8c82-4942-a3ca-40c0e59f1c53
date: 2026-11-27
---
## 2026-11-27 — Workshop acts on leftover processes, builds and merged worktrees only on a press, and never signals an agent program

**Why**: The owner, 2026-11-27: judge the load, warn, and "if possible" control, like a control tower. Measured that day: load 34.3 on 12 cores; 61 orphans in removed repository folders holding 2.0 GB; a `claude` process that is no session.
**Prior**: Replaces Record 2, drafted in the superseded coordination spec and never recorded, without its Automatic level, holds, build-folder deletion or model. Amends `43842310` by the load average and a leftover's kernel name. Spec: `docs/specs/2026-11-27-workshop-control-tower.md`.
**Decision**: Only after one press on a list Rust offered under a generation id, logged first: `SIGTERM` to a leftover (own uid, parent launchd, no terminal, not an agent program, folder in a merged or removed worktree); background priority, or `SIGSTOP` then `SIGCONT` with a watchdog, for a build an agent started in a listed worktree; `git worktree remove` without `--force` after a confirm. Just before acting, Rust refuses a pid whose start time, uid, name or folder changed. Never `SIGKILL`, a group signal, an agent program, Atlas, pid 1, another user, automatic action, or a pid the page sends.
**Dissent**: The owner asked for control; a live session or subagent is never ended (a subagent has no process of its own). macOS has no pidfd, so reuse between check and signal stays possible in theory. The fit is a linear guess. Atlas edges toward a process manager.
**Falsifier**: a signal outside the offered generation or to an agent program; a `SIGKILL`; a build stopped 1 s after Atlas dies; a removal deleting what a build cannot recreate; the owner still deciding from Activity Monitor; Overloaded over half the visible time for a week with no action.
**Owner**: stark (request, 2026-11-27); the session refusal is the spec writer's, reversible by a new record
