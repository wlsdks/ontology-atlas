---
id: fb2eebc5-ac6a-4447-aabf-29e961904bcb
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: construction-eval
---
**Observed**: A local MCP trial advertised a source-only analyzer window while the unchanged first-turn handoff requested connection_info/list_kinds and full discovery. Those tools/arguments were not accepted by the window, causing failed calls and repeated full analysis; captured prompt input grew from 21,545 to 93,856 bytes before any writes.
**Cost**: Eight recorded model requests totaled over five minutes; recovery cost unknown. Zero nodes were written.
**Suspected cause**: Client tool-window narrowing did not match the actual first-turn protocol and did not enforce the advertised source-only arguments.
**Proposed change**: script — preflight every mandatory prompt call against the advertised window and reject a mismatched setup before model inference; source-only continuation needs a separate compatible discovery step, not silent argument rewriting.
