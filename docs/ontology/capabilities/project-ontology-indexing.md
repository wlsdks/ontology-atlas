---
slug: capabilities/project-ontology-indexing
kind: capability
title: Project Ontology Indexing
domain: ai-agent-partner
elements: [cli/src/commands/index.mjs, cli/src/integration.test.mjs, elements/operations-nav, mcp/src/index.js, mcp/src/integration.test.mjs]
relates: [capabilities/cli-developer-entry, capabilities/mcp-server]
---

# Project Ontology Indexing

Long-running project ontology indexing entrypoint. `index_project` gives AI agents one read-only checkpoint that combines repo structure analysis, import-edge indexing, and vault validation before any write. The CLI pair is `ontology-atlas index`: default mode prints a side-effect-free plan, and `--apply` delegates to the existing bootstrap writer pipeline.

This capability exists because large projects need a resumable analyze -> index -> validate -> review -> apply loop, not only a cold-start bootstrap command.

The Ontology Atlas app settings Agent tab surfaces this capability as a practical first-call checkpoint. It shows the direct MCP call and the local CLI plan command together, while keeping `--apply` as an explicit post-review write action.
