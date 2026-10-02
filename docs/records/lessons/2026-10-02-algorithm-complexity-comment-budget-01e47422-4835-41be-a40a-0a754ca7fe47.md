---
id: 01e47422-4835-41be-a40a-0a754ca7fe47
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: gates
---
**Observed**: A recurrence of lesson 9a1d9a56-00e6-4c12-a612-d7ba4e2ad201 during the algorithm performance audit. `pnpm checks:changed -- --run` rejected new complexity comments in the `src-features` and `mcp` areas through `source-comment-bytes.contract.test.ts`. After removing explanatory prose and putting the linear indexing complexity in a helper name, a remaining four-byte MCP increase needed another correction. The next run passed all 15 recommended checks without changing a ratchet baseline.
**Cost**: two failed local gate attempts and repeated source edits; wall time unknown, no CI round.
**Suspected cause**: the area comment-byte budget becomes visible after implementation; a useful algorithm complexity annotation can still exceed it when its area has no headroom.
**Proposed change**: script: print touched-file and touched-area comment-byte deltas against the merge base before `checks:changed` starts its recommended lanes, as the earlier lesson proposed. Keep complexity in names where the source already explains the operation.
