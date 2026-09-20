---
id: 54cf76ab-c58d-4014-a626-41ba9393758a
date: 2026-09-20
category: Fixed
---
The map's focus leash, which keeps a selected node from leaving the frame, is now sized to the screen: half the free extent beside the open panels less an edge pad, per axis, with the old token as its floor. The selection frame respects it when it picks a zoom, so a node whose neighbours sit far across the map is framed with all of them beside the detail panel instead of under it.
