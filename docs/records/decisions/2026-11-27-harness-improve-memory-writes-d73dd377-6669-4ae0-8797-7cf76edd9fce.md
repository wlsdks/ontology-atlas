---
id: d73dd377-6669-4ae0-8797-7cf76edd9fce
date: 2026-11-27
---
## 2026-11-27 — Harness reads Claude Code's memory folder and changes it one line per keep, keeping versions

**Why**: The owner asked for one-click self-improvement in Harness and that day tidied his memory index by hand (24,059 to 11,350 bytes); 15 moved and 7 deleted paths remained in the notes. He delegated whether Atlas may write there; the lead decided yes. Proof: `docs/specs/2026-11-27-harness-self-improvement.md`, criteria 1-7.
**Prior**: Extends `3b55c4d4` (hook entries only) to the memory folder and adds the seventh exception in `.claude/rules/surfaces.md`. Versions are a copy of the person's text that `.claude/rules/local-first.md:15` otherwise rules out, allowed as `3b55c4d4` allowed hook versions. Keeps `ffd59b03`: no agent writes these files.
**Decision**: The app finds the repository's memory folder across config homes by real path, asking when several hold notes; reads at most 2,000 `.md` files of 1 MiB; proposes only from Git's rename record and the folder's own files, with no model. A write changes one path or index entry, appends one entry, or deletes one note with its entry; only after Keep (Keep all never deletes), only if the file matches what was read, after saving a version in app data (0600, 90 days), atomically, following no link below the real path; never under managed settings. Note text is never run, sent or logged.
**Dissent**: Writes in another product's folder can collide with its own writes or format; versions copy private notes.
**Falsifier**: A byte changed outside the kept change; a write without Keep or after the file changed; note text in a log, error or request; a write through a link to a non-candidate folder.
**Owner**: Stark
