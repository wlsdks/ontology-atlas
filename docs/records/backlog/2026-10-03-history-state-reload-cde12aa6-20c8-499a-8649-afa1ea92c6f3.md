---
id: "cde12aa6-20c8-499a-8649-afa1ea92c6f3"
date: "2026-10-03"
task: "HISTORY-STATE-RELOAD"
status: "ready"
parents: []
worktree: "main-5"
---
**Task**: find why a static-export page sometimes reloads itself mid-session after a scroll or back/forward step.

**Evidence**: `tests/e2e/download-visibility-gate.spec.ts`'s opt-in parked leg (1440×900) failed 1 in 9 runs on #2436 because the page reloaded mid-test; fuzzing the figures' turn-taking over 4,000 steps found no fault there. Suspected cause, not yet proven: Next.js reloads on a `popstate` whose `history.state` lacks its own marker, and `src/shared/lib/history-write-guard.ts` writes history state without that marker.

**Done when**: a reproduction shows (or rules out) the reload from a guard-written history entry, and the guard keeps Next's marker if it is the cause.
