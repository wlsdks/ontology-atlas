---
slug: elements/topology-kind-classification-contract
kind: element
title: Topology Kind Classification Contract
domain: views
relates: [capabilities/agent-config-onboarding]
---

# Topology Kind Classification Contract

The topology kind color system depends on a stable node-kind classification contract.

Codex and Claude Code should classify ontology nodes by role before writing frontmatter:

- `project`: the product or system scope root. Use sparingly; most repos have one.
- `domain`: a shared vocabulary boundary or business/product area that owns capabilities.
- `capability`: a user-visible behavior, workflow, or coherent product/system ability.
- `element`: a concrete implementation part such as a UI component, API, CLI command, script, module, schema, or file-level unit that realizes a capability.
- `unknown`: a temporary review signal when the role is unclear; agents should prefer asking, searching evidence, or using `similar_nodes` / `relation_check` before making it permanent.

This contract is intentionally small so it can be repeated in agent handoff prompts and MCP guidance without becoming a taxonomy paper. The shared color system in `src/entities/ontology-class/model/tone.ts` makes incorrect classification visible quickly: if a node receives the wrong hue, the frontmatter `kind` should be rechecked against evidence and patched.

The agent-facing handoff prompt repeats the same contract in both surfaces:

- UI / desktop copy packets built by `buildAgentHandoffPrompt`.
- MCP / CLI `agent_brief.handoffPrompt`, guarded by `cli:mcp-verify` and query result contract tests.

That means Claude Code and Codex receive the same role split before writing ontology frontmatter: choose the node kind from evidence, use `similar_nodes` to avoid duplicates, run `relation_check` before relation writes, and treat `unknown` as temporary review state rather than a permanent bucket.