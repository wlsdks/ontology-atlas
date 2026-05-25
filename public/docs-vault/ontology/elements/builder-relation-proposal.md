---
slug: elements/builder-relation-proposal
kind: element
title: Builder Relation Proposal Model
domain: views
relates: [elements/ontology-relation-key-inference]
---

`src/views/ontology-edit/lib/relation-proposal.ts` contains the builder relation proposal model.

It infers the default relation key for a drag between persisted vault nodes, formats the source-side frontmatter write preview, formats the small frontmatter patch snippet that will be appended to the source document, builds a structured `VaultRelationWriteScope` with file path, frontmatter key, target slug, and mutation text, derives the graph effect that the write creates, and performs local relation preflight over the manifest.

The inference follows the vault schema's graph keys instead of collapsing hierarchy into `relates`: project → domain writes `domains`, project/domain → capability writes `capabilities`, project/capability → element writes `elements`, project → project writes `dependencies`, evidence documents write `describes`, and otherwise-explicit containment falls back to `contains` before the generic `relates` fallback. The confirmation alternatives expose those same writable graph keys so a builder drag can create the relation topology, path, impact, and MCP will actually read. Copyable relation review packets include the same inference reason, so agent handoff sees why the selected frontmatter key is the default instead of receiving only the final key name.

Preflight is alias-aware for agent-created dependency edges. Existing `depends_on` frontmatter entries count as canonical `dependencies` duplicates and path evidence, matching MCP/CLI behavior where public `depends_on` inputs are normalized to the stored dependency edge.

The write helper follows the same rule: when the builder saves a `dependencies` relation, it first reads both `dependencies` and `depends_on`, prevents duplicate writes across either key, then writes the merged set back to `dependencies` while clearing `depends_on`. The inspector also reads the merged dependency set so an agent-created edge remains visible before the user edits it.

The preflight returns one of `safe_to_add`, `skip_existing`, `review_inverse`, or `review_path` so the UI can explain whether the proposed edge is new, duplicated, reversed, or already implied by a graph path. A direct source-to-target edge under another frontmatter key now also returns `review_path`, because saving another key would create a second visible graph relation between the same two nodes.
