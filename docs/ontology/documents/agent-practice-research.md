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

## Ontology Atlas interpretation

Ontology Atlas should not try to become a generic agent chat client. Its role is to make the local codebase ontology reliable enough that Claude Code, Codex, and MCP-connected agents can read, verify, and update it with less guessing.

The product response is captured in `AGENT_PRACTITIONER_CONCERNS`: context reliability, tool boundary, evidence loop, memory drift, and workflow fit. Each concern maps external practice into a concrete Atlas behavior: copyable ontology entrypoints, MCP setup state, graph DB proof packets, drift/maintenance findings, and a small read-check-write-sync loop before broader automation.

The source URLs are part of the shared model, not only this note. `formatAgentPractitionerConcernsChecklist()` includes them in the copyable agent payload so another Claude Code or Codex session can re-check the public basis before turning a concern into a product change.

This node is the research anchor for future agent-facing features. When adding a new Claude Code, Codex, MCP, or graph DB interaction, cite this document or the `Agent Practitioner Concerns Map` capability and explain which concern the feature improves.

## Kind classification basis checked on 2026-06-06

The ontology kind contract should be explicit enough for agents to repeat, but small enough to stay usable in a prompt. The current basis:

- Gruber's ontology-design paper defines ontology as an explicit specification of a conceptualization for knowledge sharing. Atlas translates that into a repeatable project/domain/capability/element role contract before frontmatter writes.
  <https://tomgruber.org/writing/onto-design.pdf>
- Noy and McGuinness' Ontology Development 101 guide treats ontology development as defining terms, classes, hierarchy, properties, and instances for the intended application, while warning that there is no single correct hierarchy independent of use. Atlas translates that into an evidence-backed adjacent-kind rejection step instead of pretending labels alone determine kind.
  <https://protege.stanford.edu/publications/ontology_development/ontology101.pdf>
- The W3C SKOS Primer treats semantic relationships and documentary notes as crucial concept evidence alongside labels. Atlas therefore tells Claude Code and Codex not to classify a node from its label alone.
  <https://www.w3.org/TR/skos-primer/>
- Yamaguchi, Golde, Arp, and Rieck's Code Property Graph paper combines AST, control-flow, and dependency views for source-code reasoning. Atlas applies the same evidence principle locally: `element` should cite code artifacts, while `capability` and `domain` should cite behavior, ownership, containment, or relation evidence.
  <https://www.ieee-security.org/TC/SP2014/papers/ModelingandDiscoveringVulnerabilitieswithCodePropertyGraphs.pdf>

Product consequence: `agent_brief`, UI handoff prompts, CLI result-contract validation, MCP verify, and `/ontology` Agent settings action packets now require evidence-backed kind choice. A useful agent handoff must cite source path, symbol, route, command, or MCP tool evidence and explain why the nearest adjacent kind was rejected.

The 2026-06-06 dogfood update tightened the repeatable classification prompt:

- Ask the role question before writing: project = whole product/system scope, domain = vocabulary or product boundary, capability = behavior/workflow, element = concrete implementation artifact.
- If the only evidence is a file path, start as `element`; promote to `capability` only when behavior or workflow evidence exists, and promote to `domain` only when multiple capabilities share the boundary.
- For `capability` and `element`, set or verify `domain` before writing so browse, map, and edit colors carry an ownership boundary instead of just a label color.
- Apply a high-confidence gate: write or reclassify only when another agent could repeat the same kind/domain choice from the cited evidence; otherwise keep the node in temporary review/`unknown`.
- Preserve the containment spine first (`project` -> `domain` -> `capability` -> `element`), then use `depends_on` / `relates` as impact evidence after ownership is clear.

## Code graph indexing reference checked on 2026-06-06

Atlas should learn from code-graph systems without becoming a raw AST index. The useful split is:

- deterministic code indexers answer structural questions: symbols, files, calls, imports, routes, and impact paths;
- Atlas answers meaning questions: domain ownership, capability intent, evidence, handoff, and what an agent should verify before changing code.

Public anchors:

- CodeGraph describes a local-first code-intelligence tool that parses with tree-sitter, stores symbols/edges/files in local SQLite, and exposes the graph over MCP/CLI/API. It positions the value as avoiding repeated grep/read discovery for structural questions.
  <https://colbymchenry.github.io/codegraph/getting-started/introduction/>
- The CodeGraph site lists an MIT license for the public project. That makes it reasonable to study public architecture and behavior, but Atlas should still avoid copying implementation internals without an explicit dependency decision.
  <https://colbymchenry.github.io/codegraph/>
- `tree-sitter-graph` is public under Apache-2.0/MIT and defines a DSL for graph construction from parsed source. It is a reference for deterministic extraction, not a product substitute for Atlas' human/agent-maintained meaning layer.
  <https://github.com/tree-sitter/tree-sitter-graph>
- Chinthareddy's 2026 arXiv paper compares deterministic AST-derived graph RAG with LLM-extracted knowledge graphs and reports better coverage / multi-hop grounding at lower indexing cost for deterministic AST-derived graphs.
  <https://arxiv.org/abs/2601.08773>

Product consequence: use deterministic indexing as candidate evidence and performance baseline, then require a human/agent meaning decision before writing `domain` or `capability` ontology facts. A file path alone is not a capability; it is evidence until the workflow/behavior boundary is clear.

## MCP client connection UX check on 2026-06-05

Current MCP clients separate configuration from live proof. Claude surfaces connectors in Settings / Connectors and still expects agent-side connection checks for local MCP servers. VS Code documents MCP server management, enable/disable controls, trust, cached-tool reset, and troubleshooting/debug commands. Cursor exposes MCP servers and tool toggles from settings and chat, and its CLI has an MCP list command for configured server status. Windsurf-oriented MCP docs describe a green-dot server state plus an available tool count.

Ontology Atlas should therefore avoid a single vague "connected" badge. The useful product contract is a staged proof:

1. config files point at the intended vault and codebase root;
2. the client session can see the MCP server;
3. `tools/list` reports the current 24-tool inventory including `index_project`;
4. first read-only calls such as `agent_brief`, `workspace_brief`, and `health` return healthy;
5. the UI gives copyable next actions for refresh/restart/log inspection when any stage is stale.

Sources:

- Claude Code MCP docs: <https://code.claude.com/docs/en/mcp>
- Claude Desktop connectors docs: <https://code.claude.com/docs/en/desktop>
- VS Code MCP server management docs: <https://code.visualstudio.com/docs/agent-customization/mcp-servers>
- VS Code MCP configuration reference: <https://code.visualstudio.com/docs/copilot/reference/mcp-configuration>
- Cursor MCP docs: <https://docs.cursor.com/context/model-context-protocol>
- Cursor tools docs: <https://docs.cursor.com/en/agent/tools>
- Windsurf MCP integration docs: <https://docs.windsurf.com/windsurf/cascade/mcp>
- MCP.run Windsurf client notes: <https://docs.mcp.run/mcp-clients/windsurf/>
