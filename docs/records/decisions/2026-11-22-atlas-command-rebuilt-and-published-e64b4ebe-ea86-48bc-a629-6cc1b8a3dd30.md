---
id: e64b4ebe-ea86-48bc-a629-6cc1b8a3dd30
date: 2026-11-22
---
## 2026-11-22 — The Atlas command is rebuilt as a door into the app, and it is published

**Why**: owner decision, 2026-11-22. 61 of 62 commands mirror MCP tools; eleven app source files show command lines an app user cannot run (`cli-invocation.ts:12-14`); a CI runner cannot install the app, so a pull request check has no channel. This vault measured 75 of 96 documents stale after one 3,468-file cleanup, so a whole-vault count is not the answer.
**Prior**: overturns the npm clause of 2026-07-27 "The app embeds MCP…" (Connect Agent fixed its failing `npx` guidance; what is published now is a terminal command for review and CI). Overturns the closed npm door of 2026-09-11 "…prepared, not published"; its `.mcpb` bundle stands. Overturns condition three of 2026-08-20 (88) for Atlas's own command only: a command a terminal cannot find is not installed. Narrows 2026-09-07 (one address): no node address in a URL stands; one launch-argument door is added. 2026-08-30 (CLI runs MCP modules) and 2026-09-04 (exit codes) stand.
**Decision**: keep `status`, `brief`, `check`, `open` and a narrowed `init`; delete the other 61 commands after their callers move. `brief` measures one change. `check` exits 1 only for `--fail-on` states, 2 when it cannot answer. `open` passes launch arguments in a fixed grammar, and the app grants a folder only at a press. The app writes one PATH file at a press and calls it installed only when a terminal finds it. Order: probe, screens, commands, app, callers, deletion, plugin (its own record), npm, tap. Publishing needs the owner's yes then. Detail: `docs/specs/2026-11-22-cli-rebuild.md`.
**Dissent**: remove the command, the owner's first question: every door is a surface to keep true. It is the fallback. 2026-07-27's "publishing isn't reversible" holds, so npm is last.
**Falsifier**: the brief-only probe misses its pass line on ten real agent changes; then nothing public is built or published.
**Owner**: jinan (wording is a draft for their acceptance)
