---
title: AppNavRail
doc_type: feature
status: current
area: design-system
routes: []
---

# AppNavRail

### `AppNavRail` (desktop, `lg:` and up — left side, on every page)
- Eight destinations: Map (`/`, `/topology`) · Harness (`/architecture`) ·
  Library (`/library`) · Insights (`/ontology/insights`) · Projects (`/projects`
  or `/project/*`) · Agents (`/agents`) · MCP (`/mcp`) · Git (`/git`).
  Library contains Sources, Wiki, and Ontology tabs. Its ontology tab reuses the
  Markdown reader/editor and preserves `/docs/?slug=…` links, fragments, local drafts,
  and conflict protection. Library also inherits the former mobile Docs slot.
  Workshop remains the map's contextual relation-writing surface.
- Bottom utility tier: the `settingsSlot` plus the web-only Get App tile.
  `AppShell` supplies the app-wide settings trigger by default; a page can
  override the slot for a surface-specific control.
- Active-item detection: shared `resolveActiveNavDestination`
  (`src/shared/lib/nav-destination.ts`) — `BottomTabBar` uses the same semantic
  resolver, so a route has one destination even when mobile intentionally
  omits its button.

The rail draws only the destinations the folder earns (`destinationsForVaultShape`, 2026-09-06):
a wiki without a map hides Map, Architecture, Insights and Projects; Agents, MCP, History
and the Library stay (the Library holds `sources/` for any folder); a map, an empty folder, or no
folder shows all eight.
The phone tabs and the `G` keys read the same verdict.
