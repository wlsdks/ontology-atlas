---
id: 2a38a201-caee-41b4-bd48-e61e237aa6b6
date: 2026-10-05
kind: tool-efficiency
status: reported
harness_area: agent-tools
---
**Observed**: The first functions.exec discovery printed complete tool descriptions for names matching list_kinds, list_concepts, get_concept and connection_info. Combined output reported 60,805 original tokens and was truncated, hiding the short repository reads batched with it.
**Cost**: 60,805 output tokens before truncation for the combined call; excess attribution and wall time unknown.
**Suspected cause**: ALL_TOOLS entries contain embedded tool declarations and lengthy shared instructions. Printing whole entries expands far beyond a name inventory.
**Proposed change**: none. Discover tool names with a name-only projection, then extract the declaration for only the selected tool. Keep unrelated source reads separate from potentially large metadata output.
