---
slug: elements/ontology-relation-key-inference
kind: element
title: Ontology Relation Key Inference
domain: ontology-core
---

`src/shared/lib/ontology-relation-key.ts` centralizes schema-aware frontmatter relation key inference.

Builder relation confirmation and topology Path evidence both use this shared helper so a source/target pair yields the same preflight relation key before any `add_relation` write. Hierarchy-like pairs map to concrete graph keys (`domain -> capability` becomes `capabilities`, `capability -> element` becomes `elements`), while ambiguous pairs fall back to `relates`.

The helper also formats a short inference reason for both visible UI and copyable handoff packets. Builder relation confirmation and topology Path banners show that reason before save or handoff, and builder relation review packets plus topology Path evidence can say not just `type: capabilities`, but why that type was chosen, so Claude Code / Codex receives the same schema-aware explanation that the UI used before a write.
