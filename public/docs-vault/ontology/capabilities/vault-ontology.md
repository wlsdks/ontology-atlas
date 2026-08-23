---
uid: 1ee91a34-14c2-4bdd-bda8-84910555939b
slug: capabilities/vault-ontology
kind: capability
title: Vault Ontology Schema Authoring
domain: domains/graph-modeling
elements: [elements/knowledge-graph, elements/ontology-class]
path: mcp/src/schema.mjs
created_by: human
---

## Definition
The capability to have people and agents author the same five kinds and typed relations in a single vault, while keeping the machine-enforced frontmatter shape, human-approved semantics, current query/write support scope, and non-inference boundaries under distinct authorities and verification paths.

Only `project`, `domain`, `capability`, `element`, and `document` can be authored;
`vault-readme` is a reader-only kind created by tools. `broader` points from narrower to direct
broader, appearing as `is_a` in the UI but not present in the current public relation API enum.
Atlas does not provide automatic inverse/transitive inference or RDF/OWL/SKOS/SHACL conformance.

## Evidence
- docs/ONTOLOGY-ATLAS-SPEC.md §2·§5: kind discrimination, counterexamples, relation storage/display/write,
  direct `is_a`, absence and inference boundary public canonical
- mcp/src/schema.mjs: authorable kinds and frontmatter shape per kind
- src/shared/lib/validate-vault-document.ts: validation including reserved reader kinds
- docs/ONTOLOGY-QUALITY.md: quality rules authority map
- mcp/src/construction-rules.mjs: compact meta-model and construction guidelines read by MCP and app agents
- tests/contract/ontology-meta-model.contract.test.ts: canonical consumer and prompt parity contract

## Confidence
high (0.95): cross-validating public canonical, schema, validator, actual consumers, and negative fixtures.
