---
title: Map keyboard shortcuts
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Map keyboard shortcuts

#### Global keyboard shortcuts (all `useTypingShortcuts`-gated)
| Key | Action |
|---|---|
| `⌘K` (Shift optional) | Unified ontology-node + project search |
| `D` | Toggle source drawer (the map only) |
| `?` | Toggle shortcut sheet |
| `⌘O` | Open a local Markdown folder from the static sample |
| `Esc` | Close the highest-priority open layer or addressed map state |

---

**The map has weight, a press, and light** (2026-09-08, after the expression bans were lifted). A node's mass is its number of relations: let go of a hub after a drag and it carries the hand's speed a step past the drop point, overshoots once and takes longer to sit, while a leaf snaps home; its neighbours spring back on their own mass. Hovering a node swells it on an underdamped step, so a hover reads as a press that gives. Selecting a node lays an indigo ground halo under its neighbourhood, sized by its farthest neighbour, blooms the node and glows its relation lines, all on the focus ramp, so the light arrives with the dive and leaves with the deselect. Nothing at rest glows or moves, the idle canvas still draws zero frames, and under `prefers-reduced-motion` every end state lands with no ring. Measured on the sample vault at 1512: a dragged domain carried 14 px past its drop and settled by 300 ms; a hovered domain went 28.1 px to 34.7 and sat at 34.2. The pieces are pure modules under `src/widgets/ontology-map/expressive/` (`mass-spring`, `release-offsets`, `ego-light`) with a README naming their tokens and how to remove them.
