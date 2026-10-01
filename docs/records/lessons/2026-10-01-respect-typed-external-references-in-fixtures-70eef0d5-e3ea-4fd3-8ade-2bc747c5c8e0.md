---
id: 70eef0d5-e3ea-4fd3-8ade-2bc747c5c8e0
date: 2026-10-01
kind: mistake
status: reported
harness_area: performance
---
**Observed**: The new mixed-target aggregation test initially put src/file.ts under dependencies and expected it to count as external. The test failed with 0 external edges instead of 6. ontology-compiler.mjs classifies path-like unresolved refs as external only through the elements relation. Moving the source path to elements made the test pass without changing that contract.
**Cost**: One failed focused unit-test run; separate elapsed time unmeasured.
**Suspected cause**: Assuming a path-looking string implies an external edge independently of its typed relation.
**Proposed change**: none; construct mixed-target fixtures from the existing typed relation contract before interpreting aggregation failures.
