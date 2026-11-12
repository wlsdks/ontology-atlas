---
id: 2772495a-e0e0-4502-ae4c-bc19a90baa82
date: 2026-11-13
---
## 2026-11-13 — Tool and help text stop citing work orders

**Why**: The absorb tool description and the CLI help named "Slice 0" and a plan document that was deleted, which a reader cannot resolve.
**Prior**: The text opened with "Slice 0 (PRODUCT-PLAN-2026-07.md §4/§9)" as a build-time label.
**Decision**: Printed help and MCP tool descriptions describe what the command does and cite no plan, slice or work order; the trigger here is wording only, with no schema or behaviour change.
**Dissent**: The label let a maintainer trace a command back to the plan that introduced it; git history still does that.
**Falsifier**: An agent picks absorb_document less reliably after the description lost its opening phrase.
**Owner**: Stark
