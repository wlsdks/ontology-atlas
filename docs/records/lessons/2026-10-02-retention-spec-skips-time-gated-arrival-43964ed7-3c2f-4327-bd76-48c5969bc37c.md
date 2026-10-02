---
id: 43964ed7-3c2f-4327-bd76-48c5969bc37c
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: on `fix/progressive-vault-load` (#2313), `vault-switch-release.spec.ts` passed in every local `checks:changed` run and failed 3 of 3 in landing train run 37002053785: 23 large arrays with one folder open, 25 after two switches. Its 1,001-document folder is read before the 200 ms partial-publish delay on a fast machine, so the arrival path the spec should guard never ran locally. At 4x CPU throttle it failed 3 of 3, while main stayed at 23. A heap snapshot traced it to `FirstRunStarterModule`: mounted during arrival, a `useCallback(..., [])` shared its V8 closure context with the arriving vault value, which carried the partial manifest.
**Cost**: one red train round across the batch, plus about 40 minutes of triage.
**Suspected cause**: the retention spec measures whatever path the machine's speed selects. A time-gated branch (here the partial publish after 200 ms) is covered only on runners slow enough to reach it.
**Proposed change**: gate: a retention or switch spec that guards a time-gated path makes that path run on every machine, either with CPU throttling through CDP or with a folder large enough to cross the delay, and asserts that it ran (for example that `data-vault-load-progress` appeared) before it counts objects.
