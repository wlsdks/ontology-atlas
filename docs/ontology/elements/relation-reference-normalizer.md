---
uid: 13bb6572-7409-4f7b-8b65-724c21583802
slug: elements/relation-reference-normalizer
kind: element
title: Relation reference normalizer
display_en: Relation reference normalizer
display_ko: 관계 참조 정규화기
domain: domains/meaning-layer
path: mcp/src/vault/relation-refs.mjs
created_by: "agent:sync"
---

Holds the one list of frontmatter keys that become graph edges, with the alias spellings accepted for them, and reads a document's references and relation notes in the single shape every reader expects.

## Includes
- The relation keys that become edges and their accepted aliases (`GRAPH_ARRAY_KEYS`, `NEIGHBOR_KEY_ALIASES`).
- Normalizing the relation references a document declares, so the compiler sees one shape (`normalizeRelationRefs`).
- Collecting a document's neighbour references and the note stored for one relation (`collectNeighborRefs`, `relationNoteFor`).
- Finding the documents that name a concept in a relation key before that concept has a file (`findGraphReferences`).

## Excludes
- Reading or writing vault files; the vault file store owns the disk.
- Resolving a reference to a node, an external path or nothing; the graph compiler does that.

## Uncertainty
- Read from `mcp/src/vault/relation-refs.mjs` and the import lines of the files that import it, while the vault module was split. Which callers depend on an alias spelling rather than the canonical key was not traced.
