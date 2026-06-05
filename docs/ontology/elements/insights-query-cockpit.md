---
slug: elements/insights-query-cockpit
kind: element
title: Insights Query Cockpit
domain: views
capabilities: [capabilities/agent-graph-readiness, capabilities/agent-practitioner-concerns-map]
---

# Insights Query Cockpit

`src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx` renders the first-viewport query cockpit for `/ontology/insights`. `src/views/ontology-insights/ui/parts/InsightsInfoButton.tsx` provides the shared explanation affordance for the page header, proof band, cockpit header, and proof metric cards.

It exposes readiness, graph DB pack size, MCP call count, CLI fallback count, the `14 checks` runtime gate, live graph facts, health blockers, traversal density, run order, scan/path contracts, and the self-check + runtime health gate before the deeper charts.

The cockpit now promotes an explicit proof rail directly after the copy actions. On mobile, users see `Readiness`, `Pack`, `MCP`, `CLI`, and `Runtime` as one compact row before the section tabs, so the screen communicates both MCP and terminal fallback paths without pushing the graph DB controls below the first viewport.

The cockpit keeps a compact run primer for `Self check` -> `Runtime gate` -> `Plan scans`, but it now sits after the proof rail and tabs. That makes the first mobile viewport prioritize the action and validation controls first, while still giving Claude Code/Codex the same visible execution order before the detailed status panel.

The `Status`, `Run order`, and `Result criteria` tabs now sit directly under the proof rail. That keeps the graph DB execution path reachable in the first mobile viewport while the compact summary moves to wider screens only.

The `Next` guidance row tells users to copy the CLI pack for terminal fallback and run the runtime gate before treating scan rows as evidence, so the first viewport has an explicit action order instead of leaving users to infer it from dense proof metrics.

The cockpit also surfaces the `agent-practitioner-concerns-map` as a small decision-check rail (`Context`, `Tools`, `Evidence`, `Drift`, `Workflow`) directly after the next-step row. This gives Claude Code/Codex-facing features a concrete preflight lens for context reliability, MCP/tool boundaries, runnable proof, stale-memory drift, and small workflow loops before scan rows are treated as evidence.

The page header and proof band keep their explanatory copy visible instead of hiding it behind info buttons only. The first screen now names the route as a `Graph proof cockpit` / `그래프 검증 cockpit`, then immediately shows proof chips for the local graph, MCP + CLI handoff, and runtime gate. That makes `/ontology/insights` read as the graph-DB validation surface before Claude Code, Codex, or a terminal agent trusts scan rows, while the proof band still verifies whether an AI agent can traverse the graph through MCP / CLI calls. Explanation affordances use a help icon instead of a literal `!`, so contextual guidance reads as optional help rather than a warning state.

The first evidence row is expanded by default and explicitly ordered as `01 Plan`, `02 Scan`, `03 Follow-up`, and `04 Proof`. Its summary keeps the same 32px mobile hit target as the other cockpit actions. That makes the local markdown graph read as an executable query surface: plan costly traversal, scan nodes/edges/domains/paths, narrow raw rows with follow-up queries, then close proof with relation checks, path completeness, and the sync gate.

Focused node handoffs use the same proof contract. `/ontology/insights?node=...` resolves both graph ids such as `capability:agent-graph-readiness` and canonical vault slugs such as `capabilities/agent-graph-readiness`, so Browse and Builder links land on the same concept. The focused proof card copies `node_profile`, incoming `blast_radius`, incoming/outgoing `match_edges`, `query_plan(all_paths)`, bounded `all_paths`, `relation_check`, `health`, shell-safe CLI fallbacks, scan/path evidence rules, and the post-change sync gate for that exact vault slug.

When a focused node is present, the proof tab now shows a first-screen focused shortcut rail before the global query cockpit. The rail names the target concept, links directly to the focused proof card, and keeps Browse / Save-edit actions at 32px touch targets, so project-card `Proof · N` and builder proof links do not make users scroll through the general graph DB cockpit before reaching the exact node evidence.

The graph DB pack appears only in this first-viewport cockpit. The lower agent recipes panel stays focused on handoff, result contracts, traversal strategies, and first-run order, so `/ontology/insights` has one obvious place to copy and run graph DB-style scans instead of repeating the same pack twice.

The copied CLI pack starts with `agent-brief --verify-fallbacks --json` and then `pnpm dogfood:graph-db`, so the visible gate and the pasted runbook both prove setup health and replay the same local graph DB scan contracts before users trust raw rows. The visible runtime proof names `health --json`, focused `blast_radius`, scan follow-ups, public relation-name parity, `pattern_walk` / `project_map` containment, bounded `all_paths` completeness, and `relation_check`, so a user can run verification immediately without copying the whole query pack.

Design contract: the insights query surface follows `docs/DESIGN-SYSTEM.md` no-glow rules. Row hover states use border/background transitions only, not shadow-based glow, so query evidence reads as a compact workbench rather than a decorative dashboard.

Touch target contract: the graph DB proof cockpit keeps explanation and copy actions at a minimum 32px hit target even in compact mobile rows. `InsightsInfoButton` uses a fixed 32px help affordance, and compact `CopyAgentTextButton` variants use `min-h-8`, so Claude Code/Codex handoff actions remain tappable without widening the page or hiding query evidence behind tiny controls.
