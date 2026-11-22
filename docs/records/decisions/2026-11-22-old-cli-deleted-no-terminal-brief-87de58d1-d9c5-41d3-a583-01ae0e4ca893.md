---
id: 87de58d1-d9c5-41d3-a583-01ae0e4ca893
date: 2026-11-22
---
## 2026-11-22 — The old command is deleted and no terminal brief is built: the probe found no gain

**Why**: owner decision, 2026-11-22. 61 of 62 commands mirror MCP tools, and eleven app source files show command lines an app user cannot run. A rebuilt `brief` was probed first: 10 merged agent changes (3 mechanical controls), text-only Sonnet readers, keys hashed before any packet, and blind Opus grading. Missed impacts out of 124: diffstat and description 105, the same again 99, plus brief 100, full diff 78. The 2% gain sits inside the noise of 6, because brief names a document whose file changed, and the reader already sees the file. Wrong beliefs did not rise and the controls stayed clean.
**Prior**: 2026-07-27 (npm publish plan dropped) and 2026-09-11 (prepared, not published) stand. 2026-08-30 (the CLI runs MCP modules) lapses with the commands.
**Decision**: delete the 61 commands, `cli/src/integration.test.mjs` and every guide, README and screen line that teaches them, after internal callers move to the engine. Keep `init`. Build no `status`, `brief`, `check` or `open`, no install button, and no npm or Homebrew package. Detail: `docs/specs/2026-11-22-cli-rebuild.md`.
**Dissent**: the readers were agents, not people, and the keys reached past the diff. A sharper brief that says what is affected might still help.
**Falsifier**: a terminal summary beats the A-to-A' noise floor in the same probe; then it gets its own spec.
**Owner**: jinan
