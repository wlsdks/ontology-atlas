---
id: 1323c00d-93e6-4d5d-9f34-87e255df8b8d
date: 2026-10-09
kind: gate-gap
status: reported
harness_area: async-retirement
---
**Observed**: The first implementation retired the proposal card's operation guard together with stale feedback when selection changed. The independent reviewer used the actual shared copyText helper: a newer native copy succeeded, then the older native promise rejected and its legacy fallback replaced the clipboard with the old selection. The earlier state-only regression ignored the old completion but did not measure the clipboard effect. Source: src/widgets/vault-agent-panel/ui/AgentProposalCard.tsx; regression: waits for an old clipboard fallback before copying a new selection in AgentProposalCard.test.tsx.

**Cost**: One independent finding and one local fix round; no CI round. The confirming regression failed before the fix, then the card, hook and shared copy helper's 49 cases passed together.

**Suspected cause**: Retiring visible feedback was treated as retiring the operation that produces a side effect. A stale-response check alone cannot stop a late fallback from writing.

**Proposed change**: gate: for async write or clipboard retirement, probe the real downstream helper and assert the final bytes and operation order, not only the latest displayed state. Keep the operation lock until all native and fallback work settles while retiring feedback independently. The current regression covers that property with a deferred rejection and retry.
