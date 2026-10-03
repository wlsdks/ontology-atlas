---
id: 3cda711c-c31e-4a30-853e-eefe15ac448e
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: construction
---
**Observed**: PR #2455 was ejected after train #2456 failed alone. `mcp/scripts/verify.mjs` retained the old unconditional analysis-output required fields, the replay contract still read source-path literals from the shell instead of its shared extractor, and the guide-rendering contract rejected two relative repository links. `pnpm checks:changed -- --run` had passed 37 recommendations, but its plan did not include these consumers. The MCP rules matched top-level source files but missed `mcp/src/server/registry.mjs`; guide and replay rules omitted their raw-text consumer contracts.

**Cost**: one failed CI round; total waiting time unknown. An initial unscoped failed-log read was also excessively large; job-scoped filtered reads identified the three actual failures.

**Suspected cause**: source extraction moved ownership into nested modules and shared helpers without moving focused-check coverage. Passing local recommendations therefore did not cover the changed discovery schema and rendered guide consumers.

**Proposed change**: gate — cover nested MCP sources and the real guide/replay consumers in the existing focused-check rules. Prove a nonempty live subject inventory, deliberately remove a full-mode requirement or source-only exclusion and require RED, then require GREEN for actual discovery and current-prompt extraction. Read failing CI logs per job and filter before displaying them.
