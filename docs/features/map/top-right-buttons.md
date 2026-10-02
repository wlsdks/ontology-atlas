---
title: Top-right buttons
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Top-right buttons

#### Top-right buttons
- **Source button** (`D`) → `DocsQuickDrawer` overlay with pinned/recent markdown source preview
- **Shortcuts button** (`?`) → `ShortcutSheet`
- **Settings** → the one settings sheet ([AppSettingsMenu](../cross-cutting/app-settings-menu.md)); on the map its Map pane also shows the INDEX default state, which writes the same localStorage key the INDEX panel reads. The open sheet owns Escape, so the topology Esc ladder does not fire twice
