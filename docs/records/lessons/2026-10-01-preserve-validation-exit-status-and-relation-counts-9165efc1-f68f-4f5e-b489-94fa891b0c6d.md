---
id: 9165efc1-f68f-4f5e-b489-94fa891b0c6d
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: The compiler dictionary regression initially expected four outbound and inbound relations per node, but each fixture also declared domain: equal to its own slug, making five relations. A shell command ran the failing Node suite followed by a successful PO route and returned the latter's zero exit code. Inspecting the unit log exposed the failure; the expectation was corrected and the suite rerun separately to success.
**Cost**: One incorrect test expectation and one focused rerun; separate elapsed time unmeasured.
**Suspected cause**: Omitting the typed domain relation from the fixture's expected degree, plus masking a test process exit status with a subsequent command.
**Proposed change**: none; count every authored relation in fixtures and execute dependent validation commands separately so a later success cannot hide a failure.
