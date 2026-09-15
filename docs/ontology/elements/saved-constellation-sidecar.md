---
uid: 04951b23-52c3-4bd7-8716-522fe02119db
slug: elements/saved-constellation-sidecar
kind: element
title: Saved Constellation Sidecar Contract
display_en: Saved Constellation Sidecar Contract
display_ko: 저장된 모음 사이드카 계약
domain: domains/local-vault-management
path: src/entities/library-collection
created_by: "agent:ontology-atlas-cli"
---

A compatible versioned sidecar contract stores a person's named constellation, purpose, stable folder identity, and immutable ontology UID members so the same task scope can be reopened across Galaxy, Library, MCP, and CLI. The web entity owns browser parsing and persistence while MCP and CLI mirror the same on-disk schema.

## Includes

- A compatible `v1` folders/items representation in the private vault sidecar.
- Stable folder UUIDs and ontology member UIDs as identity. Galaxy keeps a separate `mapId` for focus; the persisted `lastKnownPath` is the exact manifest `document.path` (for example `capabilities/x.md`) and is display-only rather than node identity.
- Conflict-aware writes, explicit read-only behavior, and a corrupt/unavailable state that is distinct from an empty collection.
- Source and wiki attachments remaining distinguishable from ontology-node members.

## Excludes

- A new ontology kind or graph edge for constellation membership.
- Treating saved membership as accepted ontology meaning, dependency evidence, or complete impact scope.
- A separate Library collection store.

## Evidence

- `src/entities/library-collection`: shared web parser, resolver, and persistence contract.
- `mcp/src/constellations.mjs`: read-only MCP mirror of the same versioned format.
- `cli/src/commands/constellations.mjs`: CLI reader over the MCP result contract.
- `docs/LIBRARY-COLLECTIONS-FORMAT.md`: compatible sidecar format and identity rules.