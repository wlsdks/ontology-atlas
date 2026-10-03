---
id: 4de9aad9-f4d8-4249-92c0-f6173db0a9db
date: 2026-10-03
kind: mistake
status: reported
harness_area: git
---
**Observed**: splitting a mixed flat-dial commit into per-item commits with `git apply --unidiff-zero` of hand-cut hunks (2026-10-03) produced intermediate commits that did not type-check; only the last commit of the series was whole.
**Cost**: a re-split of the series and a re-run of typecheck per commit, about 30 minutes.
**Suspected cause**: zero-context hunks apply without checking the surrounding code, so a hunk that depends on another (an import, a type field) lands in the wrong commit silently.
**Proposed change**: skill, the implementer brief splits commits with `git add -p` on the real tree and runs `tsc --noEmit --incremental false` on each commit before moving on; never `git apply --unidiff-zero`.
