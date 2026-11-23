---
id: 8b7168ca-7489-44a9-bd0b-2fc2a0b3ad08
date: 2026-11-23
category: Changed
---
An agent connecting to Atlas's MCP server receives a much smaller tool list: each tool's output schema is advertised only at its top level, so the full tools/list response drops from about 264 KB to 86 KB. What the tools return is unchanged.
