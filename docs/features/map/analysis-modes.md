---
title: Analysis modes and workflow entry points
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Analysis modes and workflow entry points

#### Analysis modes + workflow entry points
- **Overview (default)** — the canvas-2D Topology map with deterministic
  project/domain/hub structure and bounded ForceAtlas2 settling: the read-first
  decision surface.
- Focus/path/health are **not separate canvases**:
  - **Focus** — enters via node click on the map (selection state); `mode=focus` deep links preserved What the focus dims recedes to `--map-ego-rest-alpha` (0.42): the node, its lines, its chip and, for a project or domain, its name, on one number (2026-09-20; before, the dim was a colour ramp of 1.37:1 and dimmed siblings drew as bright nameless circles) A name whose slot below its node falls under the floor band (the readout's corner) takes the slot above the node instead of vanishing (2026-09-20: two domains at y 741 of 806 drew nameless).
  - **Path** — enters via shift-click of 2 nodes or `mode=path` deep links
  - **Health** — enters via the maintenance queue count chip on the view rail; `mode=health` deep links preserved
