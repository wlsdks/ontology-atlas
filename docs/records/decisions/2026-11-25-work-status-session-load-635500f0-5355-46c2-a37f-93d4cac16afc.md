---
id: 635500f0-5355-46c2-a37f-93d4cac16afc
date: 2026-11-25
---
## 2026-11-25 — Work status sums load per agent session it already shows

**Why**: The owner, 2026-11-25, asked for the by-session Workshop's "Later 1" to be built: each session block says how much memory and CPU its own work uses. By folder cannot say it: two sessions sharing a folder share that folder's totals, and a session working in five folders has no single figure.
**Prior**: Amends `docs/records/decisions/2026-11-25-work-status-load-read-43842310-f121-42ab-973d-4b72806a0f94.md` by one returned field; what is read, how often and from which processes is unchanged. Builds `docs/specs/2026-11-25-workshop-sessions-view.md`, Later 1.
**Decision**: The page sends with each load ask the pids of the sessions it already shows (at most 64). From the processes the sample already measures, Rust credits each to a session the page sent: an Atlas agent session's pid when one is among itself and its ancestors (an agent inside it has no figure of its own), else the nearest agent program among itself and its ancestors whose pid was sent, so a session started inside another keeps its own tree. It returns, for each sent pid with a process credited to it, memory, CPU in cores and every tool group with a process there; a pid not sent is never returned. No process is read that was not read before, and no field beyond memory, CPU and group.
**Dissent**: A session's commands that outlive it, such as a daemon a build started and left, belong to no session and drop out of its figure while still counting in their folder. A sent pid is not checked against this repository: a page could send the pid of an agent elsewhere and get its figure, which is no more than the person's own process list already shows, and only agent programs are credited. An agent the page did not send counts toward the nearest one above it that it did. A shared folder's own total stays the folder's; the two session figures need not add up to it, since each counts only its own tree.
**Falsifier**: A pid in a payload the page did not send; a process read, or a field returned, that the load read of 43842310 does not already read; one session's process counted in another's figure, including a session started inside another; more than 1 % of one core with 40 worktrees and 64 sent pids.
**Owner**: Stark
