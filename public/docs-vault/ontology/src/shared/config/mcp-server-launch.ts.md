---
slug: src/shared/config/mcp-server-launch.ts
kind: element
title: MCP Server Launch Contract
domain: ai-agent-partner
---

The single place that answers "how does an agent start this MCP server here?". It replaced the old npm availability gate on 2026-07-27, when npm publishing was retired (`docs/DECISIONS.md`): that gate asked "is it published?" and the answer was permanently no, so every one-click path behind it stayed asleep. This one asks whether the current surface knows a way to launch the server — the installed app does (a compiled binary inside its own bundle), a browser does not — and that answer drives the connect button, the config snippets, and the written `.mcp.json` / `.codex/config.toml`. Two channels exist and there is no third: app-bundled and source-checkout.
