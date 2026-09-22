---
uid: baf21e96-9c09-4845-ad57-c2f470412d28
slug: capabilities/task-agent-brief
kind: capability
title: Task agent brief
display_en: Task agent brief
display_ko: 작업 브리핑
domain: domains/agent-access
elements: [elements/task-navigation-evidence, elements/task-scoped-agent-brief-projection]
path: mcp/src/agent-brief-compact.mjs
created_by: "agent:claude-code"
dependencies: [capabilities/project-source-binding, capabilities/vault-graph-query, elements/task-navigation-evidence, elements/vault-file-store]
relation_notes: { elements/task-scoped-agent-brief-projection: The projection is the read-side implementation this capability hands an agent; it carries the reviewed navigation receipt the compact brief cites., elements/task-navigation-evidence: "You asked me to turn imports I actually witnessed into dependencies: the scan shows agent-brief-compact.mjs importing task-navigation-evidence.mjs.", elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows agent-brief-compact.mjs importing vault.mjs.", capabilities/project-source-binding: "mcp/src/agent-brief-compact.mjs:474-481 reads the project source receipt and :541 withholds navigation until its status is verified_current, so the brief is only as good as that binding. connect_project_source mints the receipt at mcp/src/tools/project-source.mjs:136 and writes it at :187, and the server registers that tool at mcp/src/index.js:110.", capabilities/vault-graph-query: "The brief has no tool of its own: it reaches an agent as the agent_brief operation of query_ontology, which mcp/src/index.js:99 registers from the graph tool module. That module imports buildCompactAgentBrief at mcp/src/tools/graph.mjs:11 and calls it at :345 with the artifact and scoped docs it compiled, so the compiled query is what the brief is built from." }
---

Hands a coding agent the reviewed meaning relevant to the task in front of it, with the implementation anchors, constraints, evidence, and stated unknowns, so the agent starts from what a person already accepted.

## Includes
- A compact, task-scoped selection bounded by size, chosen from persisted meaning and reviewed navigation evidence.
- Explicit refusal to return a capability when the task's claims conflict, are unsupported, or tie.

## Excludes
- Any guarantee that a host agent calls this or follows what it returns.
- Treating the returned navigation as proof of behaviour; it locates code, it does not verify it.

## Uncertainty
- Read from `mcp/src/agent-brief-compact.mjs` by name and from the tool's own description of the compact brief. No brief was requested in this scan, and whether this vault holds enough meaning to produce a useful one is untested.