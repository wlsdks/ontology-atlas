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

Current public anchors:

- Anthropic, "Building effective agents": simple, composable workflows before broad autonomy.
  <https://www.anthropic.com/research/building-effective-agents>
- OpenAI, "Running Codex safely at OpenAI": sandboxing, approvals, network policy, MCP usage, and agent-native telemetry.
  <https://openai.com/index/running-codex-safely/>
- LangChain, "State of Agent Engineering": quality, latency, security, context engineering, observability, and tracing as production constraints.
  <https://www.langchain.com/state-of-agent-engineering>
- LangChain, "How to Debug & Evaluate AI Agents with Observability": traces and evals as the feedback loop for agent failures.
  <https://www.langchain.com/blog/agent-observability-powers-agent-evaluation>
- MCP authorization and security guidance: OAuth 2.1, least-privilege scopes, secure token storage, explicit consent, and prompt/tool boundary hardening.
  <https://modelcontextprotocol.io/docs/tutorials/security/authorization>
  <https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices>

## Context Atlas interpretation

Context Atlas should not try to become a generic agent chat client. Its role is to make the local codebase ontology reliable enough that Claude Code, Codex, and MCP-connected agents can read, verify, and update it with less guessing.

The product response is captured in `AGENT_PRACTITIONER_CONCERNS`: context reliability, tool boundary, evidence loop, memory drift, and workflow fit. Each concern maps external practice into a concrete Atlas behavior: copyable ontology entrypoints, MCP setup state, graph DB proof packets, drift/maintenance findings, and a small read-check-write-sync loop before broader automation.

The source URLs are part of the shared model, not only this note. `formatAgentPractitionerConcernsChecklist()` includes them in the copyable agent payload so another Claude Code or Codex session can re-check the public basis before turning a concern into a product change.

This node is the research anchor for future agent-facing features. When adding a new Claude Code, Codex, MCP, or graph DB interaction, cite this document or the `Agent Practitioner Concerns Map` capability and explain which concern the feature improves.
