---
id: d806ce25-8e3f-44ae-a54c-93c8aa3695da
date: 2026-09-26
kind: gate-gap
status: reported
harness_area: companion-motion
---
**Observed**: The direct-sector Playwright journey passed with reduced motion, but actual Chrome Computer Use input I followed immediately by Tab moved focus to Chrome's Gemini button while the inventory entered. The test awaited the panel before tabbing. A non-reduced immediate-Tab regression and a layout-effect focus bridge now keep focus inside the game during entry and exit; the same native input read back the panel close button.
**Cost**: One extra implementation and verification cycle; elapsed cost unknown. No CI round was spent on the defect.
**Suspected cause**: Inerting the underlying sector removed its focused element before the entering Surface was ready to receive focus. Reduced-motion setup and waiting for the entered state skipped that interval.
**Proposed change**: gate — when an interaction changes inert or focus ownership during motion, retain one immediate next-key probe with normal motion in addition to settled-state keyboard tests.
