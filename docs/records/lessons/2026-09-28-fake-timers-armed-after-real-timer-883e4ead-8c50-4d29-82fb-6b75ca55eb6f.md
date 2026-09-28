---
id: 883e4ead-8c50-4d29-82fb-6b75ca55eb6f
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: testing
---
**Observed**: on `perf/agent-idle-shutdown` (#2133), `src/features/acp-session/model/use-acp-session.test.tsx` "keeps the adapter while the dock is open" stayed green with `putAway` deleted from the idle-stop guard. The test called `vi.useFakeTimers()` after the session reached `ready`, so the effect had already armed a real 10-minute `setTimeout` that advancing fake time cannot fire. A plain `send()` inside one `act()` did not help either: `thinking` and `ready` landed in one render, so the effect never re-armed. Only a held prompt, finished in a second `act()`, re-armed the timer under fake timers and turned the mutation red.
**Cost**: two probe rounds, about five minutes; without the mutation probe the test would have shipped passing vacuously.
**Suspected cause**: fake timers replace only timers created after `vi.useFakeTimers()`, and Testing Library's `waitFor` pushes a test to reach its starting state on real timers first.
**Proposed change**: rule: one line under "The timing rule" in `.claude/rules/testing.md`: a test of a timer-driven effect must arm the timer after `vi.useFakeTimers()`, through a state change that renders on its own, and it counts as proof only once deleting the guard it asserts turns it red.
