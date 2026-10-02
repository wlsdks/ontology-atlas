---
id: 645411dd-e664-4f38-9a81-d5dbece59056
date: 2026-10-02
---
## 2026-10-02 — The map moves with the hand, and its drag and zoom speed are settings

**Why**: the owner found dragging slow in every view and asked to set drag and zoom speed. Measured on the static export (headed Chromium, Metal, 120 Hz): pans already tracked 1:1, but a wheel notch showed 1.5% of its step in the first frame and 90% after 280 ms; a trackpad pinch zoomed x1.17 for a x2 spread (Chromium sends deltaY = -100 ln(spread), read at the 0.0023 wheel rate); a flick glided 0.5 s of its speed and overshot up to 15 px; Strata trailed the pointer up to 10 px, its element ring 13 degrees, and coasted half a turn in 1.1 s.
**Prior**: overturns the flick bounce (damping 0.82) and the 0.998 projection in `docs/design/interaction.md` section 1, the 14 ms orbit smoothing, and hand-drag torsion from 2026-08-18 (80); torsion on programmatic pose moves stands. Specialises d353955a (motion identity); the camera's two springs keep their values.
**Decision**: pans and orbits follow the pointer directly. A flick glides as friction: critically damped, time constant `--motion-base` (180 ms), distance speed x 180 ms; the orbit coast shares it; reduced motion keeps no glide. A notch or +/- eases about the pointer (or centre) with tau = `--motion-fast`/3, 95% in 120 ms, the point under the pointer fixed. A pinch applies exp(-deltaY/100) at once. Settings > Map adds Drag speed and Zoom speed, 0.5x to 2x in five steps, default 1x, per machine: drag speed scales pan, orbit and flick per pixel (node drags stay glued); zoom speed is the power of every wheel, pinch and key factor, in every view.
**Dissent**: a shorter glide takes more strokes across a big map at 1x; without torsion Strata's rings turn as one block; above 1x the map leaves the pointer.
**Falsifier**: a renewed slow report at 1x while notch t90 <= 110 ms, pinch x2.00 per ln 2 and pan ratio 1.00 hold, or a report that flicks stop short, reopens the glide constant; a report that Strata feels rigid under the hand reopens hand torsion.
**Owner**: Stark; requested 2026-10-02, this record awaits review.
