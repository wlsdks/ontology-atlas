---
id: 0623f4f6-6298-4260-b968-92d6564ecf0e
date: 2026-10-06
kind: tool-efficiency
status: reported
harness_area: release
---
**Observed**: A pre-push run and desktop release rehearsal ran concurrently in one checkout. The comment_refs lane reported scripts/build-docs-vault.mjs:52 -> public/docs-vault/CHANGELOG.md missing; the file existed again after the build. Nine other pre-push lanes passed.

**Cost**: One rejected push; the unit lane took 197 seconds.

**Suspected cause**: Both operations rebuild generated Docs Vault files. The comment reference scan likely observed the removal/recreation window.

**Proposed change**: none; serialize release rehearsal and pre-push in a shared checkout. Parallelize read-only tasks only when their inputs are stable.
