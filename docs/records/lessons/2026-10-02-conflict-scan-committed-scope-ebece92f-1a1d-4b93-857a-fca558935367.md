---
id: ebece92f-1a1d-4b93-857a-fca558935367
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: harness
---
**Observed**: `pnpm conflicts:scan -- --head=refactor/mcp-shortest-path-memory` reported zero changed files while `checks:changed` found three working-tree paths. The conflict command compares committed heads, so this scan did not establish overlap safety for the uncommitted slice.
**Cost**: One non-informative conflict scan; no conflicting edits or CI failure observed.
**Suspected cause**: Treating a commit-range scan as a working-tree scan.
**Proposed change**: none — run the existing head scan again after the slice is committed, before delegation/landing. Keep the reviewer read-only; do not infer zero overlap from an empty committed delta.
