---
id: ddfa2f4d-9676-4dbc-a34c-29f90b46a16d
date: 2026-10-11
category: Fixed
---
When a declared dependency has no witness, the MCP server now asks for the file that imports or calls the target and the symbol it uses, instead of a file and line number, so the repair it suggests no longer goes stale when lines above it move.
