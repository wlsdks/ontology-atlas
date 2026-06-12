---
slug: elements/topology-kind-color-legend
kind: element
title: Topology Kind Color Legend
domain: views
---

`src/widgets/topology-map-sigma/ui/SigmaTopology.tsx` renders the topology kind legend that labels the visible node colors for `project`, `domain`, `capability`, `element`, and `unknown`.

The legend reuses `ontologyFillTone(...)` directly, so the visible swatches and graph node fills cannot drift independently. It appears when the audit overlay is off and the map is not in minimal embed mode.

The 2026-06-06 macOS dogfood pass found that a tiny dot plus kind label was too weak on the dense topology canvas. The legend now uses larger pill-shaped swatches, larger text, and non-truncated role descriptions so it reads as a small classification guide rather than a decorative key.

Each row pairs the color with the same role split that Claude Code and Codex receive before writing frontmatter: product/system root, shared vocabulary or ownership boundary, user behavior/workflow, concrete component/command/file evidence, or review-needed unknown.

`pnpm design:ontology` now guards the five `kindLegend*Role` message keys in `SigmaTopology.tsx`, so future topology work cannot silently drop the role descriptions and leave only color plus tier labels.

The legend is part of the semantic proof of the map: users should be able to read the graph as an ontology relation map without knowing internal MCP or graph tooling terminology.
