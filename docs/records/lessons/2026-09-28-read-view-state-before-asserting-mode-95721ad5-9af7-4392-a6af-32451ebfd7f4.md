---
id: 95721ad5-9af7-4392-a6af-32451ebfd7f4
date: 2026-09-28
kind: mistake
status: reported
harness_area: route-proof
---
**Observed**: The new Ontology round-trip test assumed the editor writes view=edit. It failed with null while editing worked. Reading src/views/docs-vault/lib/url-state.ts showed its only current view is doc (omitted by default); Edit is a separate internal mode. The corrected test compares the pre-switch query and reopens Edit to verify the last unsaved keystroke.
**Cost**: One 18.5-second E2E run reported a false navigation defect; diagnosis time was not measured.
**Suspected cause**: A route parameter's name was treated as its semantic contract without reading the current serializer and type.
**Proposed change**: none. For this change, preserve the reader-owned parameter verbatim and test the actual draft recovery boundary; no new repository-wide rule is warranted.
