---
id: 9a1d9a56-00e6-4c12-a612-d7ba4e2ad201
date: 2026-09-27
kind: tool-efficiency
status: reported
harness_area: gates
---
**Observed**: A recurrence of lesson 511e2b15-e729-417e-9bbb-6065b554d6bb on `perf/desktop-memory`, in the round that answered the security review of #2056. After the fixes were written, `pnpm exec vitest run tests/contract/source-comment-bytes.contract.test.ts` failed on three areas: `comment-bytes.src-tauri: 53950 > 53716`, `comment-bytes.src-shared: 18896 > 18888` and `comment-bytes.src-widgets: 67384 > 67177`. A scratch per-file script run against `HEAD` traced the growth to new comments in `git.rs`, `acp.rs`, `lib.rs`, `tauri-git.ts`, `PendingDocumentPane.tsx` and `AtlasGitPanel.test.tsx`, and six of them were removed before the first commit.
**Cost**: about 10 minutes and one extra contract run, estimated; no CI round.
**Suspected cause**: the per-area budget is still seen only when the contract runs; the `comments:delta` script proposed in 511e2b15 does not exist yet.
**Proposed change**: script: the change 511e2b15 proposed, a per-file and per-area comment-byte delta against the merge base that `checks:changed` prints before its lanes run.
