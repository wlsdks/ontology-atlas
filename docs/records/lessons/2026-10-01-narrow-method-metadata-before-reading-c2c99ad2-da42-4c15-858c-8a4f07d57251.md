---
id: c2c99ad2-da42-4c15-858c-8a4f07d57251
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: tool-discovery
---
**Observed**: Tool discovery printed full `ALL_TOOLS` descriptions when only a few method names and their argument declarations were needed. The metadata includes repeated construction guidance; the product planner reported a large, truncated result from the same pattern.
**Cost**: Extra output and a follow-up read; exact tokens and elapsed cost unknown.
**Suspected cause**: Discovery and argument inspection were combined into an unrestricted metadata dump.
**Proposed change**: none. Filter names first, then inspect only the selected method declaration or argument section. Existing task instructions already require narrow source reads; no resident rule or new tool is needed.
