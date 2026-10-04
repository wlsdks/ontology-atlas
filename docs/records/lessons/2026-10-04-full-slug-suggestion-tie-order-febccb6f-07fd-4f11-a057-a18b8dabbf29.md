---
id: febccb6f-07fd-4f11-a057-a18b8dabbf29
date: 2026-10-04
kind: mistake
status: reported
harness_area: performance
---
**Observed**: A new suggestion-order fixture initially expected `elements/abcd` before `domains/abce` at equal distance. The unchanged baseline returned the opposite because the established tie rule sorts full slugs with localeCompare. `semantic-baseline.log` failed before any implementation change; the fixture was corrected and the unchanged baseline passed.
**Cost**: One targeted baseline round, about7ms test execution; no CI round.
**Suspected cause**: I inferred tie order from displayed tail names instead of checking the established full-slug ordering.
**Proposed change**: none. Establish expected tie output against the current implementation before using it as a behavior-preservation witness, while keeping independently known semantic assertions.
