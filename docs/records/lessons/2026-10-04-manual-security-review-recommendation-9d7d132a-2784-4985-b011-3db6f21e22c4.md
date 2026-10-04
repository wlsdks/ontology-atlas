---
id: 9d7d132a-2784-4985-b011-3db6f21e22c4
date: 2026-10-04
kind: process
status: reported
harness_area: performance
---
**Observed**: `checks-status-sharing-record.log` passed 17 automated recommendations, but its security-contract recommendation also required one independent reviewer with the security lens. I treated the mechanical PO skip as sufficient and landed #2491 without that review. The next native archive check exposed the same wording, and I requested the existing independent reviewer for both diffs before landing the archive slice.
**Cost**: One review performed after landing instead of before it; defect impact unknown until review completes. No extra CI round yet.
**Suspected cause**: The automated runner executes commands, while the security recommendation's prose obligation remains the author's responsibility; mechanical product routing was incorrectly treated as overriding it.
**Proposed change**: none. Complete both command and prose recommendations. A mechanical product skip does not waive an explicitly required security review.
