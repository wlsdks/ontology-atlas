---
id: f69b42f6-9f65-467a-b8d0-151ce605d711
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: performance-audit
---
**Observed**: During a read-only performance audit, batching complete source files and duplicated MCP content/structuredContent in one tool result produced a truncated 17,928-token response. Relevant excerpts then needed another read. The `list_concepts` result was also printed as a whole result instead of selecting its structured fields.
**Cost**: At least one repeated targeted read; exact wall time and total tokens unknown.
**Suspected cause**: A per-command output cap does not constrain the combined output of a multi-call orchestration, and MCP content can repeat structuredContent.
**Proposed change**: none. Use targeted source ranges and print only the required structured fields during exploratory audits; keep each combined tool response small enough to inspect.
