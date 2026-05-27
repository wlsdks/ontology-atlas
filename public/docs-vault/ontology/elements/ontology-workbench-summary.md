---
slug: elements/ontology-workbench-summary
kind: element
title: Ontology Workbench Summary
domain: views
relates: [elements/ontology-graph-proof-rail, elements/ontology-tree-projection-summary]
---

`src/views/ontology-view/ui/OntologyViewPage.tsx` renders the compact Browse / Write / Query summary at the top of `/ontology`.

It frames the tree as one browse mode inside the graph workbench, then hands off to Builder for frontmatter-backed writes and Insights for graph DB-style query validation. The first viewport also keeps a separate role strip for Tree role / Graph refs / Evidence so the hierarchy view does not pretend to be the whole ontology system.

The page header keeps those handoffs visible before the summary strip: search stays scoped to browse, the global search button keeps cross-surface lookup discoverable, `Insights` opens the graph DB query pack, and the primary `Builder` action opens the frontmatter-backed write canvas. The header icons use lucide symbols rather than one-off SVGs so the browse surface follows the same control language as the Builder and Insights pages.

The local frontmatter compile proof below the role strip is intentionally compact: it states that the current graph was compiled from the selected vault, exposes node/relation counts and a Builder CTA, and keeps the kind census collapsed. It no longer renders the full kind-by-kind node list before the actual tree, so `/ontology` starts as a browse surface rather than a document inventory dump.

The Korean surface now labels that proof as `프론트매터 그래프`, `노드 · 관계`, and `종류별 요약` instead of repeating English body captions such as `VAULT FRONTMATTER ONTOLOGY` or `KIND CENSUS`. This keeps the page header hierarchy intact while still proving that the browse tree is backed by a compiled local graph.

This element is the `/ontology` browse counterpart to the Builder write summary and Insights query cockpit: Browse shows hierarchy and selection, Write mutates frontmatter, Query proves graph state through scans and paths.

Before a node is selected, the tree area now shows a compact selection hint that names the same ordered Browse / Write / Query outcome: `01 Browse` opens topology focus, `02 Write` opens builder focus, and `03 Query` opens node proof for the exact slug. This keeps the tree from reading like a passive file outline while preserving the selected-node panel for the richer detail state.

When a tree node is selected, the detail panel repeats that same numbered split as a compact Browse / Write / Query rail: Topology focus for visual inspection, Builder focus for frontmatter-backed repair, and Insights node proof for `node_profile` / edge scan / path plan / `relation_check` follow-up. The Query handoff carries the selected node into `/ontology/insights?node=<vault-slug>`, and Insights resolves both canonical vault slugs and graph ids, so the focused proof panel copies executable CLI/MCP checks for the same concept instead of reopening a generic dashboard. The adjacent selected-node proof copy action now exports `node_profile`, incoming `blast_radius`, incoming/outgoing `match_edges`, reachability, `health`, scan evidence rules, and the shared post-change sync gate. The tree therefore remains a browse index while still making the ontology system's write and query exits visible at the exact concept under review.

The first-viewport summary now makes that loop ordered instead of merely adjacent: `01 Browse` selects the concept slug, `02 Write` keeps that slug focused in Builder for frontmatter edits, and `03 Query` closes the loop with graph DB-style proof over the same local markdown graph. The step number is part of the leading icon block rather than a tiny trailing badge, and each card's proof chip is labeled explicitly so `tree projection`, `frontmatter write`, and `dogfood:graph-db` read as runtime contracts instead of generic tags.

Tree projection warnings now sit under that same contract. The warning panel groups raw tree builder notes by cause, so multiple-parent edges are presented as a hierarchy projection limit while the handoff buttons point to Insights for full graph scans and Builder for relation-direction repair.
