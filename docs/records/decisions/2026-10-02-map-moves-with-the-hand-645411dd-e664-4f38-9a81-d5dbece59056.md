---
id: 645411dd-e664-4f38-9a81-d5dbece59056
date: 2026-10-02
---
## 2026-10-02 — The map moves with the hand, and its drag and zoom speed are settings

**Why**: the owner found dragging slow and asked to set drag and zoom speed. At 120 Hz pans tracked 1:1, but a wheel notch reached 90% after 280 ms; a pinch zoomed x1.17 for a x2 spread; Strata trailed the pointer up to 10 px.
**Prior**: overturns the flick bounce (damping 0.82) and 0.998 projection in `docs/design/interaction.md` section 1 and hand-drag torsion from 2026-08-18 (80); replaces the 14 ms orbit smoothing with a step spread. Specialises d353955a.
**Decision**: pans follow the pointer directly; an orbit does when the pointer reports every frame, else it spreads each pointer step evenly over the frames before the next. A flick glides as friction: critically damped, tau `--motion-base` (180 ms), shared by the orbit coast; reduced motion keeps no glide. A notch or +/- eases about the pointer, tau `--motion-fast`/3. A pinch applies its spread at once: a pixel-mode Ctrl-wheel run starting under 50 px stays one until a 300 ms pause (pinch events: 1-18 px, 50-70 fast or coalesced; a Ctrl notch: 100), or a WebKit gesture, where Ctrl-wheel is never a pinch. Settings > Map adds Drag and Zoom speed, 0.5x-2x in five steps, default 1x: drag speed scales pan, orbit and flick, never a node drag; zoom speed powers every wheel, pinch and key factor.
**Dissent**: a short glide needs more strokes on a big map; without torsion Strata's rings turn as one block; above 1x the map leaves the pointer. Without orbit smoothing a steady 60 Hz pointer on 120 Hz left 57 of 114 frames still, 0 smoothed (lag 1.5-4.7 px); the spread leaves 0, lag 1.6 px at 3 px a step. Irregular input is spread only partly (simulated): jitter or one frame in seven dropped leaves 17-22% still (direct 42-50%), a 90 Hz pointer 25% like direct.
**Falsifier**: a slow report at 1x while notch t90 <= 110 ms, pinch x2.00 per ln 2 and pan ratio 1.00 hold reopens the glide and step constants; Strata reported rigid reopens hand torsion.
**Owner**: Stark; requested 2026-10-02, this record awaits review.
