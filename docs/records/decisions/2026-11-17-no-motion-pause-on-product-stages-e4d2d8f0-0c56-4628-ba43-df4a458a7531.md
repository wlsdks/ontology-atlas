---
id: e4d2d8f0-0c56-4628-ba43-df4a458a7531
date: 2026-11-17
---
## 2026-11-17 — Only the download page draws a motion pause; product screens do not

**Why**: The owner saw a "Pause motion" button under the empty Planning and Automations stages inside the app and asked why a product screen carries it. It arrived the same day with the looping stage artworks (commit 9906fc0d2), on the reading that WCAG 2.2.2 asks every page of self-started loops for a visible pause. Inside the product it is one more control on a screen whose job is a single action, and the reduced-motion preference already stops these loops.

**Prior**: Narrows the sentence added to "Smoothness first" item 4 of `docs/DESIGN-SYSTEM.md` with 9906fc0d2 (a commit, no record). Keeps 47a68bab-86fa-404a-ba0c-50426c10a06d (the download page's pause) and returns product screens to 1a879ed6-3d92-4172-9901-4ad39ebcdf58: reduced motion is the stop control.

**Decision**: `FeatureStage` draws no pause and its artworks take no paused state. The download page keeps its pause and the store behind it. A choice stored from an in-app stage no longer freezes a stage, because stages stop reading the store.

**Dissent**: A person who wants a looping stage still, without turning on the system's reduced-motion setting, has no control for it; the stages show only until the first plan source or schedule exists.

**Falsifier**: A person reports a stage's loop distracting them from its action, or an accessibility audit the product must pass fails on 2.2.2 for a product screen.

**Owner**: stark
