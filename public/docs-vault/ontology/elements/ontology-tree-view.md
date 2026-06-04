---
slug: elements/ontology-tree-view
kind: element
title: Ontology Tree View
domain: views
relates: [elements/ontology-tree-projection-summary, elements/ontology-workbench-summary]
---

# Ontology Tree View

`src/widgets/ontology-tree-view/ui/OntologyTreeView.tsx` renders the browse tree used by `/ontology` to inspect the local frontmatter graph as a readable project -> domain -> capability -> element hierarchy.

The tree keeps the ontology model actionable for both humans and AI coding agents: each row exposes the stable slug used by browse, save/edit, and validation handoffs, while inline search, sort controls, keyboard navigation, selected-node handles, changed badges, orphan rows, and projection warnings keep graph state inspectable without leaving the workbench.

Tree rows use a compact but touchable density contract: primary rows are at least 36px tall, expand/select affordances are at least 32px, and orphan selection rows share the same minimum target. This keeps the graph browse surface usable on phone-sized Context Atlas windows without turning the ontology hierarchy into a loose dashboard.
