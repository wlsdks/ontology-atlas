---
slug: elements/topology-selected-node-resolver
kind: element
title: Topology Selected Node Resolver
domain: views
---

`src/views/home/lib/resolve-topology-selected-node.ts` resolves the selected
Topology focus value into a `KnowledgeGraphNode`.

It accepts the exact graph node id, a normalized vault slug, or a docs-vault
`ontology/...` evidence id. For legacy non-ontology ids it also tolerates a
unique `:<slug>` tail match. The resolver returns `null` instead of guessing
when an explicit ontology id has no node.

The result drives the current Topology focus/datasheet model and keeps source
document and Workshop handoff anchored to the same selected concept.
`/ontology` and `/ontology/edit` are compatibility redirects; neither is a
resolver consumer.
