---
id: 511e2b15-e729-417e-9bbb-6065b554d6bb
date: 2026-09-27
kind: tool-efficiency
status: reported
harness_area: gates
---
**Observed**: On `perf/desktop-memory` the first `pnpm exec vitest run tests/contract/source-comment-bytes.contract.test.ts` came after the code was written and failed with `comment-bytes.src-tauri: 54086 > 53716 bytes`. A per-file count with `extractCommentTokens` (a scratch script; the gate prints only area totals) then showed the second half of the work at +927 bytes in `src-tauri`, +376 in `src/shared`, +93 in `scripts`, +12 in `src/entities` and +9 in `tests/e2e`. Every area had to be brought back to zero or below by a trim pass over 10 files, and a later restructure put one trimmed comment back and needed a second pass.
**Cost**: about 40 minutes and two rounds of edits, estimated; no CI round.
**Suspected cause**: the ratchet sums comment bytes per area over the changed files, but nothing shows the running per-file or per-area delta while the code is written, so the budget is first seen at test time as one area total.
**Proposed change**: script: a `pnpm comments:delta` (or a `checks:changed` line) that prints the per-file and per-area comment-byte change against the merge base, so the budget is visible before the first commit.
