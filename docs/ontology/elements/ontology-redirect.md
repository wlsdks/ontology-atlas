---
uid: de8ffdb5-288d-484a-be8b-4c997483be2a
slug: elements/ontology-redirect
kind: element
title: Ontology Redirect
display_ko: 옛 온톨로지 링크 넘김
domain: domains/graph-modeling
path: src/views/ontology-redirect
created_by: "agent:unknown"
---

Compatible redirect from /ontology to /topology?index=expanded.

## Evidence

- Primary implementation: `src/views/ontology-redirect/ui/OntologyRedirectPage.tsx#OntologyRedirectPage`
- Focused test: `src/views/ontology-redirect/ui/OntologyRedirectPage.test.tsx#redirects to /topology with INDEX expanded and no ?p= when there is no ?node=`
- Focused test: `src/views/ontology-redirect/ui/OntologyRedirectPage.test.tsx#translates a canonical ?node= into ?p= unchanged`

## Includes

- Redirecting `/ontology` (no edit/studio suffix) to `/topology?index=expanded`, translating a canonical `?node=` into `?p=` unchanged.
- Preserving `?p=` absence when no `?node=` is present, so a bare `/ontology` visit lands on the map with the INDEX expanded rather than a broken query.

## Excludes

- The `/ontology/edit` and `/ontology/studio` compatibility redirects, a separate route: elements/ontology-edit-redirect.
- Resolving whether the linked node exists in the live vault: `/topology` (HomePage) owns that check and the miss toast.
- Any node detail rendering; this route only redirects.
