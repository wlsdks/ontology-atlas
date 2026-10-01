---
id: b6c518cc-4214-4c6e-83e7-f635dc9b0fcf
date: 2026-09-30
kind: mistake
status: reported
harness_area: mcp-navigation
---
**Observed**: list_concepts({kind:'element',query:'graph'}) returned unknown_argument and listed domain, kind, limit, offset, since, summary as supported arguments.
**Cost**: one failed tool call; elapsed cost unknown.
**Suspected cause**: assumed a query argument instead of reading the callable tool contract.
**Proposed change**: none; use supported domain/kind filters and project only relevant rows before printing results.
