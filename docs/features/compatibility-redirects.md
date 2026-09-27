---
title: Compatibility redirects
doc_type: feature
status: current
area: map
routes: [/ontology, /ontology/edit, /ontology/studio, /mcp]
---

# Compatibility redirects

These addresses stay in the static export so old bookmarks, agent handoffs and
deep links land on a current destination instead of a 404. None of them is a
navigation destination or a product screen.

### `/ontology` — redirects to the map's INDEX

`/ontology` is a thin client redirect (`src/views/ontology-redirect/`) to
`/topology/?index=expanded`, translating its `?node=<id>` deep-link contract
into `/topology`'s `?p=<id>` so every agent-handoff, search and docs-viewer link
built via `buildOntologyNodeHref` keeps resolving.

Project → domain → capability → element browsing, node selection and agent
handoff copy live in the map's INDEX panel
(`TopologyIndexPanel`/`TopologyIndexTab`, `src/widgets/topology-index-panel/`),
which reuses `buildOntologyTree` / `filterTreeByQuery`. See
[`features/map/`](map/README.md) for the map and [`analysis.md`](analysis.md)
for `/ontology/insights`.

### `/ontology/edit` and `/ontology/studio` — redirect to the map editor

Both addresses use `OntologyEditRedirectPage`
(`src/views/ontology-edit-redirect/`) to translate legacy `?node=`,
`?mode=create`, and `?edit=` values into `/topology` workbench state.

### `/mcp` — redirects to the Agents page's MCP tab

`/mcp` (`src/views/mcp-redirect/`) redirects to `/agents/?tab=mcp`, carrying
every other parameter; `?tab=connectors` becomes `&mcp=connectors`. The
installed app's `ontology-atlas://mcp?install=…` deep link therefore still
opens the connectors dialog. Its canonical address is `/agents/`. See
[`agents.md`](agents.md).
