---
id: 7d693e4f-7d5f-4daa-a88a-e753ef50ee10
date: 2026-10-02
---
## 2026-10-02 — Text size in three steps

**Why**: the app had no zoom, so a person who needs larger text had no way to get it.
**Prior**: builds on the 2026-09-12 rem ramp; keeps the locked chrome geometry of 2026-07-24. Uses the root font size, not CSS zoom, after the owner reported blur from fractional zoom on 2026-07-23.
**Decision**: Screen · language offers Default, Large and Larger (100, 112.5 and 125% of the root), stored per computer in `atlas.appearance.text-size` and applied as `data-text-size` on `<html>` by the boot script before the first paint; Default removes the attribute. Rem breakpoints do not move. Buttons, bars and names drawn on the map canvas keep their size, and the caption says so. The settings left list widens with the text.
**Dissent**: chrome labels grow inside fixed boxes.
**Falsifier**: cut text or overlap at Larger on the four text-zoom routes at 1040 and 1512, or a report of blur.
**Owner**: Stark
