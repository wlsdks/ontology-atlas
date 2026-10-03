---
id: fc860bc5-7f74-46cc-8276-8c7637e623a9
date: 2026-10-03
kind: mistake
status: reported
harness_area: source-comments
---
**Observed**: The character refinement added native-grid registration comments and a presentation-source comment. `pnpm checks:changed -- --run` correctly rejected `comment-bytes.scripts: 3527 > 2943 bytes`. A first edit reduced it to 3032 bytes and still failed. Removing redundant prose and shortening the generator's existing summary retained the crop/margin/eye logic and its owner documentation without a ratchet raise.
**Cost**: One interrupted focused-check run and one unsuccessful focused retry; active elapsed cost was not measured.
**Suspected cause**: The slice used comments to repeat intent already expressed by source names, tests and docs/design/brand.md, without measuring the changed-area comment budget.
**Proposed change**: none — keep the existing ratchet. Use clear function and asset names, and put the visual usage contract in its owner document.
