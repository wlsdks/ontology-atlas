---
id: d55c209e-b3dd-4889-aff4-0b4f1a84ff4e
date: 2026-11-28
---
## 2026-11-28 — Harness › Tokens reads this repository's Claude Code session files for numbers only

**Why**: The owner, 2026-11-28, asked for one inspection in Harness that shows where token use leaks. Claude Code's session files hold each call's counts, model, effort, cache misses, compactions and its cost estimate; here turns above 200K context carried 68.3% of 19.89B tokens. Spec: `docs/specs/2026-11-28-harness-token-inspector.md`.
**Prior**: Shares the config homes of `d73dd377` and the subagent meta read of `67a26c36`. Widens `4919ff56`'s "main checkout or listed worktree" to also count a path under the checkout, because agent worktrees there are deleted after merge and their sessions are this repository's work. No send, no write.
**Decision**: App, after Inspect token use. Opens only `projects/` folders whose name begins with the checkout's or a listed worktree's encoding, which includes prefix-sharing folders opened to read a file's first `cwd`; a file counts when that `cwd` is in this repository, else it is closed. Below `projects/`: regular files only, no link followed. Keeps ids, model, usage counts, effort, times, cache-miss reason and tokens, compaction sizes, `cost-state` totals per program run, tool groups, byte sizes and call names, subagent type and model; in memory; only the comparison date is stored. No message text is read into a field or shown. Errors reach the page as one word of a closed list. Money is only Claude Code's estimate.
**Dissent**: The format is undocumented; `cost-state` already proved a running total per program run. The script plus ccusage needs no new read.
**Falsifier**: Message, prompt, tool or description text, a path read from a session file, an error's text or a full session id in a payload, log, error or file; a non-matching folder opened; a figure off the files by over 1%.
**Owner**: stark (request, 2026-11-28, relayed by the lead)
