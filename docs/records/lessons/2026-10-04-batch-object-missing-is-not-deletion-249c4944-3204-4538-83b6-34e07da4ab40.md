---
id: 249c4944-3204-4538-83b6-34e07da4ab40
date: 2026-10-04
kind: process
status: reported
harness_area: performance
---
**Observed**: An isolated Git probe returned the same `missing` batch classification for an absent path and for a tree entry whose local blob was removed. The existing history reader returns `None` for the first and `git-history-unavailable` for the second. `atlas-git-history-probe-2026-10-04/missing-object-proof.json` records the planted cases; no production substitution was made.
**Cost**: One synthetic-repository probe, about 0.06 seconds; no failed CI round. Investigation elapsed time unknown.
**Suspected cause**: Batch object resolution does not carry enough evidence by itself to distinguish a missing path from missing local object bytes.
**Proposed change**: none. Preserve the existing fail-closed distinction before optimizing a Git transport. A shared `missing` marker is not evidence of deletion.
