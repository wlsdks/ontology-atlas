---
uid: e09a683e-d8e1-4c86-bacf-1fdb86a121de
slug: capabilities/ontology-insights
kind: capability
title: Ontology insights
display_en: Retired Analysis address
display_ko: 옛 분석 주소
domain: domains/human-workbench
elements: []
path: src/views/insights-redirect/ui/InsightsRedirectPage.tsx
created_by: "agent:claude-code"
relation_notes: { capabilities/vault-graph-query: "Both read the typed Markdown graph. Analysis derives its comparison from the loaded graph in the renderer; it does not invoke the graph tool module. This relates entry marks the shared record contract, not a runtime import or health-parity verdict." }
relates: [capabilities/vault-graph-query]
---

The retired Analysis destination: its address still answers and sends a person to the screen that now holds what they came for.

The Analysis workbench was removed on 2026-11-15 (`docs/records/decisions/2026-11-15-retire-analysis-destination-c1e7648c-0227-4f33-b1d4-1f86240dd0f2.md`). This concept remains only for the address that outlives it.

## Includes
- Replacing an old `/ontology/insights` address in place, in every locale, without adding a history entry: a Guidance address opens Harness, a Wiki address opens the Library wiki, an address naming one concept or one analysis review opens that concept on the Map, and any other address opens the Map.
- Keeping the other flags of a Harness address.

## Excludes
- The connection explorer that ranked responsibility pairs, the list of capabilities with a recorded gap, and the review summary. They no longer exist on any screen; the Map shows relationships and gaps one concept at a time.
- Any analysis, reading or writing of the vault. The redirect only rewrites an address.
- Navigation entries, shortcuts or tabs for Analysis.

## Evidence
- `src/views/insights-redirect/ui/InsightsRedirectPage.tsx` builds the target from the old address and replaces the location.
- `tests/e2e/app-shell/retired-destinations.spec.ts` follows the old address from another screen and returns with Back.

## Uncertainty
- Whether this concept should stay as a redirect or be deleted from the ontology is undecided; deletion needs the owner's explicit request. Its title and slug still say "insights".
- The redirect was reviewed against hostile addresses in a copy of its builder and run in a static build; the installed macOS app has not followed an old address.
- Saved explanation files under `.ontology-atlas/analyses/` are untouched and were not inspected.