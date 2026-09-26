---
title: Overview return (TopologyFitControl)
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Overview return (TopologyFitControl)

#### `TopologyFitControl` (shared overview return)
- Single **Fit Map** tile — fits the camera to the graph bounds. Fit, tour,
  shortcuts, and growth replay are fixed 36px icon tiles in the right utility
  stack; each name appears in the existing tooltip on pointer hover and keyboard
  focus, so the stack never widens over the graph. When the map is exposed, Fit
  remains visible on narrow and touch screens above the bottom-tab reserve; it
  yields while the phone INDEX sheet covers the map. Pinch zoom is an additional
  path. In 3D, closing a detail panel preserves selection and exposes Fit to clear
  it and return to the overview.
- The map draws its keyboard focus outline inside the clipped canvas. Picking a search result hands focus to the map after the palette closes; cancellation returns to the opener. Activating a related concept transfers keyboard focus to the replacement inspector's close control. INDEX, detail and realm controls use the shared 44px touch floor.
- The old "map controls" panel (search · "Hubs only" · overlays · depth/force sliders · in-panel shortcuts help) was a dead control board — the v2 canvas engine never read those focus/overlay/force fields — and was demolished (2026-07-21). Physics (force) tuning may return later as a real, wired feature (see BACKLOG).
