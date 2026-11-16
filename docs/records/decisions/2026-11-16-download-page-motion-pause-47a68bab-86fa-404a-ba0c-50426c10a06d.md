---
id: 47a68bab-86fa-404a-ba0c-50426c10a06d
date: 2026-11-16
---
## 2026-11-16 — The download page offers one on-page pause for its motion
**Why**: Removing the five-second bound (1a879ed6-3d92-4172-9901-4ad39ebcdf58) left reduced motion as the only stop, and its dissent held: WCAG 2.2.2 (level A) asks for a control on the page for motion that starts by itself and lasts over five seconds, and the hero clip already looped 37 s with no control. The owner asked to keep accessibility while adding more motion.
**Prior**: Narrows 1a879ed6-3d92-4172-9901-4ad39ebcdf58: loops keep no time limit, but a page of them now carries a visible pause.
**Decision**: One "Pause motion" control, in the hero's chip row and the footer, stops the clip, Moru, every CSS scene loop and the canvas frame loop at once; scroll-driven drawing still follows the scroll. The choice is remembered in the visitor's browser only. Under reduced motion nothing loops and the control is hidden.
**Dissent**: The control is one more chip in the hero; a visitor who never needs it still reads it.
**Falsifier**: With the control pressed, any part of the page still moves without input, or the choice is forgotten on reload in a browser that allows storage.
**Owner**: Project owner, 2026-11-16.
