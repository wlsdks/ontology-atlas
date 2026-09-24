---
id: 1bde932e-654f-40fd-8daf-d3a989f4ecb7
date: 2026-09-24
---
## 2026-09-24 — Toasts stand at the bottom of the free lane, and the agent status joins the bell

**Why**: the owner, on the installed map during an in-app turn: *"the toast at the top — the design is poor, the colour too, and the position"*. With a folder open and a live heartbeat, measured before: the top-centred toast lay over INDEX at 1040 (310–730 over 88–388) and over the open panel by 114px; the status line under the toolbar covered the search lane's auto-arrange button at 1040; at 1512 with the panel open the toast covered that line. Tone was a 32px colour-filled tile on shadow tier 2 (the ladder says 1).
**Prior**: overturns 2026-09-06 "toasts stand under the top toolbar" and 2026-09-07 "Toasts centre on the viewport, not on the map area" (its falsifier, a toast over a dock, is the 1040 measurement). Keeps 2026-09-12 "The Library's toast stands in the corner of the pane it is about". Applies 2026-09-19 "nothing said twice" to the in-app turn's status.
**Decision**: the toaster is bottom-centred between the innermost walls a screen declares (`data-toast-wall`: nav rail, INDEX, map panel) and above its floor walls (map readout, first-visit hint), measured only while a toast stands; below a 360px lane it uses the viewport. One neutral box, four tones as a 14px glyph (success, neutral, warning, error; 5.32–9.68:1 on the box). The agent status is the bell's left segment in the toolbar row, folds to dot plus elapsed when the lane is compact, and leaves the toolbar while the conversation panel shows the in-app turn. After, at 1040/1512/1920, panel open and closed: no overlap, centre within 2px.
**Dissent**: 2026-09-06 held the eye is at the top where the toolbar is; a bottom toast may go unseen during a long read of the map. Moving the node link into the status view costs a press.
**Falsifier**: a person who misses a toast they needed because it stood at the bottom; a bottom toast over a control someone was about to press; a person who cannot tell an in-app turn is running with the panel closed.
**Owner**: Stark
