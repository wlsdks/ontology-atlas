---
slug: elements/insights-orphan-repair-packet
kind: element
title: Insights Orphan Repair Packet
domain: views
path: src/views/ontology-insights/lib/orphan-node-actions.ts
relates:
  - capabilities/collaborator-reader-brief
  - elements/insights-collaborator-brief
---

`src/views/ontology-insights/lib/orphan-node-actions.ts` turns each `/ontology/insights` orphan or open ownership question into actionable links and a copyable repair packet.

The row actions keep the same selected node across the ontology tree, topology health mode, and builder focus view. The packet adds the read-first agent loop: inspect the node, choose an owner, run `ontology-atlas relation-check <owner-slug> <slug> contains [vault]`, then run `ontology-atlas health [vault] --limit 5` after saving. Both the human repair packet and the focused MCP repair packet now append the shared post-change sync gate (the 14-check runtime graph DB gate plus `health`, `cycles`, `growth_plan`, `maintenance_plan`, `validate_vault` and CLI fallbacks), so orphan ownership repair uses the same handoff language as topology health, builder relation writes, and Claude Code/Codex agent setup. A separate MCP repair copy action exports the matching `node_profile`, `relation_check`, and `health` payloads before that sync gate, keeping the human repair brief distinct from the small preflight bundle Claude Code or Codex should run before writing ownership frontmatter.

This keeps stakeholder review practical without inventing a second workflow: planners, marketers, domain owners, and decision-makers can flag the ownership question in plain language, while Claude Code or Codex receives exact local graph commands before any frontmatter write.
