---
slug: elements/builder-write-summary
kind: element
title: Builder Write Summary
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the compact `Source` / `Draft` / `Guard` / `Proof` status strip above the `/ontology/edit` canvas.

The strip is the builder persistence contract before the canvas: `Source` distinguishes local writable vaults from sample read-only data, `Draft` counts unsaved canvas nodes/edges, `Guard` names relation preview and preflight, and `Proof` hands the user to `/ontology/insights` for query cockpit validation after graph writes.

Each status cell now carries an icon plus a compact proof chip: `local markdown` / `read-only sample`, `canvas draft`, `relation guard` / `preflight active`, and `graph db proof` / `node proof pack`. The chip row makes the first viewport name the executable contract behind the builder instead of relying only on explanatory body copy.

When a vault node is selected, the `Proof` action now carries that node slug into `/ontology/insights?node=...` instead of opening only the generic query cockpit. The builder therefore preserves write context when it hands off to graph DB-style verification: the target Insights panel can copy `node_profile`, incoming `blast_radius`, and the shared sync gate for the exact concept the user was editing.

`Source` body copy is mode-specific so the first viewport no longer relies only on a short value label: local mode says writes go directly to the selected vault, while sample mode says the graph is view-only and points users to the local vault picker. This keeps the builder experience aligned with the local-first workbench model instead of reading like a generic diagram editor.
