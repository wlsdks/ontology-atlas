---
uid: 8b10e509-c918-407c-9258-0d849cc4d9f3
slug: capabilities/cli-commands
kind: capability
title: CLI commands
display_en: CLI commands
display_ko: CLI 명령
domain: domains/agent-access
elements: [elements/cli-mcp-verify, elements/cli-vault-bootstrap]
path: cli/src/lib/cli-commands.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/vault-validation]
relation_notes: { capabilities/vault-validation: "You asked for what depends on what: the terminal validate command reports the same findings by the same codes as the agent surface.", elements/cli-vault-bootstrap: You asked for element nodes named by role under the capability that uses them; the first-time build from a repository is this role., elements/cli-mcp-verify: You asked for element nodes named by role under the capability that uses them; proving the installed server answers is this role. }
---

Carries the same authority over the vault from a terminal, so scaffolding a vault, exploring the graph, and writing to it are available without opening the app or connecting an agent. The public inventory of commands and their flags lives in `cli/README.md`.

## Includes
- Scaffolding a new vault, importing and exporting, graph queries, writes, validation, and the connection smoke check.
- A growth command that prints the plan the agent surface returns, counting the next reads recorded unknowns ask for beside the writes waiting.
- The same findings and codes the MCP surface reports, by the same names.

## Excludes
- Distribution as an installable package; the repository states it runs from a source checkout.
- Rendering the map or any visual surface.

## Uncertainty
- Read from the file list under `cli/src/commands/` and the command table in `docs/FEATURES.md`; the command count stated there was not verified against the code, and no command was run in this scan.
- The growth command was read at its header and its next-reads handling (`cli/src/commands/growth.mjs:1-14`, `:25`, `:82`, `:96-118`), which show it refusing to print "no growth candidates" while reads are waiting. Its shared response contract in `cli/src/lib/query-result-contract.mjs` was seen referenced but not opened.
