---
id: cf855633-11c6-44cf-a3b4-5d7ac244b91f
date: 2026-09-17
---
## 2026-09-17 — MCP folds into Agents as its second tab; /mcp becomes a compatibility redirect

**Why**: the owner, looking at the rail: "merge these two; split them as tabs inside." Agents and MCP are one subject for a person — the coding tools on this computer and what they reach — and two adjacent rail tiles for it cost a rail seat and a question ("which one?") on every visit.
**Prior**: overturns 2026-09-05 "MCP becomes its own destination, the rail cap moves to eight" on the destination and the cap; its own falsifier named exactly this fold. Upholds its content: the three-step share, the connectors list, the deep link, and the eight-step connection check are unchanged. Upholds 2026-08-20 (90) Agents as operational work outside settings.
**Decision**: `/agents/` carries a header tab strip (the Library's, `?tab=agents|mcp`, no name in the strip). `AgentsPage` and `McpPage` stay separate views under `src/app/agents-workspace/`; only the active one mounts. MCP's own sections move from `?tab=` to `?mcp=`. `/mcp/` redirects with `replace` into `/agents/?tab=mcp`, carrying its section and every other parameter, so `ontology-atlas://mcp?install=…` still opens the connectors dialog; the Rust deep-link address is untouched. The rail drops the MCP tile; `DESTINATION_HREF.mcp` and the `g c` shortcut point at the tab.
**Dissent**: a person who learned the rail last week loses a tile; the MCP tab count is the only rail-level sign that connectors exist. Nested section switches (workspace tab, then MCP's two sections) are one level deeper than before.
**Falsifier**: a deep link that no longer opens the connectors dialog; a person unable to find MCP within one press of Agents in the next cold walk; or the MCP sections needing their own rail seat again.
**Owner**: jinan
