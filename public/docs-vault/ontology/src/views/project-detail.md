---
slug: src/views/project-detail
kind: element
title: Project Detail (3-zone)
domain: views
---

`src/views/project-detail` renders the `/project/[slug]` public detail page as three vertical zones: a hero metric strip (domain/capability/element/document/relation counts derived from `projectIds`-stamped ontology insight nodes), a domain composition grid with an honest sqrt-scaled `MiniDomainMap` SVG, and the body column with a summary rail (connected projects via dependencies + `related_to` edges, agent-handoff snippet). Pure derivations live in `model/` (`project-ontology-metrics`, `domain-composition`, `mini-domain-map-layout`, `connected-projects`); domain cards deep-link to `/topology?mode=focus&p=domain:…`. Replaced the former `src/widgets/project-ontology-overview` widget (2026-07).