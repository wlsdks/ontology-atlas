---
id: 99739f10-c811-4f20-b2b8-a21f93a86dc6
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: file-writing
---
**Observed**: Writing `scripts/lib/third-party-licenses.mjs` with the Write tool, the regex source `.replace(/^\uFEFF/, '')` landed on disk as `/^` plus the raw U+FEFF character plus `/` (`od -c` showed bytes `357 273 277`), and the test string `"\uFEFFMIT License"` in `scripts/build-notice.test.mjs` did the same. A probe file written the same way kept `\u0000` as six ASCII characters but turned `\uFEFF` and `\u00e9` into the characters themselves, and a Bash command carrying the same escape was refused by the worktree guard as too complex. Lint, the unit tests and `pnpm checks:changed` passed, because the raw character behaves the same at runtime; only reading the bytes caught it.
**Cost**: about ten minutes and one extra focused-check run; no CI round. The defect is invisible in editors and diffs.
**Suspected cause**: the Write and Edit tools decode JSON-style `\uXXXX` escapes in file content before writing, except a few control characters, so an escape meant for source code arrives as the raw character.
**Proposed change**: script: a lint rule or check that refuses a raw U+FEFF or other invisible format character in source files; until then, build such an escape with `String.fromCharCode` in a generator script, or write it with Python `chr(92) + 'uFEFF'`, and confirm it with `od -c`.
