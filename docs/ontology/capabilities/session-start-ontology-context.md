---
slug: capabilities/session-start-ontology-context
kind: capability
title: SessionStart Ontology Context Injection (.claude/hooks/inject-ontology-summary.sh)
domain: ai-agent-partner
elements: [.claude/hooks/inject-ontology-summary.sh, .codex/hooks/inject-ontology-summary.sh]
dependencies: [capabilities/cli-developer-entry]
relates: [capabilities/ontology-sync-skill]
---

Claude Code / Codex run a repo-local SessionStart hook that injects a compact ontology vault census into agent context.

The hook is intentionally small for token budget reasons: it reports total node count, kind distribution, and only an actionable drift warning when unresolved refs or compile issues exist. It does not preload domains, hubs, or full node tables. Agents should use focused MCP reads (`get_concept`, `find_path`, narrow `query_ontology`) only when the task needs more detail.

This replaces the older broad census plus automatic live-activity heartbeat pair. PreToolUse hooks now stay limited to the npm publish guard; live activity remains available through the explicit `ontology-atlas agent-activity` CLI when a handoff needs it.