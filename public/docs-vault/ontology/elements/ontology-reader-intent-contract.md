---
slug: elements/ontology-reader-intent-contract
kind: element
title: Ontology Reader Intent Contract
domain: views
path: src/shared/lib/ontology-reader-intent.ts
---

# Ontology Reader Intent Contract

`src/shared/lib/ontology-reader-intent.ts` defines the shared URL intent contract (`ONTOLOGY_READER_INTENTS`: `planning`, `marketing`, `leadership`, `developer`, `agent`) for stakeholder handoffs. `parseOntologyReaderIntent` rejects unknown values so destination screens do not invent unsupported reader modes from arbitrary query strings.

**2026-07 update.** Before the map rebuild, `?reader=` was consumed on
`/ontology/insights` to pick the first-opened tab
(planning/marketing/leadership → collaborator lane, agent → agent lane,
developer → graph proof). Insights is now a five-question maintenance board
(Do next / Composition / Connections / Boundaries / Freshness) whose source of
truth is `?tab=`; it has no reader-driven tab selection.

**2026-07-24 update.** The contract's last UI consumer was the xyflow ERD builder (`OntologyEditPage.tsx` read `?reader=` and rendered a `BuilderReaderIntentStrip`). That builder was retired and replaced by the 나침 무대 studio (`/ontology/studio`), which does not read `?reader=`. So the shared lib (`ontology-reader-intent.ts`) and its unit test still define/validate the intent enum, but no live screen currently consumes it — it is a dormant contract awaiting a new stakeholder-handoff surface rather than a builder-arrival strip.

Dogfood note: this element was added while implementing reader-intent destination behavior on the old insights page, then followed the contract to the builder; after the builder retirement its only remaining callers are the module's own type/test, so it is kept as a defined-but-unused contract, not deleted.
