---
slug: elements/topology-kind-classification-contract
kind: element
title: Topology Kind Classification Contract
domain: views
relates: [capabilities/agent-config-onboarding]
---

The topology kind color system depends on a stable node-kind classification contract.

Codex and Claude Code should classify ontology nodes by role before writing frontmatter:

- `domain`: a shared vocabulary boundary or business/product area that owns capabilities.
- `capability`: a user-visible behavior, workflow, or coherent product/system ability.
- `element`: a concrete implementation part such as a UI component, API, CLI command, script, module, schema, or file-level unit that realizes a capability.
- `unknown`: a temporary review signal when the role is unclear; agents should prefer asking, searching evidence, or using `similar_nodes` / `relation_check` before making it permanent.

This contract is intentionally small so it can be repeated in agent handoff prompts and MCP guidance without becoming a taxonomy paper. The topology colors make incorrect classification visible quickly, and the vault graph should be patched when a node was colored into the wrong role.

The agent-facing handoff prompt now repeats the same contract in both surfaces:

- UI / desktop copy packets built by `buildAgentHandoffPrompt`.
- MCP / CLI `agent_brief.handoffPrompt`, guarded by `cli:mcp-verify` and query result contract tests.

That means Claude Code and Codex receive the same role split before writing ontology frontmatter: choose the node kind from evidence, use `similar_nodes` to avoid duplicates, run `relation_check` before relation writes, and treat `unknown` as temporary review state rather than a permanent bucket.
