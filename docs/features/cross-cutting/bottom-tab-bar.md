---
title: BottomTabBar
doc_type: feature
status: current
area: design-system
routes: []
---

# BottomTabBar

### `BottomTabBar` (mobile only, `lg:` hidden)
- 5 persistent destinations: Map · Architecture · Library · Planning · Projects.
  Contextual relation writing, Agents and MCP entry points, and Git keep their
  existing narrow-screen paths.
- Min height 56 px (safe-area)
- Hidden only on the standalone `/download/` surface. Root without a loaded
  vault is the gateway; after a vault loads, root shares the map destination.
