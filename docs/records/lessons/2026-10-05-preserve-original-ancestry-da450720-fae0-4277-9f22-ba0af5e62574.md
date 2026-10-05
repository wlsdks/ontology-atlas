---
id: da450720-fae0-4277-9f22-ba0af5e62574
date: 2026-10-05
kind: gate-gap
status: reported
harness_area: landing
---
**Observed**: The former landing suite asserted that train merging uses rebase after each component is replaced by a synthetic commit. The owner expected original commits to remain on main. A new real-Git ten-commit probe and transport checks failed against the old implementation: 3 selected tests, 0 passed, 3 failed (squash invoked, rebase selected, and no explicit merge method on the fast path).
**Cost**: Main lost original per-commit ancestry for past compressed PRs; historical scope and recovery cost unknown. Existing published history is intentionally retained.
**Suspected cause**: The regression suite encoded the former compression policy and verified metadata rather than original commit reachability.
**Proposed change**: script and gate. Preserve original commits using merge commits, retain the established safety checks, and test real Git ancestry with ten distinct SHAs, full messages and authors through both landing paths. Capture the production GitHub transport to ensure merge is selected and squash/rebase cannot be sent.
