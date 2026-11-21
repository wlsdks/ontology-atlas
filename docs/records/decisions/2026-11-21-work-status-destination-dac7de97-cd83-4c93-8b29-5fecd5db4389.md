---
id: dac7de97-cd83-4c93-8b29-5fecd5db4389
date: 2026-11-21
---
## 2026-11-21 — Work status reads worktrees through Git and one lock holder's start time

**Why**: The owner, 2026-11-21, asked which agent holds which worktree and whether its work is merged. This repository that day: 34 worktrees, 15 held by two Claude Code sessions, read in 0.7 s at load 50.
**Prior**: The tenth slot `docs/records/decisions/2026-11-01-planning-tenth-rail-destination-e7d1f38a-344d-487c-bd0f-d98a29bc84d2.md` permits. First slice of Record 1 in `docs/specs/2026-11-21-work-status-destination.md`; processes, hooks, load and the server keep their own records.
**Decision**: `/work-status/`, Work status, `g w`; a web card. Through `runner.rs`: the porcelain worktree list (outside the folder only when `.git` and `gitdir` point at each other, `O_NOFOLLOW`, 4 KiB); merged off the base's first-parent line; lock reasons and `locked` mtimes. Only a pid a lock names: its start time against the reason's UTC time within 1 s; unreadable counts as held. Visible only: a stat each second, a read on change. The server sends nothing.
**Dissent**: A Changes tab keeps nine doors; a start time is still a process read.
**Falsifier**: in-flight work sought in Changes; a pid read no lock names; a symlink read; a request leaving.
**Owner**: Stark
