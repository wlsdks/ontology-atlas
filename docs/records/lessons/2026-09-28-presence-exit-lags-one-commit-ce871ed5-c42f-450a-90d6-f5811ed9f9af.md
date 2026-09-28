---
id: ce871ed5-c42f-450a-90d6-f5811ed9f9af
date: 2026-09-28
kind: mistake
status: reported
harness_area: motion
---
**Observed**: On `design/library-round`, the document-list fold in `src/views/docs-vault/ui/DocsVaultPage.tsx` first switched its exit overlay on `usePanelPresence(!collapsed).exiting`. An rAF sampler on the static export (1512x949, port 3972) read the list at width 0 on the first frame after the click (t=25 ms) and the fading overlay only from the next one (t=32 ms, opacity 1): a one-frame blink. `exiting` is set in an effect, so on the first commit after a close it is still false while `mounted` is still true. Deriving the state as `mounted && !open` removed the blink (first frame already at opacity 1, then 0.96, 0.85, ...).
**Cost**: one extra static build and remeasure, about 3 minutes.
**Suspected cause**: `src/shared/lib/use-presence.ts` returns `exiting` one commit late on close. `Surface` hides this because it keeps its enter class until the flag arrives, but a consumer that hides on `!open && !exiting` draws the closed state for one frame.
**Proposed change**: script. Return `exiting` from `usePanelPresence` as `mounted && !open` rather than from effect state, so every consumer gets the exit state in the same commit as the close.
