---
id: "676bf4bf-da80-45d6-8c3f-f5ecacb1ece2"
date: "2026-09-23"
task: "PERF-GRAPH-QUERY"
status: "done(local query optimization and verification)"
parents: []
worktree: "main-3"
---
# Graph query performance: local implementation and verification

## Scope and product pass

- Baseline: `98f55f8d21721ce18f39291371e3bc2bd43a3eda`, Node 24.16.0, macOS, worktree `main-3`.
- Prior standing decision: 2026-08-14 (8), static asset budgets are separate from runtime evidence; its falsifier was not observed.
- Human moment: a person or agent asking for graph context must retain the same evidence, ordering, partial-result flags, and next reads while waiting less for computation.
- Outcome: `orient`; observed CPU profile and scale benchmark. Internal reversible change; truth, transfer, agent-write, and human-correction boundaries unchanged. Router: two-way, solo, build-and-verify.
- Recovery proof: given the same compiled graph and options, the caller receives identical typed facts and uncertainty without a source-code fallback; fail on any result difference or stale relation membership after a later query.
- PO run: `c0e19493-9c3f-4d01-bea1-5ada743adc56`. Owner clarity and later-task reuse remain pending.

## Implementation

- Compute canonical edge-sort strings once, then build both adjacency indexes from that order.
- Index resolved typed containment membership on first use instead of scanning a domain's children for each lookup.
- Reuse containment neighborhoods and connected components within one engine invocation. These caches do not persist across `queryCompiledOntology` calls or replace vault freshness checks.
- Preserve query schemas, graph truth, ordering, limits, partial evidence, and write authority. No renderer or ontology schema changes.

## Paired measurement

Same process and artifact for both implementations; two warmups, nine alternating-order samples, median milliseconds. The baseline engine was copied outside the checkout before the changes. Synthetic 10,000-node graph with six domains and 38,787 edges:

| Operation | Before ms | After ms | Time reduction |
|---|---:|---:|---:|
| Agent brief | 180.99 | 108.26 | 40.18% |
| Workspace brief | 174.17 | 102.84 | 40.95% |
| Health | 107.58 | 59.33 | 44.85% |
| Node profile | 19.30 | 10.64 | 44.88% |
| Path | 20.01 | 12.31 | 38.46% |
| Relation recommendations | 26.19 | 11.14 | 57.47% |

The separate 10,000-node single-domain stress case reduces recommendations from 63.17 to 11.21 ms (5.64x). This is a high-fanout case, not a general speedup claim. The 1,000- and 5,000-node paired cases also improved for all six measured operations.

## Verification and regression probes

- 720 exact before/after comparisons: 36 operations across 20 deterministic generated graphs, including cycles, dangling references, partial search, and reversed edge order. Every operation completed; errors were not counted as matching results.
- Engine suite: 106 tests passed. Focused planner previously completed all ten recommendations, including 1,170 MCP unit tests; the final added regression guard also passes in the complete engine suite.
- New non-timing complexity guard: 1,000 children. Restoring the old scan reads 502,500 targets and fails; the optimized implementation reads 1,000 and passes. Nonempty work is asserted.
- Additional deliberate defects all turn the guards RED: omitted canonical order, unresolved edges counted as containment, relation types ignored, and a membership cache escaping into later queries. Original implementation was restored after each probe and the full engine suite returned GREEN.
- Automatic wiring: `checks:changed` recommends the engine test and `test:mcp:unit`; `.github/workflows/checks.yml` runs the MCP lane, whose `scripts/classify-change.mjs` inventory includes `test:mcp:unit`.
- `pnpm dogfood:verify` passed against this checkout's MCP: 40 tools, 97 nodes, 336 relations. Compiler/schema/reference checks pass. The pre-existing missing meaning-finalization receipt remains an advisory, not an accepted meaning claim.
- `pnpm test:perf`: six files, ten tests passed. `pnpm build` and `pnpm desktop:perf` passed; 10.25 MiB of Next static assets, largest chunk 0.80 MiB.
- Computer Use: the production build rendered the synthetic 3,000-node canvas; the real sample's Order domain opened its children, dependencies, and evidence panel in Chrome. In-app browser was unavailable. No browser frame-time or installed-app speedup is claimed.
- Ontology sync inspection: existing `capabilities/vault-graph-query`, `elements/graph-engine`, and `elements/compiled-graph-cache` still describe the same responsibilities; no meaning delta or vault write was needed.

## Delivery boundary

Local implementation and verification only. No merge, release, or installation is claimed. These results measure in-process query computation, not file I/O, MCP process startup, transport, browser rendering, or WKWebView. They do not establish a universal best-in-class claim.

Reproduction artifacts for this session: `/tmp/atlas-performance-main-3/`, including paired fixtures/results, baseline CPU profile, differential runner, deliberate RED/GREEN logs, build output, and final focused-check logs.
