---
id: fc450816-41ee-46b5-b173-494e8a0865a3
date: 2026-09-29
---
## 2026-09-29 — Shared primitives own the page title, the close and the overlay clock

**Why**: the 2026-09-29 audit measured 11 page h1s in 7 styles, 4 lede pairs, 4 close buttons (28/32px, glyphs 10–16px), overlay opacity on the expo curve with a decelerating exit and a scrim 60ms longer than its surface, and 12–16px icons beside words doubled at 200% text size.
**Prior**: extends 2026-08-09 page frame and the 2026-08-15 two-tier dialog widths; overturns 2026-09-12's "icons stay px" clause for content icons only.
**Decision**: `PAGE_TITLE`/`PAGE_LEDE` in `page-frame.ts`, gated per member h1. `CloseButton` is the one close (`--overlay-close-size`, 14px glyph). `--dialog-w-lg`/`--dialog-h-lg` (880/672) replace settings' literals. The overlay spring moves position only; opacity eases on `--motion-ease` both ways, movement leaves on `--motion-ease-exit`, scrim on the surface's clock. `--icon-*` are rem, bound to lucide 12/14/16 at zero specificity: 0 differing pixels on three 1440x900 screens at a 16px root.
**Dissent**: an icon is a box; kept for chrome and rail icons. One exit curve for every property, as framer does; it left 26% of the View menu on its last frame.
**Falsifier**: a content glyph clipping its control at 200%; a destination h1 off 23/28/510; a close off 32px on a fine pointer; a scrim painted after its surface unmounts.
**Owner**: Stark
