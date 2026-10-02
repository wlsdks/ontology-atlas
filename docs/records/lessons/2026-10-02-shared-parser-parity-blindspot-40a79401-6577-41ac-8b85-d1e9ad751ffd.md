---
id: 40a79401-6577-41ac-8b85-d1e9ad751ffd
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: parser-contracts
---
**Observed**: The four-reader frontmatter contract passed its existing 168 cases while all readers mishandled quoted mapping keys and nested quoted scalars. Four new shared cases produced 16 failures. Repeated file round trips also exposed escaped backslashes becoming control characters. New caller-level repair/refusal tests detected silent loss during unrelated writes.
**Cost**: 16 reproduced reader failures and two unsafe writer paths; affected real-user files and historical incidence are unknown. No CI round.
**Suspected cause**: Agreement among mirrored implementations was mistaken for adequate input coverage; parser-only cases did not exercise the write/read cycle or malformed-source preservation.
**Proposed change**: none to the harness. Keep expected-data fixtures, repeated cross-reader file round trips and unchanged-byte refusal tests with this repair; parity without an independently expected result is insufficient.
