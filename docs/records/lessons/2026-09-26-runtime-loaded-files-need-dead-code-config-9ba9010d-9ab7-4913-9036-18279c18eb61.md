---
id: 9ba9010d-9ab7-4913-9036-18279c18eb61
date: 2026-09-26
kind: process
status: reported
harness_area: parallel-work
---
**Observed**: splitting scripts/lib/focused-check-suggestions.mjs into runtime-loaded rule files passed 131 tests and a byte-identical output comparison, then failed `pnpm knip`: the dead-code scope did not list the new files as entries and an exception named the old consumer. The fix was two lines in scripts/quality/dead-code/, outside the agent's brief.
**Cost**: one blocked slice and a hand-off to the lead; no CI round.
**Suspected cause**: a brief that moves code into files loaded at runtime (glob, readdir, dynamic import) did not hand the dead-code config to the same owner.
**Proposed change**: skill: /parallel-brief asks the coordinator to include scripts/quality/dead-code/ in the owned files whenever a slice adds runtime-loaded modules.
