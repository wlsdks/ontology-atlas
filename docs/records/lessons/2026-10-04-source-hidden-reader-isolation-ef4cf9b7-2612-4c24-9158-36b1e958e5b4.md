---
id: ef4cf9b7-2612-4c24-9158-36b1e958e5b4
date: 2026-10-04
kind: process
status: reported
harness_area: ontology-evaluation
---
**Observed**: The first Codex ACP `read-only` reader still had direct file tools; its first connection-info result leaked the repository root because the proxy redacted object fields but did not parse JSON embedded in MCP text content. The attempt read only the copied vault before it was stopped; no source tool call was made. The first MCP concept read was rejected until `connection_info`. A separate non-TTY ACP controller closed stdin after its initial build turn, so its planned follow-up could not be sent in-session.
**Cost**: One contaminated reader attempt and one interrupted continuation; exact token cost unavailable. The subsequent strict reader used an explicit MCP allowlist and tool disable.
**Suspected cause**: Provider `read-only` mode restricted writes rather than reads. Proxy redaction/filtering did not cover JSON encoded in text; the controller treated closed stdin as end-of-turn while expecting another message.
**Proposed change**: script, preflight the exact roots, parse-and-redact structured JSON text, expose only the tools required for the lane, and keep the ACP control channel open when later turns depend on same-session state. The shared checkout remains read-only in this trial; any durable harness change belongs to the owner’s later `/harness-retro` pass.
