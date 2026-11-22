---
id: 87d3ada9-4740-430a-8cee-a580ce7e638e
date: 2026-11-22
---
## 2026-11-22 — Work status reads the person's own agent processes

**Why**: The owner, 2026-11-22, asked that Codex rows reading as unheld be fixed, not reported. Codex leaves no worktree lock; the Codex app runs every command under one background server whose own folder is the repository root. Claude Code's kernel name is its version (`2.1.330`).
**Prior**: Overturns "only a pid a lock names" in `docs/records/decisions/2026-11-21-work-status-destination-dac7de97-cd83-4c93-8b29-5fecd5db4389.md`; pulls the process signal of Record 1 in `docs/specs/2026-11-21-work-status-destination.md` forward from slice 2.
**Decision**: macOS and Linux list same-uid processes and keep only parent, start time, executable path (read only for a name that looks like an agent on macOS) and working folder; never arguments or environment. A process in a worktree counts for the outermost agent of the nearest agent's tool above it (`claude` or `claude/versions/<v>`, `codex`); a chain through an Atlas agent session is that session's. Held 90 s after its last sighting while that agent runs with the same start and the folder exists. Only pid, tool and start reach the page. Windows reads none. Measured 1.6 ms CPU per read, once a second while visible.
**Dissent**: Codex's session files would name the thread exactly, but hold the conversation; a command under a second may be missed.
**Falsifier**: an argument, environment value or folder outside the repository's worktrees reaches the page; another user's process is read; a read over 10 ms on a busy Mac.
**Owner**: Stark
