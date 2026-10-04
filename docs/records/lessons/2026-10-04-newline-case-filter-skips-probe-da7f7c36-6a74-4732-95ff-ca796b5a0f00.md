---
id: da7f7c36-6a74-4732-95ff-ca796b5a0f00
date: 2026-10-04
kind: mistake
status: reported
harness_area: performance
---
**Observed**: A deliberate naive glob-collapse defect initially appeared GREEN because the targeted Vitest filter `path .* vs pattern` selected16 of19 shared path rows. The dot did not cross a newline in the test name, so all three newline rows were skipped. Selecting the stable suffix `matches identically in web and MCP` exercised19 rows and caught the planted defect in each surface; sources were restored immediately and the complete42-test contract passed.
**Cost**: One misleading targeted GREEN cycle; elapsed about0.2 seconds. No CI round.
**Suspected cause**: A name filter used a wildcard over user-shaped text containing line terminators, narrowing the protected inventory unintentionally.
**Proposed change**: none. Check selected subject counts against the intended inventory, and filter on a stable test-name suffix when parameter values can include newlines.
