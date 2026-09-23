---
id: "1882a511-134d-42df-9e80-ad3aa8fc80d8"
date: "2026-09-23"
task: "PERF-PROJECT-COMPILE"
status: "done(local project compilation reuse and verification)"
parents: []
worktree: "main-3"
---
# Project brief compilation reuse

## Product pass

After the previous graph, Git-history, import-parser, and document-read improvements, a 5,000-node project still spent a median 50.61 ms compiling its selected scope on every agent-brief request. The full-vault cache was already warm. This slice removes that repeated compilation.

- Prior: 2026-08-28, "First-contact diagnosis preserves and reuses summary history", remains standing: preserve every result and invalidate reuse when its input version changes.
- Outcome: `orient`; the same project facts and uncertainty arrive sooner. Evidence observed. Internal reversible change; truth, transfer, agent-write, and human-correction boundaries unchanged. PO route: two-way solo.
- Recovery proof: repeated briefs for unchanged vault bytes and the same selected project return identical results without recompiling. Project changes, byte edits, and mtime-only changes must not reuse a stale projection. Outside-document diagnostics must not enter the selected project's graph.
- PO run: `7d99c63f-5548-43a2-ac5f-27d6d5be7a2e`. Owner clarity and later independent task reuse remain unmeasured.

## Implementation

If the selected scope contains every loaded document, reuse the full artifact: compiler inputs are identical. Otherwise retain the last separately compiled project under the full artifact's object identity and canonical project slug. A WeakMap releases old parent versions, and each parent retains at most one separate projection. No source documents or meaning judgments are cached here.

Every request still reads current vault bytes and recomputes validation, source currentness, project document scope, and meaning assessment. A graphHash alone is deliberately insufficient for the cache key: mtimes can change while the structural hash stays the same. Non-node documents prevent the whole-artifact shortcut because they can contribute diagnostics outside the project scope.

The existing compiled-cache and agent-brief responsibilities remain accurate; no ontology content or public schema changed.

## Measurement

Same process and 5,000-node fixture, warmed caches, nine alternating-order samples, median handler time including JSON serialization; startup and transport excluded:

| Shape | Agent brief before ms | After ms | Reduction |
|---|---:|---:|---:|
| Every document in the project | 503.57 | 451.33 | 10.4% |
| Project with an unscoped non-node note | 488.27 | 444.98 | 8.9% |

Unchanged health controls remained approximately stable (386/382 ms and 380/381 ms). Initial results match in both shapes. An additional 24 complete before/after comparisons cover repeated agent briefs, workspace briefs, and health on the real 97-node vault and the 5,000-node fixture. The fixture is not semantically qualified; no findings or unknowns were removed for the measurement.

## Regression proof

The existing real-file query test now counts actual compiled-graph hash inputs. Unchanged project requests compile zero graphs; switching project compiles the correct scope; switching back recompiles because only one separate projection is retained. Byte edits and timestamp-only edits invalidate reuse. Full-scope requests compile only the parent graph. A malformed non-node document still appears in whole-vault validation but not in the selected project's compiler diagnostics.

Five deliberate defects turn the guard RED: disable scoped reuse, ignore the project key, key reuse only by structural graphHash, treat matching node counts as matching compiler inputs, and recompile an identical full scope. Each was restored and the query suite returned GREEN. `checks:changed` and the existing MCP CI lane include the test; no new command or CI policy was added.

## Boundary

Local implementation and proof before PR landing. Cold Git history traversal, deployment, installed-app latency, and browser FPS are outside this measured improvement. Session artifacts, including paired samples and RED/GREEN logs, are in `/tmp/atlas-performance-main-3/`.
