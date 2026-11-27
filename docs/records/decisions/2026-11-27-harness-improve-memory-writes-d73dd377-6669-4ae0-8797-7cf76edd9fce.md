---
id: d73dd377-6669-4ae0-8797-7cf76edd9fce
date: 2026-11-27
---
## 2026-11-27 — Harness reads Claude Code's memory folder and changes it one line per keep, keeping versions

**Why**: The owner asked for one-click self-improvement in Harness and that day tidied his memory index by hand (24,059 to 11,350 bytes); 15 moved and 7 deleted paths remained. He delegated whether Atlas may write there; the lead decided yes. Proof: `docs/specs/2026-11-27-harness-self-improvement.md`, criteria 1-7.
**Prior**: Extends `3b55c4d4` (hook entries only) to the memory folder; the seventh exception in `.claude/rules/surfaces.md`. Versions copy the person's text, which `.claude/rules/local-first.md:15` otherwise rules out, as `3b55c4d4` allowed for hooks. Keeps `ffd59b03`.
**Decision**: The app finds the folder by real path from `~/.claude`, `CLAUDE_CONFIG_DIR`, profile homes and `autoMemoryDirectory` in user or managed settings only, never project or local; the person picks when several hold notes. No model; proposals come from Git's rename record and the folder's files. A write, only after Keep and only if the file matches what was read: one path, one index link, or one note with its link deleted; Keep all holds moves and duplicate links only. It saves a version (0600, 90 days), then swaps the new file in with `RENAME_SWAP`, swapping back if the old bytes changed. Nothing under a managed settings file. Note text is never run, sent or logged.
**Dissent**: Claude Code can write the same note in the instant after the check, and versions copy private notes.
**Falsifier**: A byte changed outside the kept change; a write without Keep or over a changed file; note text in a log or request; a folder taken from project settings.
**Owner**: Stark
