---
title: Guided tour
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Guided tour

#### Guided tour (`topology-tour-button`, 2026-07-23, `src/features/guided-tour`)
- **Compass** tile, just above the "?" tile — A guided tour handling only the map screen, teaching how to read what the images on this screen mean. Appears only at `md` width or larger (`hidden md:flex`, does not appear on phone).
- **Starts automatically on first visit (2026-07-24 First Use Flow Cleanup)** — When sample data screen is settled and `guided-tour:v1` record does not yet exist, it starts automatically once after 900ms. Skipping records as `skipped` so it does not appear again even if revisited; does not start at all for users opening their own vault. Silently skips if a modal (`aria-modal`) is open at that moment, browser window loses focus, or tour is already open (`canAutoStartGuidedTour` — guard against overlapping temporary screens). Two ways to open manually: compass tile, and "Take 2-minute tour" button on the first run card.
- 8 declarative steps, plain-language copy, no jargon even for "ontology" itself: map=document (1) · dot size/shape (2, attached to canvas nodes) · relationship legend (3) · try clicking yourself (4 — waits until user actually clicks before moving next) · data sheet (5, shown only if node was actually selected in step 4) · INDEX (6) · filter showing only recent changes (7, branches here to "Tour complete" or "I'm a developer") · skip to agent (8, when going developer side — highlights `FirstRunStarterModule`).
- Each step's anchor auto-skips (and the `N/M` progress-dot denominator shrinks) when its target isn't resolvable — missing element, `display:none`, or off-viewport.
- Highlight technique: a `box-shadow: 0 0 0 9999px` scrim-and-cutout paint (not a glow ring — `blur 0`), CSS-transitioned (180ms) between DOM-anchored steps, and a per-frame `worldToScreen` canvas projection (same technique as the realm "deploy" button) for the two canvas-node steps — both painted on the same z-70 overlay layer so every step dims the surrounding chrome identically.
- The interactive step 4 is a click **funnel**, not a free-for-all: a 4-strip transparent blocker leaves only the spotlit domain dot's cutout clickable (chrome — the tour tile itself, search, "?" — stays blocked), and the anchored dot is a spine-visible domain whose click deterministically opens the datasheet.
- Opening the tour demotes other transient surfaces (shortcuts sheet, docs drawer, create-node composer, search palette) and temporarily hides `SampleNodeHint`; `Esc` closes only the tour (ladder tier between the context menu and the create-node composer — the first-run starter's capture-phase Esc yields while the tour overlay is open).
- Focus follows the dialog card on open/step change and returns to the launcher tile on close; the "I'm a developer →" branch button only renders when its step-8 anchor (the first-run starter card) is still present.
- Completion/skip status persists to `localStorage` (`guided-tour:v1`) but never blocks re-running the tour from the same tile.
