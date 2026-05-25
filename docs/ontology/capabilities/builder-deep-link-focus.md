---
slug: capabilities/builder-deep-link-focus
kind: capability
title: Builder Deep-Link Focus
domain: views
elements: [builder-node-query-focus, ontology-deeplink-node-resolver]
---

# Builder Deep-Link Focus

`/ontology/edit?node=<vault-doc-slug>` opens the builder with the matching vault node selected in the inspector and centered on the canvas.

The capability lets graph surfaces hand users directly from inspection into editing, instead of requiring them to search for the same node again. `/ontology` now preserves selected-node context when the top Builder CTA or detail-panel focus action opens the builder, and its deeplink resolver accepts both graph IDs (`capability:mcp-server`) and vault slugs (`capabilities/mcp-server`).

The builder query resolver accepts live-vault slugs and dogfood docs-vault aliases, so `/ontology/edit?node=capabilities/topology-analysis-modes` still selects the static manifest row stored as `ontology/capabilities/topology-analysis-modes`. Browser coverage opens that URL and verifies the saved node appears in the inspector with its path.
