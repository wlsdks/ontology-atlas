---
slug: elements/ontology-tree-projection-summary
kind: element
title: Ontology Tree Projection Summary
domain: views
relates: [elements/insights-query-cockpit, elements/ontology-workbench-summary]
---

`src/views/ontology-view/lib/tree-projection-warnings.ts` classifies raw `/ontology` tree build warnings into multiple-parent, cycle, self-parent, duplicate, and other groups.

The `/ontology` warning panel uses this summary to make the tree's role explicit: it is a hierarchy projection for browse, not the full graph. Multiple-parent relations can stay valid in the underlying markdown graph even when the tree keeps one parent for readability. The role strip names these as projection notes (`N notes`) instead of a generic warning count, and the panel hands users to Insights for graph DB-style scans or Builder when the relation direction itself needs frontmatter repair. On mobile, those handoff actions become full-width icon-led targets so the browse → query → write loop stays clear and tappable.

The projection notes dialog also treats long ontology slugs as constrained evidence, not layout authority. Summary chips keep `min-width: 0`, truncate the kind label, and clamp example slug rows inside the modal width so opening tree notes on a phone never creates horizontal scroll while still preserving the examples needed for agent follow-up. The dialog now repeats the same Insights and Save/edit handoffs in its footer, so opening exact projection evidence does not trap the user in a read-only explanation: the next action can still be graph DB-style verification or frontmatter relation review.
