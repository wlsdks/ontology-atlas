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
- **Settings gear** (`OntologyMapSettingsGear`, 2026-07-18) → compact anchored popover (228px), no scrim: language (`LocaleSwitch`) · theme (`ThemeToggle`) · INDEX default state (expanded/collapsed default, writes the same localStorage key the INDEX panel reads). Self-closes; owns its own Escape so the global topology Esc ladder doesn't double-fire. Desktop-only (1512/1920 scope)
