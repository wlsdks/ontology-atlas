---
slug: documents/agent-practice-research
kind: document
title: Agent Practice Research Notes
describes: [capabilities/agent-graph-readiness, capabilities/agent-practitioner-concerns-map, capabilities/mcp-conflict-guard, capabilities/mcp-server]
---

This document keeps external agent-engineering practice attached to the product ontology instead of leaving it only in chat history.

## Sources checked on 2026-06-05

- Anthropic Claude Code docs and help: context windows fill quickly; `CLAUDE.md` is project memory; subagents run with isolated context; MCP connects tools while result size and tool context must stay bounded.
- OpenAI Codex developer/use-case docs and product updates: Codex can operate local apps through Computer Use, follow durable goals, use AGENTS.md-style workspace guidance, and create repeatable workflows across code and desktop surfaces.
- LangChain State of Agent Engineering and observability guidance: production agent teams need tracing, evaluation, durable state, human-in-the-loop review, and step-level tool evidence.
- Model Context Protocol security best practices and public security guidance: MCP integrations need explicit consent, progressive least-privilege scopes, bounded tool access, and audit clarity.

## Context Atlas interpretation

Context Atlas should not try to become a generic agent chat client. Its role is to make the local codebase ontology reliable enough that Claude Code, Codex, and MCP-connected agents can read, verify, and update it with less guessing.

The product response is captured in `AGENT_PRACTITIONER_CONCERNS`: context reliability, tool boundary, evidence loop, memory drift, and workflow fit. Each concern maps external practice into a concrete Atlas behavior: copyable ontology entrypoints, MCP setup state, graph DB proof packets, drift/maintenance findings, and a small read-check-write-sync loop before broader automation.

This node is the research anchor for future agent-facing features. When adding a new Claude Code, Codex, MCP, or graph DB interaction, cite this document or the `Agent Practitioner Concerns Map` capability and explain which concern the feature improves.