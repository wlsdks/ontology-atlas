---
id: 419e3c34-5cea-44b7-8ef0-641640f3379c
date: 2026-09-21
---
## 2026-09-21 — Automations keep schedules and their results in one flow

**Why**: The owner rejected the Automations surface as visually inconsistent and selected a schedule-first redesign. Rendered inspection showed a sparse empty state, a creation button competing with existing results, and raw tool names outweighing the report.
**Prior**: 2026-09-20 Automations hub schedules stands: separate Ontology and Documents lanes, a local running-app clock, read-only ontology reviews, and human-owned ontology writes.
**Decision**: Use one design-system form column. An empty lane has one first-schedule action; populated rows show cadence, state, next run, and latest outcome, with inline reports and secondary actions. Older runs and tool receipts expand on demand. Existing results outrank creation. Removal has an inline confirmation and cancellation path. Execution authority remains unchanged.
**Dissent**: None. The owner selected this direction over a split inspector and an activity-first dashboard.
**Falsifier**: A person cannot identify the next run and latest result from the schedule list, or cannot inspect the evidence and cancel a schedule edit from the same flow.
**Owner**: Atlas maintainer
