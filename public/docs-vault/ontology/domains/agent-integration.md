---
uid: 0f1364a5-7d0f-4fa5-b913-454d47b33cca
slug: domains/agent-integration
kind: domain
title: AI Agent Integration
display_ko: AI 에이전트 연동
display_en: AI Agent Integration
capabilities: [capabilities/acp-runtime, capabilities/agent-work-visibility, capabilities/cli-developer-entry, capabilities/mcp-server, capabilities/vault-agent]
elements: [elements/agents-destination, elements/vault-agent-panel]
created_by: human
relation_notes: { capabilities/acp-runtime: "Agent integration owns launching the user's already-installed coding agent inside the app over ACP with an isolated config and a vault-scoped permission gate.", capabilities/agent-work-visibility: Agent integration owns the human-visible projection of current and recent AI-agent work across ACP heartbeats and vault activity logs. }
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
