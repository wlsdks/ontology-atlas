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
relation_notes: { elements/task-scoped-agent-brief-projection: The projection is the read-side implementation this capability hands an agent; it carries the reviewed navigation receipt the compact brief cites., elements/task-navigation-evidence: "You asked me to turn imports I actually witnessed into dependencies: the scan shows agent-brief-compact.mjs importing task-navigation-evidence.mjs.", elements/vault-file-store: "You asked me to turn imports I actually witnessed into dependencies: the scan shows agent-brief-compact.mjs importing vault/documents.mjs.", capabilities/project-source-binding: "mcp/src/agent-brief-compact.mjs reads the project source receipt in `compactSourceCurrentness`, and `currentWitnessStatus` reports task evidence as current only while that receipt is verified_current, so the brief is only as good as that binding. connect_project_source mints the receipt in `connectProjectSourceTool` (mcp/src/tools/project-source.mjs) and writes it with `writeProjectSourceBinding`, and mcp/src/index.js imports that tool and dispatches it.", capabilities/vault-graph-query: "The brief has no tool of its own: it reaches an agent as the agent_brief operation of query_ontology, which mcp/src/index.js imports as `queryOntologyTool` from the graph tool module and dispatches. That module (mcp/src/tools/graph.mjs) imports `buildCompactAgentBrief` and calls it in `queryOntologyTool` with the artifact and scoped docs it compiled, so the compiled query is what the brief is built from." }
---

## Definition

Hands a coding agent the reviewed meaning relevant to the task in front of it, with the implementation anchors, constraints, evidence, and stated unknowns, so the agent starts from what a person already accepted.

## Includes
- A compact, task-scoped selection bounded by size, chosen from persisted meaning and reviewed navigation evidence.
- Separate source-currentness and meaning-assessment states, including competency receipt recovery; a usable code path does not make the recorded meaning accepted.
- Explicit refusal to return a capability when the task's claims conflict, are unsupported, or tie.

## Excludes
- Any guarantee that a host agent calls this or follows what it returns.
- Treating the returned navigation as proof of behaviour; it locates code, it does not verify it.

## Uncertainty
- Exercised through actual MCP task briefs during the 2026-10-14 self-use pass. A request to diagnose competency receipt recovery initially selected no capability, and a longer request selected Library; neither response supplied an exact implementation/test navigation plan for this work. Those observations identify missing task evidence in this vault, not a measured general matcher defect.
- After the graph-query capability and project-meaning-receipt element recorded the diagnostic responsibility and source/test coordinates, repeating the same exact task selected the graph-query capability and returned a ready navigation plan with two implementation functions and two focused tests. This was a same-session before/after observation, not an independent reader trial or a broad coding-speed measurement.