---
uid: 0f1364a5-7d0f-4fa5-b913-454d47b33cca
slug: domains/agent-integration
kind: domain
title: AI Agent Integration
display_ko: AI 에이전트 연동
display_en: AI Agent Integration
capabilities: [capabilities/acp-runtime, capabilities/agent-work-visibility, capabilities/ai-analysis-review, capabilities/cli-developer-entry, capabilities/mcp-connectors, capabilities/mcp-server, capabilities/ontology-dna-presentation, capabilities/vault-agent]
elements: [elements/agents-destination, elements/concurrent-ledger-conflict-resolver, elements/installed-mcp-identity-gate, elements/vault-agent-panel]
created_by: human
relation_notes: { capabilities/acp-runtime: "Agent integration owns launching the user's already-installed coding agent inside the app over ACP with an isolated config and a vault-scoped permission gate.", capabilities/agent-work-visibility: Agent integration owns the human-visible projection of current and recent AI-agent work across ACP heartbeats and vault activity logs., capabilities/ai-analysis-review: Agent integration owns the shared evidence and review history through which people and successor agents judge ACP analysis results., capabilities/cli-developer-entry: "Developers and agents reach the same vault reads, writes, and connection diagnostics from a terminal when no app or MCP client is attached.", capabilities/mcp-connectors: "An external MCP server reaches the coding agent only as a descriptor handed into the ACP handshake, so the attachment rules and the runtime narrowing live with the agent surfaces.", capabilities/mcp-server: The stdio JSON-RPC surface is how an AI coding agent reads and safely changes the same Markdown files a person reads., capabilities/ontology-dna-presentation: "Its guided scenes are qualified from the Atlas read tools one completed coding-agent turn actually called, so it exists only where the app runs that conversation.", capabilities/vault-agent: The connect flow and the in-app provider-neutral agent loop are how a person attaches an agent to this folder and checks the reads it cites., elements/agents-destination: "The /agents/ screen gathers receiving, installing, attaching, repairing, and starting a conversation with a coding tool after three separate addresses held that one task.", elements/concurrent-ledger-conflict-resolver: "Several agents working the same folder in parallel worktrees prepend records to the append-only ledgers at the same moment, so the fail-closed merge that keeps both records is part of letting agents share one vault.", elements/installed-mcp-identity-gate: The installed MCP identity gate is the concrete local delivery control that keeps the agent-integration domain bound to the exact app bundle and source evidence it ships., elements/vault-agent-panel: "The panel is where a person judges an agent's actual tool reads, audit logs, timeouts, and mandatory-read failures before trusting its answer." }
---

## Definition
Surfaces enabling AI coding agents (Claude Code, Codex, Cursor) and developers to read and write the same ontology vault as humans: MCP servers, terminal CLI, in-app connect flow, and the ACP executor layer that directly launches coding agents already installed by the user.

## Evidence
- README.md: "Your agent reads and maintains it over MCP... one button writes your agent's config and proves the connection."
- mcp/src/index.js · mcp/src/tool-inventory.mjs: coupled boundary deriving `tools/list` and
  full/read-only initialize inventory from active registry
- cli/src/commands/agent-brief.mjs: passing `--project` as explicit project selector matching MCP `agent_brief.project`

## Inclusion / Exclusion
- Included: MCP read/write tools (`mcp/`) advertising current list at runtime, local CLI,
  in-app connect button, client config writing and `mcp-verify` connection proof,
  ACP executor detection and launching with isolated settings within the app
  (`capabilities/acp-runtime`)
- Excluded: the graph schema itself (that belongs to the graph-modeling domain)

## Project Meaning Handover

`finalize_project_meaning` bundles the competency answer for human-readable project Markdown into body digest and graph/source provenance after graph write, vault validation, and project compile.
the sidecar does not store raw answers, raw witnesses, or private source root/remote.
Subsequently, the new MCP process's `agent_brief.meaningAssessment` re-validates against the current Markdown and inventory; if source currentness cannot be confirmed, it closes as `review_required` even if a stored receipt exists.

The CLI `agent-brief --project <slug>` is not an option to merge results from multiple projects, but a selector that explicitly specifies one project containment tree to read the same MCP `agent_brief`.

## Confidence
high (0.9): MCP registry and CLI integration test directly verify the current contract
