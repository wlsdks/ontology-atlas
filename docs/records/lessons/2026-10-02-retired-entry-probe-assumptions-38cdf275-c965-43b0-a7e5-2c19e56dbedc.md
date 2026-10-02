---
id: 38cdf275-c965-43b0-a7e5-2c19e56dbedc
date: 2026-10-02
kind: mistake
status: reported
harness_area: e2e
---
**Observed**: The retained mascot E2E's dense-map probe located the old idle game button. Full game retirement correctly removed that button, so the old geometry probe returned no subject. Attempts to combine a local OPFS heartbeat with a page reload also lost the fixture handle/instrumentation. The focused-check runner was initially started without PLAYWRIGHT_STATIC=1 despite a completed production export.
**Cost**: Three unsuccessful dense-fixture attempts and one interrupted development-server check run; elapsed cost unknown.
**Suspected cause**: The test mixed a permanent game affordance with transient verified-work feedback. Reusing the visual selector preserved the old assumption after the product state changed.
**Proposed change**: none. Keep active READ/SUCCESS lane geometry and responsive tests, and separately assert a nonempty dense map has no mascot without verified work. Run the final focused checks against the production export with PLAYWRIGHT_STATIC=1. Review test deletions as part of the retirement diff.
