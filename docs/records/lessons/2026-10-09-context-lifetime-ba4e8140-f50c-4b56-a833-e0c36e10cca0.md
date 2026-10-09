---
id: ba4e8140-f50c-4b56-a833-e0c36e10cca0
date: 2026-10-09
kind: tool-efficiency
status: reported
harness_area: token-budget
---
**Observed**: `pnpm harness:tokens -- --since=2026-09-25`: 193 runs processed 7.87B context tokens; 79 runs grew past 200K, peaking at 967K (Opus 5.5 compacts near 967K). Investigators re-read 415K per turn; the four costliest (565-684 turns) were feature missions, not failures. Implementers and investigators started at 51K tokens against a reviewer's 27K because they had no tools allowlist.
**Cost**: measured: 65% of the weighted bill was cache reads of oversized context; investigators 42.7% of context tokens, the lead 21.9%.
**Suspected cause**: no compaction window, turn cap or tools allowlist, and no xhigh building role, so open-ended work went to investigator.
**Proposed change**: gate: autoCompactWindow 200000, maxTurns and tools on every agent (agents:check), investigator refuses non-failures, `pnpm harness:tokens` to measure.
