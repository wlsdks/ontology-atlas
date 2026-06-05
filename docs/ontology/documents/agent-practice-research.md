---
slug: documents/agent-practice-research
kind: document
title: Agent Practice Research Notes
describes: [capabilities/agent-graph-readiness, capabilities/agent-practitioner-concerns-map, capabilities/mcp-conflict-guard, capabilities/mcp-server]
---

This document keeps external agent-engineering practice attached to the product ontology instead of leaving it only in chat history.

## Sources checked on 2026-06-05

- Anthropic agent engineering guidance: start with simple, composable workflows; use broader agents when the task is open-ended and needs environmental feedback.
- OpenAI Codex operating guidance: durable workspace instructions, issue-shaped prompts, repository paths, and repeatable task queues make coding agents more reliable than chat-only context.
- OpenAI Agents SDK MCP guidance: MCP servers can be stdio, streamable HTTP, or hosted; sensitive tool calls can require approval and human-in-the-loop resumption.
- Cognition agent verification writing: async agent work needs end-to-end proof artifacts, not only a clean diff or a textual claim.
- LangChain long-term memory guidance: semantic, episodic, and procedural memory need explicit storage and retrieval paths so agents can separate facts, past work, and reusable skills.
- Model Context Protocol security best practices and public security guidance: MCP integrations need explicit consent, progressive least-privilege scopes, bounded tool access, and audit clarity.

Current public anchors:

- Anthropic, "Building effective agents": simple, composable workflows before broad autonomy.
  <https://www.anthropic.com/engineering/building-effective-agents>
- OpenAI, "How OpenAI uses Codex": persistent `AGENTS.md`, issue-shaped prompts, file paths, task queues, and best-of-N review patterns.
  <https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf>
- OpenAI Agents SDK MCP guide: hosted, streamable HTTP, and stdio MCP connections plus optional approval flow.
  <https://openai.github.io/openai-agents-js/guides/mcp/>
- Cognition, "Verifying Agentic Development at Scale": end-to-end testing artifacts, labeled screenshots, videos, and pass/fail assertions for async coding agents.
  <https://cognition.ai/blog/testing-development>
- LangChain Deep Agents memory docs: semantic, episodic, and procedural memory as separate durable surfaces.
  <https://docs.langchain.com/oss/python/deepagents/memory>
- MCP authorization and security guidance: OAuth 2.1, least-privilege scopes, secure token storage, explicit consent, and prompt/tool boundary hardening.
  <https://modelcontextprotocol.io/docs/tutorials/security/authorization>
  <https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices>

## Context Atlas interpretation

Context Atlas should not try to become a generic agent chat client. Its role is to make the local codebase ontology reliable enough that Claude Code, Codex, and MCP-connected agents can read, verify, and update it with less guessing.

The product response is captured in `AGENT_PRACTITIONER_CONCERNS`: context reliability, tool boundary, evidence loop, memory drift, and workflow fit. Each concern maps external practice into a concrete Atlas behavior: copyable ontology entrypoints, MCP setup state, graph DB proof packets, drift/maintenance findings, and a small read-check-write-sync loop before broader automation.

The source URLs are part of the shared model, not only this note. `formatAgentPractitionerConcernsChecklist()` includes them in the copyable agent payload so another Claude Code or Codex session can re-check the public basis before turning a concern into a product change.

This node is the research anchor for future agent-facing features. When adding a new Claude Code, Codex, MCP, or graph DB interaction, cite this document or the `Agent Practitioner Concerns Map` capability and explain which concern the feature improves.
