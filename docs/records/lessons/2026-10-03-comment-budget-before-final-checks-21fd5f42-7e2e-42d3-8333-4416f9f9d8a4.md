---
id: 21fd5f42-7e2e-42d3-8333-4416f9f9d8a4
date: 2026-10-03
kind: mistake
status: reported
harness_area: performance-audit
---
**Observed**: `pnpm checks:changed -- --run` stopped at check 11/16 because `source-comment-bytes.contract.test.ts` measured 6,266 comment bytes in the changed src/views files against 5,394 at the merge base. The duplicate correctness and performance cases had already passed. Repeated scoring explanations and verbose new comments caused the increase.
**Cost**: One interrupted focused-check round; exact wall cost unknown.
**Suspected cause**: Comments were expanded without checking the existing per-area comment-byte ratchet before the final verification round.
**Proposed change**: none. Keep the score-bound proof and tie-order contract concise, remove duplicated descriptions, and inspect the comment-byte delta before the final checks rather than raising the ratchet for routine work.
