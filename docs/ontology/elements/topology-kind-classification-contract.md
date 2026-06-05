---
slug: elements/topology-kind-classification-contract
kind: element
title: Topology Kind Classification Contract
domain: views
relates: [capabilities/agent-config-onboarding]
---

# Topology Kind Classification Contract

The topology kind color system depends on a stable node-kind classification contract.

Codex and Claude Code should classify ontology nodes by role before writing frontmatter. Use this evidence order:

1. Do not classify from the label alone. Treat `kind` as an evidence-backed role in the shared conceptualization.
2. `project`: the top-level product or system scope root. Use sparingly; most repositories should have one project node.
3. `domain`: a shared vocabulary boundary, ownership area, or product/business/technical area that owns capabilities.
4. `capability`: a user-visible behavior, workflow, or coherent product/system ability.
5. `element`: a concrete implementation part such as a UI component, API, CLI command, MCP tool, route, script, module, schema, or file-level unit that realizes a capability.
6. `unknown`: a temporary review signal when the role is unclear. Agents should prefer asking, searching evidence, or using `similar_nodes` / `node_profile` / `relation_check` before making it permanent.

Before writing frontmatter, an agent should report the source path, symbol, route, command, or MCP tool evidence and state why the nearest adjacent kind was rejected. A candidate `capability` should explain why it is not merely an `element`; a candidate `domain` should explain why it is broader than one workflow; a candidate `element` should cite concrete implementation evidence.

This mirrors the ontology-learning split used in public ontology literature: concepts are identified, organized into taxonomy or containment structure, and then connected by non-taxonomic relations. Atlas keeps the contract intentionally small so it can be repeated in agent handoff prompts and MCP guidance without becoming a taxonomy paper.

The shared color system in `src/entities/ontology-class/model/tone.ts` makes incorrect classification visible quickly: if a node receives the wrong hue, the frontmatter `kind` should be rechecked against evidence and patched.

The agent-facing handoff prompt repeats the same contract in both surfaces:

- UI / desktop copy packets built by `buildAgentHandoffPrompt`.
- MCP / CLI `agent_brief.handoffPrompt`, guarded by `cli:mcp-verify` and query result contract tests.
- `/ontology` Agent settings action packets for project reanalysis, update sweep, and selected concept strengthening.

That means Claude Code and Codex receive the same role split before writing ontology frontmatter: choose the node kind from evidence, use `similar_nodes` to avoid duplicates, run `relation_check` before relation writes, and treat `unknown` as temporary review state rather than a permanent bucket.
