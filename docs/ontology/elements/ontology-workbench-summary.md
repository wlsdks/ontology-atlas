---
slug: elements/ontology-workbench-summary
kind: element
title: Ontology Workbench Summary
domain: views
relates: [elements/insights-query-cockpit, elements/ontology-tree-projection-summary]
---

# Ontology Workbench Summary

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the Browse / Write / Query summary for `/ontology`.

The command bar is the first workbench handoff: it opens the work overview, concept search, global search, graph DB insights, MCP setup, and Save/edit from the same ontology context. On mobile it now wraps those actions into readable labeled pills instead of collapsing them into icon-only controls or hiding later actions behind horizontal scroll. That keeps Browse, Write, Query, and agent setup discoverable before the user starts traversing the tree.

The work overview dialog still explains the three route roles: Browse scans the hierarchy and selected-node proof, Write opens the Save/edit canvas, and Query opens the graph DB proof cockpit. The mobile command bar mirrors that model directly in the visible action labels.

The Browse surface now opens with a compact meaning gate after the tree status strip: Business language -> Product capability -> Implementation proof. It names domains as the business/ownership vocabulary, capabilities as the shared behavior unit for planners, marketers, leaders, developers, and agents, and elements/semantic relations as implementation evidence. Domain/capability/element counts come from source frontmatter kind docs (`sourceKindCounts`), not relation-derived projection stubs, so a business reader sees the curated ontology size instead of an inflated file-index count. This keeps `/ontology` from reading like a source-file index while still preserving the developer + AI-agent loop as the wedge that keeps the graph fresh.

The meaning gate now includes a copyable business-to-code brief. It turns the visible counts into a markdown handoff for planning, marketing, leadership, developer, and AI-agent review: audience, business language count, product capability count, implementation proof count, and next graph actions. This makes the first `/ontology` screen operational for non-developer stakeholders instead of only explanatory.

The `/ontology` summary strip separates source concepts from browse rows. Source concepts count vault documents with `kind:` frontmatter before relation-derived projection stubs are added, while browse rows come from the tree projection and can be higher when a concept is reachable through multiple hierarchy paths. This prevents users and agents from mistaking projection rows for the canonical ontology source count.

Dogfood note: this slice used Atlas MCP to inspect the existing collaborator reader and views ontology nodes, then used CodeGraph to locate the `/ontology` browse surface before adding `OntologyMeaningGateStrip`. The focused layout test verifies the gate says source files are not the starting point, and `scripts/check-ontology-design-surface.mjs` now requires the gate marker so future design cleanups do not remove the business-to-code meaning frame.
