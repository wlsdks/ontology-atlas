---
id: 924b7bb6-b4ef-4718-859e-9757ecefcff6
date: 2026-09-26
---
## 2026-09-26 — A kind change moves a referrer's entry into the list for the new kind, and names what it cannot move

**Why**: the map-edit review reproduced it on a real vault: reclassifying capabilities/companion-memories into an element left domains/human-workbench reading `capabilities: [..., elements/companion-memories]`. It resolved, so no warning fired and no screen showed it, while the dense-parent check counted an element as a capability. MCP reclassify_concept rewrote the same way.
**Prior**: builds on spec §5's relation rows (which kinds keep domains, capabilities, elements) and the 2026-08-01 bridge-node extension (a same-kind bridge is a qualified decision, not a tool's output). Overturns nothing.
**Decision**: on a kind change (app reclassify with or without a folder move, MCP reclassify_concept, cross-kind merge_concepts) an entry in a list named for a kind moves to the new kind's list when the referrer's kind may keep it (`containmentKeyFor`, mcp/src/schema.mjs, app copy under a parity contract), appended and never twice. Otherwise it stays: MCP adds an optional `warnings` sentence with the repair call, the app names it before and after Save, and the referrer's page flags entries under another kind's list. A rewrite never creates a bridge.
**Dissent**: only warn and leave every entry in place, because moving it edits a document the person did not open (the alternative the review offered). Lost because a list named for a kind admits one reading, and the app names each moved referrer before Save.
**Falsifier**: someone reports a moved entry they meant to keep in the old list, or a vault whose referrers rightly hold a node in another kind's list (an earned bridge the table does not know). Then the move becomes a proposal the person confirms.
**Owner**: stark
