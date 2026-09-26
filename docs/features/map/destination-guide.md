---
title: Destination guide
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Destination guide

#### Destination Guide (`DestinationGuide`, 2026-07-26, `src/features/guided-tour`)
Owner request: *"I wish each LNB tab had its own guide? Currently only the map side has one!"* — Expanded guidance from just the map to the remaining five destinations.

- **Did not create two sets of guidance devices.** Uses the map's tour device (`useGuidedTour`
  state management · overlay darkening screen and showing only one spot · explanation card ·
  progress dot · skip) as is, and swaps in screen-specific step lists into `useGuidedTour({ steps })`. The map's 8-step journey (guidance attached to canvas nodes · step waiting for actual click · developer branch) remains held by HomePage as before.
- **Architecture · Docs Vault · Insights · Project · Agents · Records** each have 2 cards — ① What this screen does (center card not attached to anything) ② One thing to see first here (highlights one actually existing element on screen). Does not list features, only answers "what can be done here" in one question. If the second card's target element is not on screen at that moment (e.g., document list collapsed), it automatically becomes a single card.
- This guidance is held by the app shell (`AppShell`) and re-rendered with `key` every time the screen changes — if each page renders its own, one page missing means no one knows (#65 series misalignment). Does not draw this guidance on the map.
- **Does not interfere** — "Seen" records are kept separately per screen (`guided-tour:<id>:v1`).
  Seeing it on one screen does not make the remaining six screens' guides disappear, and already-seen screens do not auto-appear again. Auto-starting only happens when passing the same conditions as the map (`canAutoStartGuidedTour`).
- **Does not appear at all for those who move first (2026-07-28)** — Auto-appearance guides
  open after 700ms, and if the screen is covered at that time, waits up to 30 seconds. During
  that wait, if the user clicks or presses a key first, **cancels appearing entirely**
  (brought over `watchGuidedTourAutoStartCancel` used by the map). Cards appearing late over someone who started exploring themselves are interference, not guidance. Such cancellations are not recorded as "seen", so the opportunity comes again on next visit.
  Does not appear even on screens where it says "This screen cannot be opened here" (e.g., studio when width is less than `lg`) — introducing a non-existent screen is a lie.
- **View Again** — Settings Menu › Screen › "Screen Guide". Located in the same place on all seven screens (on the map, the top-right compass tile remains the primary entry, this menu row is auxiliary). If each screen had its own help button, the number of buttons would vary per screen, so consolidated into one location in the settings menu always.
- The button on the last card is `[Complete]` not `[Next]` — does not promise a non-existent next chapter (applied same rule to map tour).
