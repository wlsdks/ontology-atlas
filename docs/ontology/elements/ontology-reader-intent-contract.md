---
slug: elements/ontology-reader-intent-contract
kind: element
title: Ontology Reader Intent Contract
domain: views
path: src/shared/lib/ontology-reader-intent.ts
---

# Ontology Reader Intent Contract

`src/shared/lib/ontology-reader-intent.ts` defines the shared URL intent contract (`ONTOLOGY_READER_INTENTS`: `planning`, `marketing`, `leadership`, `developer`, `agent`) for stakeholder handoffs. `parseOntologyReaderIntent` rejects unknown values so destination screens do not invent unsupported reader modes from arbitrary query strings.

**2026-07 update.** Before the map rebuild, `?reader=` was consumed on `/ontology/insights` to pick the first-opened tab (planning/marketing/leadership → collaborator lane, agent → agent lane, developer → graph proof). That insights page was rebuilt into a fixed 3-tab dashboard (Overview / Relations / Freshness) with no reader-driven tab selection — `insights-tab-state.ts` now says explicitly that the "4-tab reader-persona system" is gone.

The contract's only current consumer is the builder: `src/views/ontology-edit/ui/OntologyEditPage.tsx` reads `searchParams.get("reader")`, and when present renders a `BuilderReaderIntentStrip` — a small first-action strip naming the arriving role's title/body/action link (`buildBuilderReaderActionHref`) before canvas work starts. So the contract's shape is unchanged, but its home moved from Insights-tab-selection to a Builder-arrival strip.

Dogfood note: this element was added while implementing reader-intent destination behavior on the old insights page; codegraph_context now confirms the current sole caller is `OntologyEditPage.tsx`.