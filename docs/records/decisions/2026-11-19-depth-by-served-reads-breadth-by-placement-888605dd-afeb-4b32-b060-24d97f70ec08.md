---
id: 888605dd-afeb-4b32-b060-24d97f70ec08
date: 2026-11-19
---
## 2026-11-19 — Depth is the reads the server served; breadth is placement against the survey

**Why**: The stage B regrade (6 of 18 correct) found the depth refusal counted "unread" words (flagged 11/8/8 capabilities, actually unread 8/3/2), coverage by path lines read 100% on the vault whose must-have coverage fell from 92% to 69%, and 10 answers stayed partial because the rule sat one call below the entry read.
**Prior**: Narrows 2026-11-19 `fbb466df` (breadth map and build-depth checks): its survey, four warnings and impact rule stand; its line-coverage percentage and outlined-only wording count are replaced. `0f78a22b` (one run) and `a97078a0` (card inside 1,950 characters) stand.
**Decision**: `sourceReads` takes `symbol`: one declaration's lines plus `callees` with path and line. The server records the line and symbol reads it serves per process. A capability is unread when its `path:` file was never read; a process that served none does not judge. Writes and `validate_vault` list surveyed units with no node, named node or reasoned exclusion, must-have units (an entry point, or two importers) with no node, unnamed entry points and 300-line main files, and unread capabilities, each with the exact next call. Finalize refuses on those lists and offers `partial` last. The CLI `validate` runs the same four checks.
**Dissent**: a per-process record forgets reads after a restart, so a long build resumed in a new session is not judged; naming a unit in Includes is cheap and can pass for placement without knowing it.
**Falsifier**: in the next replays builders still answer partial for facts one call below a read entry, or the unit lists stay empty while a sealed key finds abilities with no node.
**Owner**: Stark
