---
id: "b1918b78-a25a-4d0f-95ba-552d4866d312"
date: "2026-10-01"
task: "Runtime-Efficiency-Local-AI"
status: "in_progress"
parents: []
worktree: "refactor/bounded-analysis-history"
---
# Runtime efficiency and local-AI quality campaign

Owner request: examine data storage, memory lifetimes, ACP, internal prompts, non-ACP local AI and MCP, and module/package responsibilities; deliver clean, bounded changes to main.

Completion criteria: each owned runtime area has a current-source audit disposition and evidence; confirmed material defects are fixed and verified, deferred architectural changes carry a specific reason and falsifier, and every built slice lands with task-branch cleanup. Tests, merge and deployment do not establish semantic meaning acceptance.

Sequence:
1. Storage and archive reads: canonical Markdown/immutable record boundaries, bounded pagination and buffer allocation, retention and cache invalidation.
2. Agent transport/lifecycle: bounded HTTP/ACP startup output, cancellation and late responses, audit-before-send, resource cleanup.
3. ACP transcript/rendering: preserve complete permission and turn evidence while reducing packet-driven allocations and rendering.
4. Local AI/MCP paths: distinguish endpoint reachability, tool-envelope compatibility and grounded-answer quality; probe currently installed qwen3:8b without downloading models or changing shared runner configuration. Preserve no-tool and error states.
5. Prompt/context quality: trace each instruction delivery path, remove proven redundancy, test evidence/scope/language/citation failures, keep human write approval.
6. Code/module structure and remaining runtime hotspots: split actual cohesive responsibilities, reduce oversized owners without wrappers or new packages that lack a distinct delivery/reuse need; measure remaining UI/graph and package costs.

Observed initial risks: analysis reads allocate the 2 MB maximum for every small file; history pages retain/sort the complete name inventory; native curl uses unbounded wait_with_output; ACP startup queues retain every early event; in-app local connection verification checks /v1/models, not model tool behavior; local AI and ACP use separate execution paths. These are audit observations, not yet delivered fixes or whole-model quality scores.

Current slice: bounded analysis history page selection and record-sized buffers, preserving ordering/cursor/filtering and integrity guards. Model-family claims remain unknown until live probes. The active goal stays broader than this slice.
