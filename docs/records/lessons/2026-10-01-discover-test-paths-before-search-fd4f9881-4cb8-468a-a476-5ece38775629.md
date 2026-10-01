---
id: fd4f9881-4cb8-468a-a476-5ece38775629
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: source-search
---
**Observed**: The prompt audit searched nonexistent mcp/test.mjs and repeated broad rename matches across every MCP test. One exec returned 13,553 tokens and a truncation warning. An earlier unquoted mcp/src/server/*test.mjs failed under zsh with `no matches found` before rg ran.
**Cost**: 13,553 output tokens for one broad search; total time unknown.
**Suspected cause**: Invented test paths and a broad common identifier produced irrelevant rows; shell glob expansion ran before native search.
**Proposed change**: none. Discover test paths with `rg --files`, then search exact known files with bounded output. Quote file filters passed to rg instead of passing optional shell globs.
