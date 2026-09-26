---
title: Compatibility redirects
doc_type: feature
status: current
area: map
routes: [/ontology, /ontology/edit, /ontology/studio]
---

# Compatibility redirects

### `/ontology` — retired tree/ego hub → thin redirect (B3 Hub is soon the map)

The tree + ego graph Browse surface this section used to describe
(`OntologyViewPage`, `OntologyTreeView`, the old `NodeDetailPanel`/ego SVG) is
retired. `/ontology` is now a thin client redirect
(`src/views/ontology-redirect/`) to `/topology/?index=expanded`, translating
its `?node=<id>` deep-link contract into `/topology`'s `?p=<id>` so every
existing agent-handoff / search / docs-viewer link built via
`buildOntologyNodeHref` keeps resolving instead of 404ing.

The hub itself — project → domain → capability → element browsing, node
selection, agent handoff copy — now lives inside `/topology` (see "INDEX
panel" under the `/topology` section below): a left instrument panel
(`TopologyIndexPanel`/`TopologyIndexTab`, `src/widgets/topology-index-panel/`)
that floats over the map, reusing the same `buildOntologyTree` /
`filterTreeByQuery` the old tree page used, so row search/select behavior is
unchanged even though the surface is.

`/topology` is the read/write workbench and `/ontology/insights` is the
six-tab maintenance board: five measured questions plus Flow. The old
Browse/Write/Query labels are historical shorthand, not current navigation or
surface chrome.

### `/ontology/edit` and `/ontology/studio` — compatibility redirects

Both old addresses now use `OntologyEditRedirectPage` to translate legacy
`?node=`, `?mode=create`, and `?edit=` values into `/topology` workbench state.
The routes remain in the static export so old bookmarks do not 404; neither is
a navigation destination or a product screen.
