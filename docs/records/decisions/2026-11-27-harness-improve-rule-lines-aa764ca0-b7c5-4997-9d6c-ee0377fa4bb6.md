---
id: aa764ca0-b7c5-4997-9d6c-ee0377fa4bb6
date: 2026-11-27
---
## 2026-11-27 — A kept rule line from Harness Improve may be appended to an existing instruction file or added as a memory note

**Why**: Slice 2 of `docs/specs/2026-11-27-harness-self-improvement.md` turns a correction repeated across sessions into one proposed rule line, and a rule is only useful where the agent reads it. The source grant is read only, so these writes need their own decision.
**Prior**: Narrows `ffd59b03`, which keeps every write tool away from agent instruction files: the app, never an agent or MCP tool, may append one line on a person's Keep. Keeps `aa1cf11a`: no root `CLAUDE.md` is ever created. Uses the version and swap write of `d73dd377`; the proposal comes from `4919ff56`.
**Decision**: A kept rule is either a new note in the memory folder of `d73dd377` plus one index link, or one line appended at the end of an `AGENTS.md`, `CLAUDE.md` or `.claude/rules/*.md` that already exists under the repository's real root, opened with no link followed. Atlas never creates, renames or rewrites an instruction file, never writes two lines, and never puts a rule in Keep all. Undo restores the saved version.
**Dissent**: An instruction file loads in every session and reaches teammates once committed, so one tired Keep spreads a bad rule further than a memory note would.
**Falsifier**: A write to a file that did not exist, outside the real root or through a link; more than one line written; any instruction-file write without Keep.
**Owner**: Stark
