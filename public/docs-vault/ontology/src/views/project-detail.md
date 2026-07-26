---
slug: src/views/project-detail
kind: element
title: Project Detail (3-zone)
domain: views
---

`src/views/project-detail` renders the `/project/[slug]` public detail page as three vertical zones: a hero metric strip (domain/capability/element/document/relation counts derived from `projectIds`-stamped ontology insight nodes), a domain composition grid with an honest sqrt-scaled `MiniDomainMap` SVG, and the body column with a summary rail (connected projects via dependencies + `related_to` edges, agent-handoff snippet). Pure derivations live in `model/` (`project-ontology-metrics`, `domain-composition`, `mini-domain-map-layout`, `connected-projects`); domain cards deep-link to `/topology?mode=focus&p=domain:…`.

Static export keeps canonical `/project/[slug]` pages for build-time projects.
Arbitrary local-vault project links use the pre-rendered
`/project/fallback/?slug=…` runtime entry, which renders the same
`ProjectDetailPage` (or `ProjectEditorPage` for `mode=edit`) rather than a
second UI. In local mode, a loaded-vault miss stays a real not-found instead
of falling through to the static dogfood project. Copied runtime links keep
the active locale and desktop base path. Inline edits patch only the touched
frontmatter keys and resolve the original path-agnostic project document, so
a root `project.md` is not silently copied into `projects/project.md`. Full
edits preserve a title-only document's key shape instead of adding a
competing `name`, and do not fabricate absent taxonomy or position facts.

Replaced the former `src/widgets/project-ontology-overview` widget (2026-07).
