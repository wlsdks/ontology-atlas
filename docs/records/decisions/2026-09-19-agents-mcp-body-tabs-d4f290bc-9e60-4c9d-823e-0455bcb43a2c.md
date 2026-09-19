---
id: d4f290bc-9e60-4c9d-823e-0455bcb43a2c
date: 2026-09-19
---
## 2026-09-19 — Agents and MCP are two tabs of the page's own strip, not a stack and not a header band

**Why**: the owner, on the Agents page that had carried MCP as its last section since 2026-09-18: *"I don't want agents and MCP on one screen with a scroll — split them into tabs; pick one and see that one."* And on its opening: *"so much useless text — tooltips if really needed."* Three paragraphs stood between the title and the first tool; MCP stood two screens below a list a person reaching for connectors was not looking at.
**Prior**: overturns 2026-09-18 "MCP is a section of the Agents page, not a header tab" on the stack, keeping its destination, the `?tab=mcp` address, the `/mcp/` redirect with `install`, and its objection to a header band. Upholds 2026-09-17 "MCP folds into Agents"; that record's strip was the header's, this one's is the body's.
**Decision**: `AgentsPage` draws one lede line, then a `TabBar` in the body under the title (`agents` · `mcp`, the MCP tab wearing the switched-on connector count) and only the selected panel; `McpPage` is the MCP tab's body with no heading; the app layer owns the one connectors store. The tool list's intro fold, its "see the MCP section below" sentence and its two paragraphs leave the page: the guard fact is one sentence naming its tools, the credential-link disclosure one hint beside it.
**Dissent**: connectors now take a press instead of a scroll, and the strip is a second navigation tier inside a destination.
**Falsifier**: `/mcp/?tab=connectors&install=…` not opening the connectors dialog; the credential-link disclosure absent from the Agents tab's DOM; a header strip returning; a cold walker unable to find MCP within one press of Agents.
**Owner**: jinan
