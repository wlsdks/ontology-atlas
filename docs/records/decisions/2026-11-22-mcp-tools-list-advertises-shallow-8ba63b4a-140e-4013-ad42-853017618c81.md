---
id: 8ba63b4a-140e-4013-ad42-853017618c81
date: 2026-11-22
---
## 2026-11-22 — Tool definitions say what to send; the server checks the full shape

**Why**: The owner, 2026-11-22, asked whether 319 KB of `tools/list` was normal and wanted it cut without lowering construction quality. The model read 114,564 bytes of descriptions and input schemas each turn, 30,051 of them for `analyze_repo_structure`, whose `proposal` and `qualification` schemas alone were 25 KB.
**Prior**: Keeps the strict-input contract of `mcp/src/server/validate.mjs` and the 2026-10-14 compact-handoff decision; narrows what `tools/list` advertises, not what the server accepts.
**Decision**: `proposal` and `qualification` advertise a shallow shape and are checked against their full contracts on the server before any work. A refusal names the field path, the rule, the expected shape and one valid example. Top-level single-line patterns move to the server. Descriptions keep purpose, required arguments, side effect and next call; detail moves to refusals and `connection_info` guides. `finalize_project_meaning` keeps its five competency questions inline, and a project row in `add_concepts` may list its `domains`. Model-read bytes: 114,564 to 60,123 on the full profile, 83,815 to 41,471 on construction.
**Dissent**: A client that validates arguments locally against the advertised schema no longer catches a malformed `proposal` before sending it; the server's refusal arrives one round trip later.
**Falsifier**: a field trial on unread repositories in which the change's builds place fewer surveyed abilities, write fewer `## Excludes` or `## Includes`, or are refused more often than the base's beyond run-to-run noise. Measured at the decision: Excludes 81% and 85% against 82% and 63%, boundary-missing findings 5.3 and 3.3 against 10.7 and 14.7, cost per build $1.35 and $1.10 against $1.56 and $1.39 (Opus, 3 and 6 builds per arm on a Python and a Go repository). Removing the competency list alone dropped Excludes on the Go repository to 4%.
**Owner**: Stark
