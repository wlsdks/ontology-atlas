---
title: Compatibility redirects
doc_type: feature
status: current
area: map
routes: [/ontology, /ontology/edit, /ontology/studio, /ontology/insights, /mcp]
---

# Compatibility redirects

These addresses stay routes so old bookmarks, agent handoffs and deep links land
on a current destination instead of a 404. None of them is a navigation
destination or a product screen. Each route module answers in `beforeLoad`,
before any screen renders, with the target `retired-address-targets.ts` computes,
replaces its own history entry, and keeps the link's hash.

### `/ontology` — redirects to the map's INDEX

`/ontology` redirects to
`/topology/?index=expanded`, translating its `?node=<id>` deep-link contract
into `/topology`'s `?p=<id>` so every agent-handoff, search and docs-viewer link
built via `buildOntologyNodeHref` keeps resolving.

Project → domain → capability → element browsing, node selection and agent
handoff copy live in the map's INDEX panel
(`TopologyIndexPanel`/`TopologyIndexTab`, `src/widgets/topology-index-panel/`),
which reuses `buildOntologyTree` / `filterTreeByQuery`. See
[`features/map/`](map/README.md) for the map.

### `/ontology/edit` and `/ontology/studio` — redirect to the map editor

Both addresses translate legacy `?node=`,
`?mode=create`, and `?edit=` values into `/topology` workbench state.

### `/ontology/insights` — the retired Analysis address

Analysis left the rail on 2026-11-15; its facts are read on the map, in the
Library and in Harness. `/ontology/insights` replaces itself,
adding no history entry, by the first matching rule:

| Address | Lands on |
|---|---|
| `?tab=harness` | `/architecture/?view=overview`, every other parameter kept |
| `?tab=library` | `/library/?tab=wiki` |
| `?review=analysis:<id>` or `?node=<slug>` | `/topology/?p=<canonical id>` |
| any other `tab`, `review=relation:<id>`, `via`, or nothing | `/topology/` |

Its canonical address is `/topology/`, and it is absent from the sitemap. The
`via=insights:<tab>` return marker is ignored on `/topology`, `/docs` and
`/ontology`. `localStorage` keys `atlas.insights.briefSeenAt:*` stay where they
are, with no reader.

### `/mcp` — redirects to the Agents page's MCP tab

`/mcp` redirects to `/agents/?tab=mcp`, carrying
every other parameter; `?tab=connectors` becomes `&mcp=connectors`. The
installed app's `ontology-atlas://mcp?install=…` deep link therefore still
opens the connectors dialog. Its canonical address is `/agents/`. See
[`agents.md`](agents.md).
