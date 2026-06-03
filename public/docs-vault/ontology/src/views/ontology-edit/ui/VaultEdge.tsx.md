---
slug: src/views/ontology-edit/ui/VaultEdge.tsx
kind: element
title: Ontology Builder Vault Edge
domain: ontology-core
---

# Ontology Builder Vault Edge

`src/views/ontology-edit/ui/VaultEdge.tsx` renders persisted vault relations in the ontology builder canvas.

It routes vault-backed edges with smooth step paths and keeps containment / relation semantics available through edge metadata. The edge endpoint coordinates are offset away from node handles before path calculation, so relation lines visually begin and end outside node cards instead of reading as lines that cut through boxes.

This element supports the human-facing graph readability contract: ontology relations should be visible between meaning nodes, while the node cards remain the primary readable objects.