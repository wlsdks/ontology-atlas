---
id: 645411dd-e664-4f38-9a81-d5dbece59056
date: 2026-10-02
---
## 2026-10-02 — The map moves with the hand, and its drag and zoom speed are settings

**Why**: the owner found dragging slow in every view and asked to set drag and zoom speed. On the static export (headed Chromium, Metal, 120 Hz) pans tracked 1:1, but a wheel notch reached 90% after 280 ms; a pinch zoomed x1.17 for a x2 spread; a flick overshot up to 15 px; Strata trailed the pointer up to 10 px.
**Prior**: overturns the flick bounce (damping 0.82) and 0.998 projection in `docs/design/interaction.md` section 1 and hand-drag torsion from 2026-08-18 (80); replaces the 14 ms orbit smoothing with a step spread. Pose-move torsion stands. Specialises d353955a.
**Decision**: pans follow the pointer directly; an orbit does when the pointer reports every frame, else it spreads each pointer step evenly over the frames before the next. A flick glides as friction: critically damped, tau `--motion-base` (180 ms), shared by the orbit coast; reduced motion keeps no glide. A notch or +/- eases about the pointer, tau `--motion-fast`/3. A pinch (Ctrl-wheel in pixel mode under 50 px; a fast Chromium pinch sends at most 18, a Ctrl notch 100; or a WebKit gesture) applies its spread at once. Settings > Map adds Drag speed and Zoom speed, 0.5x to 2x in five steps, default 1x: drag speed scales pan, orbit and flick, never a node drag; zoom speed is the power of every wheel, pinch and key factor.
**Dissent**: a shorter glide takes more strokes across a big map; without torsion Strata's rings turn as one block; above 1x the map leaves the pointer. Dropping orbit smoothing outright brought back the staircase: a 60 Hz pointer on 120 Hz left 57 of 114 frames still (CV 1.0, like a Flat pan) against 0 smoothed (CV 0.33, lag 1.5-4.7 px); the spread: 0 still, CV 0, lag 1.6 px at 3 px a step, 0 at 120 Hz.
**Falsifier**: a renewed slow report at 1x while notch t90 <= 110 ms, pinch x2.00 per ln 2 and pan ratio 1.00 hold reopens the glide and step constants; a report that Strata feels rigid reopens hand torsion.
**Owner**: Stark; requested 2026-10-02, this record awaits review.
