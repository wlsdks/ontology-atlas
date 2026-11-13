---
id: a047a703-57e7-4c34-86f1-ad1b512625be
date: 2026-11-13
---
## 2026-11-13 — On the Flat graph a deselect returns a view the reader has not moved

**Why**: in the installed app at 1383x868, selecting one capability from the overview zoomed the map 1.7x; letting go left that zoom, with three of the four domains cut by the window edge or under the explorer and one domain's name not drawn. One click and its undo left a worse view than the reader started with, and only the fit control recovered it.
**Prior**: overturns one sentence of `decisions/2026-11-13-flat-selection-one-frame-f11219c8-b204-4313-ae82-36e150092e44.md`: "Escape clears the selection and chrome and leaves the camera". The rest of that record stands, including one frame for every selection source. It restores the 2026-10-15 rule (`decisions/2026-10-15-flat-click-selects-f4310914-5d7b-4586-b605-489c6388a921.md`) that one Escape returns the camera the selection moved from, now for canvas clicks as well.
**Decision**: letting go of a selection, by Escape, the panel's close or a click on empty map, slides the camera back to where it was before the first selection of the chain, when the reader has not panned or zoomed since the selection framed it. A view the reader moved is theirs and stays. A selection that arrived framed by a deep link, with no earlier view to return to, goes to the overview. An arrow-key walk recentres as it goes and counts as the reader travelling: letting go after it stays where the walk arrived. A view kept across a window resize is returned to as it was.
**Dissent**: a reader who selected to travel, then let go meaning to stay there, is carried back; before the selection frame zoomed, staying was harmless and matched tools where a click never moves the camera.
**Falsifier**: readers report being pulled away from a place they meant to stay after closing the panel; or the selection frame stops zooming, so staying costs nothing again.
**Owner**: stark
