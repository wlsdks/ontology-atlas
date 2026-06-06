---
slug: elements/topology-owner-tint-overlay
kind: element
title: Topology Owner Tint Overlay
domain: views
---

# Topology Owner Tint Overlay

`src/widgets/topology-map-sigma/lib/reducer-owner-tint.ts` defines the reducer guard for the topology owner tint overlay.

Owner tint is a project-ownership overlay, not an ontology identity overlay. Plain project nodes can be recolored by owner, but hub nodes keep the hub color and ontology nodes keep their `project`, `domain`, `capability`, `element`, or `unknown` kind hue.

This protects the semantic map contract: when Atlas shows an ontology graph, color remains a visible classification channel instead of being overwritten by a secondary ownership lens. `src/widgets/topology-map-sigma/lib/reducer-owner-tint.test.ts` locks the behavior so enabling owner tint cannot make ontology kinds look alike again.
