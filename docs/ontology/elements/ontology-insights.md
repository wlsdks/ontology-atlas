---
uid: 4f5ec185-5722-4ff2-854b-ab661168f65c
slug: elements/ontology-insights
kind: element
title: Ontology Insights
display_ko: 분석 화면
domain: domains/graph-modeling
path: src/views/ontology-insights
created_by: "agent:unknown"
---

Six-tab maintenance board: five measured questions plus Flow. The Do-next tab is one flat list under one count (owner decision, 2026-09-01): each row is a concept or document title, one sentence naming the observed fact, and actions in a fixed order (hand it to the in-app AI chat through the ask deep link for missing definition, missing domain, and missing relations; fix it here; see it on the map). The readiness meter, the repair-queue counter band, the activity digest and the agent footer were removed; validation-blocked documents join the list by name with the failed check in plain words, and the tab badge counts what the list draws. In the installed app, the Flow handoff opens the existing agent dock with a visible, person-owned prefilled request; a verified ACP runtime is used when available, otherwise the key-backed agent panel is used. The web copy action stays explicit. docs/ARCHITECTURE.md: "maintenance on the six-tab Insights page: five measured questions plus Flow".

## Evidence

- Primary implementation: `src/views/ontology-insights/ui/OntologyInsightsPage.tsx#OntologyInsightsPage`
- Supporting implementation: `src/views/ontology-insights/ui/parts/FixRow.tsx#FixRow`
- Focused test: `src/views/ontology-insights/lib/census-health.test.ts#excludes the reserved reader guide from kind sums and density`
- Focused test: `src/views/ontology-insights/lib/census-health.test.ts#derives edge/concept ratio, orphans, cycles, domain membership %, evidence %`
