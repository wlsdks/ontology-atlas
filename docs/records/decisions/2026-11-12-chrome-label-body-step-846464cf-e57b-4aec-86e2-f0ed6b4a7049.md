---
id: 846464cf-e57b-4aec-86e2-f0ed6b4a7049
date: 2026-11-12
---
## 2026-11-12 — Chrome labels take the body step every other 36px control wears

**Why**: owner, 2026-11-12 (in Korean), asked whether the map's top labels should grow from 11px to 12.5px: grow them. The control census behind "A control's height picks its type" left chrome labels as a named gap: a 36px map chip read 11px beside 36px buttons and fields at 12.5px.
**Prior**: overturns one clause of the fixed-scale contract (owner, 2026-07-24, `docs/DESIGN-SYSTEM.md` "Scale fixed contract"): chrome labels use `text-label`. That size was fixed when chrome rendered at the 16px root through a class-merge defect and four reports said chrome was too large; the defect is gone. The 36px tile, the rail icon step, the zoom rule and the faces stand. Closes the chrome gap named in 2026-11-12 "A control's height picks its type" (1b0b79d3).
**Decision**: `ChromeChip`, the status chip class, the labelled `ChromeTile` and the change announcement wear `text-body` with its tracking. The agent sentence cap grows from 192px to 224px, the same ratio as the type, so the idle sentence that fit at 11px still ends. The gate drops its chrome exception.
**Dissent**: the top row is 12.5px louder over a canvas whose own labels are small, and a chip row holds fewer words before it folds; a live agent sentence longer than 224px still truncates.
**Falsifier**: the owner reports the map's top row as too large again; a chrome label that fit at 11px clips at 1280px wide in ko, en, ja or zh; or the top row overlaps or scrolls at the 1040px minimum.
**Owner**: Stark
