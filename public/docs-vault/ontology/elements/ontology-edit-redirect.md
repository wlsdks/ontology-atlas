---
uid: 1b3e2a6f-46d8-47b5-8764-299ec2767fe7
slug: elements/ontology-edit-redirect
kind: element
title: Ontology Workbench Compatibility Redirect
display_ko: 옛 작업대 링크 넘김
domain: domains/graph-modeling
path: src/views/ontology-edit-redirect
created_by: "agent:unknown"
---

`/ontology/edit` and `/ontology/studio` are static-export compatibility entries. OntologyEditRedirectPage translates legacy node/mode/edit/via/review parameters into `/topology` `p/workbench/edit` state; neither old address is a navigation destination or write surface.

## Evidence

- Primary implementation: `src/views/ontology-edit-redirect/ui/OntologyEditRedirectPage.tsx#OntologyEditRedirectPage`
- Supporting implementation: `src/views/ontology-edit-redirect/ui/OntologyEditRedirectPage.tsx#buildTopologyWorkbenchRedirect`
- Focused test: `src/views/ontology-edit-redirect/ui/OntologyEditRedirectPage.test.tsx#redirects the bare compatibility route to the map`
- Focused test: `src/views/ontology-edit-redirect/ui/OntologyEditRedirectPage.test.tsx#translates a canonical ?node= deep-link to the contextual editor`

## Includes

- Translating legacy `/ontology/edit` and `/ontology/studio` node/mode/edit/via/review query parameters into `/topology`'s workbench-edit state.
- Redirecting client-side (required by the static export) without ever becoming a navigation destination or write surface itself.

## Excludes

- The relation-editing surface it redirects into, owned by elements/ontology-meaning-editor.
- The `/ontology` (non-edit) legacy redirect, a separate route owned by elements/ontology-redirect.
- Resolving whether the deep-linked node actually exists in the live vault: that check happens on `/topology` (HomePage), not here.
