---
id: 1a879ed6-3d92-4172-9901-4ad39ebcdf58
date: 2026-11-16
---
## 2026-11-16 — Ambient and decorative motion has no time limit, and the download page is a showcase
**Why**: The owner (2026-11-16) judged the download page still far from top quality and asked that rules like "stops within five seconds" be removed. The bound held decorative motion to a short burst, the fact-per-effect rule kept the public page from carrying effects that only set a mood, and the one-figure-at-a-time clause kept sections from moving together.
**Prior**: Overturns the five-second bound added to "Motion" in `docs/DESIGN-SYSTEM.md` on 2026-10-21 and its Moru exemption (0c200719-2428-448f-b238-fee3c60f9dd9), which it makes general. Overturns the "one figure plays at a time" clause of 2026-10-03 (36af7b02-78cb-441f-9c92-ad20cf7db271); that record's in-view rule, compositor-only loops, reduced-motion stillness and its 2% dropped-frame falsifier stand.
**Decision**: Ambient, decorative and character motion may loop for as long as it is visible; the reduced-motion preference is its stop control. Loops still pause hidden or offscreen and stay compositor-only. In the app every mark keeps carrying a fact; the public download page is a showcase whose effects, backgrounds and motion graphics need no fact behind them, only smoothness and reduced motion.
**Dissent**: WCAG 2.2.2 asks that motion starting by itself and lasting over five seconds can be paused, stopped or hidden by a control on the page; it does not count an operating-system setting. A visitor without the reduced-motion setting who finds a loop distracting has no way to stop it.
**Falsifier**: A visitor reports a loop on the page distracting them from the text beside it; an accessibility audit the project must pass fails on 2.2.2; or a scroll at 1440×900, 1040×720 or 1920×1080 drops over 2% of frames.
**Owner**: Project owner, 2026-11-16.
