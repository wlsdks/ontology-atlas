---
id: "cfc760a1-d1cd-4ce2-a9ba-eaa7924ece15"
date: "2026-09-23"
task: "PERF-MCP-HISTORY"
status: "done(local evidence-date optimization and verification)"
parents: []
worktree: "main-3"
---
# Repeated MCP diagnosis: committed evidence-date reuse

## Scope and product pass

The owner selected the largest measured bottleneck. After the graph engine slice, profiling the real 97-node project found roughly one second per repeated `health` or `agent_brief` call, compared with about six milliseconds for a node or overview query. Of 9.56 seconds sampled inside synchronous subprocess work, 9.07 seconds came from the bounded evidence-date history walk. The walk already batches paths; it was repeated unnecessarily across requests.

- Prior: 2026-08-28, "First-contact diagnosis preserves and reuses summary history" remains standing. Its repeated-diagnosis latency falsifier was observed again in evidence dating, while its preserve-every-verdict and same-HEAD-history-expansion conditions remain requirements.
- Human outcome: `judge`. People and agents can reuse the same evidence-currentness result promptly while file deletion and changed Git history remain visible.
- Evidence: observed CPU profile and real JSON-RPC responses. Reversible internal change; all four truth/transfer/agent-write/human-correction boundaries unchanged. PO route: two-way solo.
- Recovery proof: given identical paths, history bounds, and visible Git history, a repeated diagnosis preserves every evidence date and verdict; a new commit, shallow-history expansion, replacement ref, graft, or working-tree deletion must not reuse a stale fact.
- PO run: `574c1e65-02ad-436d-b516-30070aec4cd1`. Owner clarity and later-task reuse are unmeasured.

## Change

`mcp/src/git-tools.mjs` retains only committed path dates in an eight-entry process-local cache. Its key includes repository root, ordered path mappings, commit bound, HEAD, shallow boundary contents, graft contents, and replacement references. Failed or history-crossing walks are not retained. Existence and file-versus-directory state are read from disk on every request; returned result rows are fresh objects. No query schema, evidence verdict, write authority, or vault content changed.

## Measurement

One persistent source MCP process per version, same real vault and repository, sequential JSON-RPC calls, one first sample plus four repeated samples per operation. Numbers are medians of the four repeated samples; CPU profiling was enabled in both processes. Baseline includes the earlier graph optimization, isolating this slice.

| Operation | Before ms | After ms | Reduction |
|---|---:|---:|---:|
| Health | 1029.56 | 118.23 | 88.52% |
| Agent brief | 1009.60 | 126.39 | 87.48% |

The first health call still performs the original history walk: 1134.26 ms before and 1176.96 ms after in this sample. This improves repeated MCP requests, not cold CLI processes. Overview and node-profile responses remained around six milliseconds. Response byte counts matched for each operation, and the original versus new history collector returned exactly identical results for all 185 paths across three history bounds and three cold/reused comparisons each.

## Verification

- Git suite: 20 passing tests, including live deletion, directory replacement, caller mutation isolation, HEAD changes, path-set changes, commit-bound changes, shallow fetch without changing HEAD, replacement references, and grafted ancestry.
- Git trace confirms four unchanged-history calls perform exactly one bounded `git log`; the fixture asserts that a committed date was actually found.
- Seven deliberate mutations turn the guards RED: disable reuse; omit HEAD, path set, or bound from the key; ignore shallow boundaries, replacement references, or grafts. Each was restored; the complete Git suite returned GREEN.
- `checks:changed` recommends the Git suite and MCP unit suite. The existing MCP lane in `.github/workflows/checks.yml`, via `scripts/classify-change.mjs`, runs `test:mcp:unit` automatically.
- Ontology inspection: `elements/git-evidence-dating` still owns the same bounded committed-date lookup. No modeled responsibility or relation changed; no vault write was needed. Existing historical uncertainty text was not treated as a current runtime fact.

## Delivery boundary

Local performance implementation and regression proof. No merge, release, or installed-app claim. The existing missing meaning-finalization receipt remains separate from graph and runtime correctness. Browser rendering and cold CLI startup are outside this measured improvement.

Session artifacts: `/tmp/atlas-performance-main-3/`, including `runtime-dogfood.json`, `runtime-dogfood-after.json`, both CPU profiles, Git trace/failure probes, and final verification logs.
