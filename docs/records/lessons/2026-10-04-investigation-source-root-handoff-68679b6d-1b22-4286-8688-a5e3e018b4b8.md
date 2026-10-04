---
id: 68679b6d-1b22-4286-8688-a5e3e018b4b8
date: 2026-10-04
kind: mistake
status: reported
harness_area: acp
---
**Observed**: An actual native additional-analysis turn opened once and saved a dated result, but its MCP connection_info resolved repoRoot to the vault. The app had inspected the separate connected source folder; ACP infer_imports scanned zero files and source reads failed. The answer explicitly reported source unavailable and stayed unverified. The injected MCP environment lacked the bound source root, and the workbench heading still said whole ontology for a selected question.

**Cost**: One actual provider turn, about 41 seconds on the observed clock; exact tokens and provider cost unavailable.

**Suspected cause**: Native inspection binding and ACP MCP binding were independently correct for vault access, but the handoff did not transfer the source identity/root into the new agent session.

**Proposed change**: none — pass the explicitly previewed connected source root into the app-owned MCP launch, recreate that scoped session when its root changes, and carry the selected question label to the workbench. Probe connection_info and source reads in the actual native runtime; do not credit captured snippets as fresh agent source reads.
