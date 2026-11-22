---
id: e64b4ebe-ea86-48bc-a629-6cc1b8a3dd30
date: 2026-11-22
---
## 2026-11-22 — The Atlas command is rebuilt as a door into the app, and it is published

**Why**: owner decision, 2026-11-22. 61 of 62 commands mirror MCP tools; nine app source files show command lines an app user cannot run (`cli-invocation.ts:12-14`); a CI runner cannot install the app, so a pull request check has no channel. This vault measured 75 of 96 documents stale after one 3,468-file cleanup, so a whole-vault count is not the answer.
**Prior**: overturns the npm clause of 2026-07-27 "The app embeds MCP…" (its failing `npx` guidance is fixed by Connect Agent; what is published now is a terminal command for review and CI). Overturns the closed npm door of 2026-09-11 "…prepared, not published"; its `.mcpb` bundle stands. Overturns condition three of 2026-08-20 (88) for Atlas's own command only: a command a terminal cannot find is not installed. 2026-08-30 (CLI runs MCP modules), 2026-09-04 (exit codes) and 2026-09-07 (one address) stand.
**Decision**: keep `status`, `brief`, `check`, `open` and a narrowed `init`; delete the other 61 commands and `integration.test.mjs` after their callers move. `brief` measures one change and names each group's source. `check` exits 1 only for `--fail-on` states, 2 when it cannot answer. `open` starts the app with arguments, no URL. One package carries command, MCP server and plugin; the app writes one PATH file at a press. Order: probe, commands, app, callers, deletion, plugin, npm, tap. Publishing still needs the owner's yes then. Detail: `docs/specs/2026-11-22-cli-rebuild.md`.
**Dissent**: remove the command, the owner's first question: every door is a surface to keep true. It is the fallback. 2026-07-27's "publishing isn't reversible" holds, so npm is last.
**Falsifier**: the brief-only probe misses its pass line on ten real agent changes; then nothing public is built or published.
**Owner**: jinan (wording is a draft for their acceptance)
