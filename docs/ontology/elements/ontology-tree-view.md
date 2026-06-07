---
slug: elements/ontology-tree-view
kind: element
title: Ontology Tree View
domain: views
relates: [elements/ontology-tree-projection-summary, elements/ontology-workbench-summary]
---

# Ontology Tree View

`src/widgets/ontology-tree-view/ui/OntologyTreeView.tsx` renders the browse tree used by `/ontology` to inspect the local frontmatter graph as a readable project -> domain -> capability -> element hierarchy.

The tree keeps the ontology model actionable for both humans and AI coding agents: rows use concise titles and a short selected-state label in the main surface, while the stable slug used by browse, save/edit, and validation handoffs stays available in tooltips and handoff panels. Inline search, sort controls, keyboard navigation, selected-node handles, changed badges, orphan rows, and projection warnings keep graph state inspectable without leaving the workbench.

The visible row label removes trailing parenthetical implementation qualifiers such as `(Topology · Browse · Builder)` so the first browse screen reads as a concept map, not a feature inventory. The full title is still preserved in the row title, selection accessibility label, and search matching, so people and agents can find `Browse` or `Builder` without forcing every reader to parse that detail in the default tree.

The compact role/status strip above the tree states the primary interaction directly: select a row to open the Browse / Write / Query handoff panel. It now separates `source concepts`, `hierarchy rows`, and `total relations` so users do not confuse ontology-store concept records, repeated tree projection rows, and queryable graph edges. Off-hierarchy reference documents are described as background evidence, not hidden hierarchy items, so the strip explains why they do not appear as project/domain/capability/element rows without turning into a document summary panel. Korean copy names the active local mode as `로컬 온톨로지 저장소`, reinforcing that the selected folder is the ontology store backing graph reads and agent verification.

Tree rows use a compact but touchable density contract: primary rows are at least 36px tall, expand/select affordances are at least 32px, and orphan selection rows share the same minimum target. Search and sort controls keep the same 32px internal focus target, so filtering the graph hierarchy is not a tiny text-field operation on phone-sized Ontology Atlas windows. This keeps the graph browse surface usable without turning the ontology hierarchy into a loose dashboard.

The expand/collapse-all controls are no longer treated as a visible explanatory block. The default first screen shows only the direct Expand all / Collapse all buttons before search, while the expanded-count summary moves to the controls' accessible label and the View options disclosure. This keeps the tree entry focused on search and selection without losing the hierarchy state for keyboard and screen-reader users.
