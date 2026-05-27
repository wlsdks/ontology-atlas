---
slug: elements/builder-write-summary
kind: element
title: Builder Write Summary
domain: views
---

`src/views/ontology-edit/ui/OntologyEditPage.tsx` owns the compact `Source` / `Draft` / `Guard` / `Proof` status strip above the `/ontology/edit` canvas.

The strip makes the builder's write contract visible before the user draws: source tells whether the current graph is a writable local markdown vault, a restoring desktop vault, or a read-only sample; draft separates unsaved canvas work; guard names relation preflight; proof hands the saved slug to the graph DB + health query cockpit.

The desktop restore state exists because the macOS app can route into Builder before the persisted vault manifest finishes rehydrating. During that window the Source cell must not claim "sample read-only"; it shows `desktop restore` until `useLocalVault()` reports the selected vault manifest.