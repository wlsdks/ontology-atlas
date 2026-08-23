---
name: responsive-sweep
description: Live-verify layout across tablet, laptop, and wide breakpoints by measuring rects, elementFromPoint occlusion, bottom-tab reserve, and screenshots.
---

# Responsive sweep

- A **breakpoint** is a width where layout changes (`md` 768px, `lg` 1024px).
- A **rect** is the measured `getBoundingClientRect()` geometry.
- **Chrome** is the frame around content: header, toolbar, tab bar, and panels.

Static class reading missed three live defects: `max-lg:pb-*` lost to a later
`md:py-*` rule at 768–1023px, three chrome rows overlapped by 79px, and a tab bar
intercepted content. Only computed geometry and `elementFromPoint` proved them.

## Width matrix

| Viewport | Band |
|---|---|
| 600×900 | phone/small portrait tablet; below `md` |
| 768×1024 | `md` boundary; side panels begin, tab bar remains |
| 834×1112 | 11-inch tablet |
| 1024×768 | `lg` boundary; vertical navigation begins, tab bar leaves |
| 1440×900 | 14-inch laptop; labels progressively compact |
| 1920×1080 | FHD |
| 2560×1440 | QHD |

Measure only affected bands for a narrow change; run the full matrix for chrome,
layout, or breakpoint-contract changes.

## Loop at each width

1. Resize and navigate to a URL reproducing the exact state, such as
   `?index=expanded` or `?recent=auto`. Always add `?guides=off`; the first-run
   overlay otherwise captures every `elementFromPoint`. Use `?guides=reset` only
   when testing the guide itself.
2. Evaluate geometry:
   - collect fixed/floating rects and calculate their intersection in pixels;
   - probe the centre of every important control with
     `document.elementFromPoint(cx, cy)` and record the intercepting element;
   - below `lg`, compare the primary tab bar's top with the last scrolled
     content's bottom and every bottom-attached panel.
3. Capture a screenshot for human evidence.

## Standing rules

- `docs/DESIGN-SYSTEM.md`, “Touch & tablet responsive contract,” is canonical.
  Below `lg`, scroll ends and bottom panels reserve
  `--topology-mobile-bottom-tab-reserve`. Expanded INDEX becomes a full-screen
  sheet below `md`. Coarse-pointer 44px targets are decided only by
  `@media (pointer: coarse)`.
- Tailwind `max-*` output may precede `min-*`, so `max-lg:pb-X` can lose to
  `md:py-Y`. Prefer an unconditional base plus `lg:` override and measure the
  computed `paddingBottom`.
- Top utility chips intentionally compact below `2xl`. After adding one, measure
  its overlap with search at 1440px.

## Report

Use a viewport-by-screen table with pass/defect, numeric evidence, screenshots,
the applied fix, and the remeasured value. Do not claim “responsive is fine” from
Tailwind reasoning alone.
