---
id: d55c209e-b3dd-4889-aff4-0b4f1a84ff4e
date: 2026-11-28
---
## 2026-11-28 — Harness › Tokens reads this repository's Claude Code session files for numbers only

**Why**: The owner, 2026-11-28, asked for one inspection in Harness that shows where token use leaks. Claude Code's session files hold each call's counts, model, effort, cache misses, compactions and its cost estimate; here turns above 200K context carried 68.3% of 19.89B tokens. Spec: `docs/specs/2026-11-28-harness-token-inspector.md`.
**Prior**: Shares the homes and `cwd` rule of `d73dd377` and `4919ff56` and the meta read of `67a26c36`; no send, no write. Keeps (92).
**Decision**: App, after Inspect token use. Opens only `projects/` folders named for the checkout or a listed worktree; counts lines whose `cwd` is in this repository. Keeps ids, model, usage counts, effort, times, cache-miss reason and tokens, compaction sizes, `cost-state` totals per program run, tool groups and byte sizes, tool call names, subagent type and model; in memory, only the comparison date stored. One opened turn shows the typed message before it, 280 characters, plain text, until closed. Money is only Claude Code's estimate.
**Dissent**: The format is undocumented; `cost-state` already proved a running total per program run. The script plus ccusage needs no new read.
**Falsifier**: Message, prompt, tool or description text, a path or a full session id in a payload, log, error or file; a non-matching folder opened; a figure off the files by over 1%.
**Owner**: stark (request, 2026-11-28, relayed by the lead)
