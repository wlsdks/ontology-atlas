---
id: 18ea6278-c9d1-48ea-8661-cec45e28076a
date: 2026-10-24
---
## 2026-10-24 — Narrow map selections temporarily fold the index

**Why**: actual 1040 px branch-map selection with INDEX and inspector leaves about 280 px of map. A selected capability name ended 6 px from its inspector; fitting a domain card and its outward names into that span shrinks or hides names.
**Prior**: narrows only the 1024 px INDEX threshold in `decisions/2026-10-15-flat-click-selects-f4310914-5d7b-4586-b605-489c6388a921.md`. Its same-scale canvas click, intentional framing gestures and Escape recovery remain. Current branch geometry falsifies the earlier assumption that a 260 px free span is enough.
**Decision**: on Flat below 1280 px an inspector temporarily folds INDEX, including selections originating from a tree row. Closing the inspector restores the stored preference. Explicit tab reopening or an expanded-index deep link still wins for that selection. Wider windows retain both panels. Existing surface-swap motion coordinates the fold and camera free-area measurement.
**Dissent**: tree readers need to reopen INDEX to continue scanning with details visible at narrow widths. This preserves that explicit choice rather than permanently changing their preference.
**Falsifier**: a selected mark or name remains under a panel, the index cannot be reopened, closing the inspector fails to restore its previous preference, or the fold causes repeated camera jumps.
**Owner**: Stark
