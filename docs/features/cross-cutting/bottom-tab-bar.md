---
title: BottomTabBar
doc_type: feature
status: current
area: design-system
routes: []
---

# BottomTabBar

### `BottomTabBar` (mobile only, `lg:` hidden)
- 5 persistent destinations: Map · Architecture · Docs · Insights · Projects.
  Contextual relation writing, Agents and MCP entry points, and Git keep their
  existing narrow-screen paths. Web adds Get App as a sixth utility, not a destination.
- Min height 56 px (safe-area)
- Hidden only on the standalone `/download/` surface. Root without a loaded
  vault is the gateway; after a vault loads, root shares the map destination.
