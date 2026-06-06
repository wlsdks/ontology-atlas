---
slug: elements/ontology-workbench-summary
kind: element
title: Ontology Workbench Summary
domain: views
relates: [elements/insights-query-cockpit, elements/ontology-tree-projection-summary]
---

# Ontology Workbench Summary

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the Browse / Write / Query summary for `/ontology`.

The command bar is the first workbench handoff: it opens concept search, global search, graph DB insights, MCP setup, Save/edit, and the work overview from the same ontology context. It now starts with a plain task sentence instead of only a product label and counts: selecting a concept opens meaning, relations, and implementation proof. The work overview button is a secondary action, not the primary visual accent, so the top of `/ontology` reads as a browse task before it reads as navigation chrome.

The command bar no longer sits inside a large rounded container. It behaves like a compact page header: the task sentence and graph counts stay on the left, Search is the first visible command, and secondary actions keep their labels without competing as equal feature cards. The tree status strip also uses a quiet divider row instead of a second boxed panel. This removes two stacked boxes from the first viewport while keeping the same Browse / Write / Query / Agent handoffs available.

The work overview dialog still explains the three route roles: Browse scans the hierarchy and selected-node proof, Write opens the Save/edit canvas, and Query opens the graph DB proof cockpit. The mobile command bar mirrors that model directly in the visible action labels.

The Browse surface now opens with a compact concept-selection summary after the tree status strip: Business language -> Product capability -> Implementation proof. It avoids visible internal labels such as "Meaning Gate", "Reader lanes", and "Wedge" because those terms made the first screen feel like a generated strategy card instead of a workbench. The visible task is simpler: choose a concept, understand its domain/capability/element role, then continue with the same slug in Save/edit or Insights.

Domain/capability/element counts come from source frontmatter kind docs (`sourceKindCounts`), not relation-derived projection stubs, so a business reader sees the curated ontology size instead of an inflated file-index count. This keeps `/ontology` from reading like a source-file index while still preserving the developer + AI-agent loop as the maintenance engine that keeps the graph fresh.

The summary still includes a copyable business-to-code brief. It turns the counts into a markdown handoff for planning, marketing, leadership, developer, and AI-agent review: audience, business language count, product capability count, implementation proof count, core domain lanes, reader lanes, reader handoffs, and next graph actions. Those reader lanes remain useful in the copied handoff, but they no longer occupy first-screen chrome before the user has chosen a concept.

The summary surfaces the strongest domain lanes by capability count as a small "start with a domain" row. This keeps the product core visible before a user opens the tree: stakeholders can see which business / ownership vocabulary areas carry the most behavior, while developers and agents can still trace each lane down to capability and implementation evidence. Each lane is a direct `/ontology?node=<domain>` handoff, so the first screen moves from overview into the exact domain node without a separate search step.

The `/ontology` summary strip separates source concepts from browse rows. Source concepts count vault documents with `kind:` frontmatter before relation-derived projection stubs are added, while browse rows come from the tree projection and can be higher when a concept is reachable through multiple hierarchy paths. This prevents users and agents from mistaking projection rows for the canonical ontology source count.

Dogfood note: this slice used Atlas MCP to inspect this element, then used CodeGraph to locate `OntologyMeaningGateStrip` and the `/ontology` command bar before simplifying the top area. The focused layout test now verifies the visible surface does not show "Meaning Gate", "Reader lanes", or "Wedge", while the copied brief still preserves the business-to-code handoff for agents and meeting notes. The follow-up header pass used the same element to decide that the remaining issue was not missing functionality but competing visual weight from stacked boxes.
