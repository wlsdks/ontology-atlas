---
id: d400da6f-da60-48b3-b9fe-cf0fbd202bb6
date: 2026-11-25
---
## 2026-11-25 — Work status also reads CPU time of a Java process outside every agent tree

**Why**: The owner asked to see Gradle's use while work runs. A Gradle daemon is a `java` process outside every agent tree, and its build load is mostly CPU; memory alone hides a busy build.
**Prior**: Amends `docs/records/decisions/2026-11-25-work-status-load-read-43842310-f121-42ab-973d-4b72806a0f94.md`, which read only memory and working folder for that process.
**Decision**: For a process named `java` outside every agent tree, the load read also takes its CPU time, under the same switch, pace and limits; the page gets it only inside the worktree's totals and tool groups. Arguments, environment and open files stay unread.
**Dissent**: A Java program unrelated to the repository but working inside a worktree folder is counted as that worktree's load.
**Falsifier**: CPU read for a process outside the agent trees whose name is not `java`; a `java` process outside every worktree folder appearing in a room's totals.
**Owner**: Stark
