---
title: AppNavRail
doc_type: feature
status: current
area: design-system
routes: []
---

# AppNavRail

### `AppNavRail` (desktop, `lg:` and up — left side, on every page)
- Destinations, in the order and with the hrefs of
  `src/widgets/app-nav-rail/ui/AppNavRail.tsx` and
  `src/shared/config/destinations.ts`: Map (`/`, `/topology`) · Harness
  (`/architecture`) · Library (`/library`) · Automations (`/automations`) ·
  Insights (`/ontology/insights`) · Projects (`/projects` or `/project/*`) ·
  Agents (`/agents`) · Git (`/git`). MCP is a tab of Agents; `/mcp` redirects
  there and has no tile.
  Library's tabs are the `LibraryTab` type in
  `src/app/library-workspace/index.tsx`, described in
  [`library/workspace.md`](../library/workspace.md). Its Ontology tab reuses the Markdown
  reader/editor and preserves `/docs/?slug=…` links, fragments, local drafts,
  and conflict protection. Library also inherits the former mobile Docs slot.
  Relation writing stays on the map, in the contextual meaning editor
  ([`meaning-editor.md`](../map/meaning-editor.md)).
- Bottom utility tier: the `settingsSlot` plus the web-only Get App tile.
  `AppShell` supplies the app-wide settings trigger by default; a page can
  override the slot for a surface-specific control.
- Active-item detection: shared `resolveActiveNavDestination`
  (`src/shared/lib/nav-destination.ts`) — `BottomTabBar` uses the same semantic
  resolver, so a route has one destination even when mobile intentionally
  omits its button.

The rail draws only the destinations the folder earns (`destinationsForVaultShape`):
a wiki without a map shows Library, Automations, Agents and Git (the Library holds
`sources/` for any folder); a map, an empty folder, or no folder shows every destination.
The phone tabs and the `G` keys read the same verdict.
