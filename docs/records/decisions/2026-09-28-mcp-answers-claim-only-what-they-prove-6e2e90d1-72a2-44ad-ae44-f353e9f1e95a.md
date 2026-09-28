---
id: 6e2e90d1-72a2-44ad-ae44-f353e9f1e95a
date: 2026-09-28
---
## 2026-09-28 — MCP answers claim only what they prove: exact cycle counts, node-aware backlink rows

**Why**: `cycles` stopped after `limit + 1` cycles yet reported `totalCyclesExact: true` (84 cycles answered 21); `find_backlinks` and `delete_concept` rows from wiki pages, notes and uid-less nodes lacked the `uid` and `kind` their schema required; `connection_info`'s multi-line card failed its single-line pattern. A client that validates `structuredContent` rejects such answers.
**Prior**: keeps 2026-07-28 "Cut exploding graph queries honestly, with a budget (`cycles`)" and 2026-07-29's length-1 cycles; extends 2026-08-17 (66) from `find_evidence` to backlink rows, except that a node row requires `uid` only when the node has a valid one.
**Decision**: `cycles` counts every simple cycle up to `maxHops` once and lists the shortest up to `limit`; only `searchBudget` can leave `totalCycles` a lower bound, flagged `totalCyclesExact: false`, and `health` repeats the flag. Backlink rows carry `isNode`, `kind` for nodes and `uid` when valid, under one schema both tools share. The card and guide texts use a multi-line text schema.
**Dissent**: (66)'s dissent applies: a client that flattens conditional JSON Schema treats `uid` and `kind` as optional on every row. A dashboard that kept the capped `totalCycles` sees a larger number after upgrade.
**Falsifier**: an agent or script that breaks on the larger exact count or on `isNode` rows, or a validating MCP client that rejects the conditional row schema.
**Owner**: Stark
