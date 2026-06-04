---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
---

# Insights Query Cockpit

`src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx` renders the first-viewport query cockpit for `/ontology/insights`.

It exposes readiness, graph DB pack size, MCP call count, CLI fallback count, the `14 checks` runtime gate, live graph facts, health blockers, traversal density, run order, scan/path contracts, and the self-check + runtime health gate before the deeper charts.

The cockpit now promotes an explicit proof rail above the next-step copy. On mobile, users see `Readiness`, `Pack`, `MCP`, and `Runtime gate` as separate status cells before copying anything, so the screen communicates agent-ready graph health instead of only exposing hidden commands. The compact summary remains below the guidance row as a dense audit line that still includes CLI fallback count.

The `Next` guidance row tells users to copy the CLI pack for terminal fallback and run the runtime gate before treating scan rows as evidence, so the first viewport has an explicit action order instead of leaving users to infer it from dense proof metrics.

The page header and proof band keep their explanatory copy visible instead of hiding it behind info buttons only. The first screen names Insights as a query surface for scans, paths, health, and handoff, then states that the proof band verifies whether Claude Code, Codex, or another AI agent can traverse the graph through MCP / CLI calls.

The first evidence row is explicitly ordered as `01 Plan`, `02 Scan`, `03 Follow-up`, and `04 Proof`. That makes the local markdown graph read as an executable query surface: plan costly traversal, scan nodes/edges/domains/paths, narrow raw rows with follow-up queries, then close proof with relation checks, path completeness, and the sync gate.

Focused node handoffs use the same proof contract. `/ontology/insights?node=...` resolves both graph ids such as `capability:agent-graph-readiness` and canonical vault slugs such as `capabilities/agent-graph-readiness`, so Browse and Builder links land on the same concept. The focused proof card copies `node_profile`, incoming `blast_radius`, incoming/outgoing `match_edges`, `query_plan(all_paths)`, bounded `all_paths`, `relation_check`, `health`, shell-safe CLI fallbacks, scan/path evidence rules, and the post-change sync gate for that exact vault slug.

The graph DB pack appears only in this first-viewport cockpit. The lower agent recipes panel stays focused on handoff, result contracts, traversal strategies, and first-run order, so `/ontology/insights` has one obvious place to copy and run graph DB-style scans instead of repeating the same pack twice.

The copied CLI pack starts with `agent-brief --verify-fallbacks --json` and then `pnpm dogfood:graph-db`, so the visible gate and the pasted runbook both prove setup health and replay the same local graph DB scan contracts before users trust raw rows. The visible runtime proof names `health --json`, focused `blast_radius`, scan follow-ups, public relation-name parity, `pattern_walk` / `project_map` containment, bounded `all_paths` completeness, and `relation_check`, so a user can run verification immediately without copying the whole query pack.

Design contract: the insights query surface follows `docs/DESIGN-SYSTEM.md` no-glow rules. Row hover states use border/background transitions only, not shadow-based glow, so query evidence reads as a compact workbench rather than a decorative dashboard.
