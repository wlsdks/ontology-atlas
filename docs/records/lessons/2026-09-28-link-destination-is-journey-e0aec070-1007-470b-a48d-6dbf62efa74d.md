---
id: e0aec070-1007-470b-a48d-6dbf62efa74d
date: 2026-09-28
kind: mistake
status: reported
harness_area: design-route
---
**Observed**: on #2155 round one I ran `pnpm design:route -- --change=copy,local-visual,interaction`, which returned `proof=checks:changed:changed-paths,design-audit:affected-state,computer-use-loop:affected-state`, although the Library link now opened the schedule it named instead of the first one. In round two, adding `journey` returned `user-walkthrough:changed-path` as well. The walkthrough had been neither routed nor run, and the round-one PR body reported the narrower route.
**Cost**: unknown; the routed walkthrough is still unrun for #2155.
**Suspected cause**: I chose change classes from what the diff touched (words, colours, a button) instead of from the journey. A one-line `href` change read as `interaction`, while `journey` is the class for a changed destination.
**Proposed change**: script — the `pnpm design:route` help for `journey` adds that a link or door that now lands on a different item or selection counts.
