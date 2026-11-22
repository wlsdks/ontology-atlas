---
uid: 8b10e509-c918-407c-9258-0d849cc4d9f3
slug: capabilities/vault-initializer
kind: capability
title: Vault initializer
display_en: Vault initializer
display_ko: 볼트 초기화
domain: domains/agent-access
elements: []
path: cli/src/main.mjs
created_by: "agent:claude-code"
dependencies: []
relation_notes: {  }
---

Scaffolds a vault from a terminal and wires the checkout's MCP server into it, so a person or agent can start before opening the app. It is the only terminal command; every read and write after that goes through the MCP server. `cli/src/main.mjs` dispatches `init` and refuses any other name (`cli/src/main.mjs:L30-L46`).

## Includes
- Copying the locale's vault template (`--locale=ko`) into the target folder, `atlas/` by default, and creating `sources/`.
- Installing the starter skills where the coding agent starts, and writing `.mcp.json` and `.codex/config.toml` that point at the resolved MCP server (`cli/src/lib/init/run-init.mjs`, `client-config.mjs`).
- `--documents`, which copies only the wiki furniture and no node folders or skills.

## Excludes
- Distribution as an installable package; it runs from a source checkout as `node <checkout>/cli init`.
- Querying, writing or validating the graph; those are MCP tools.

## Uncertainty
- Read on 2026-11-22 at `main.mjs` and the first 60 lines of `run-init.mjs`; the template copy and the client-config writers were read at their exports only. The command was not run in this session.