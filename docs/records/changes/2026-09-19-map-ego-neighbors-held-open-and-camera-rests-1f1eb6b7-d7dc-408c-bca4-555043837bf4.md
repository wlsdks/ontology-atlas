---
id: 1f1eb6b7-d7dc-408c-bca4-555043837bf4
date: 2026-09-19
category: Fixed
---
Selecting a map node now draws its neighbours that live in other folded domains, with their names and lines, so the ego graph matches the relations the panel lists; each folded parent's chip claims only what still folds. The focus camera also comes to rest: its target is clamped to the leash the map keeps around the selected node, where before a far-off target kept the map redrawing at full frame rate for the whole selection.
