---
id: 4c50b3c9-1d3f-44b5-94a6-8051010d5b3e
date: 2026-09-26
kind: process
status: reported
harness_area: ci
---
**Observed**: Bundle #1874 took three landings: CI shard 2 stopped at its first failure with "288 did not run", the next run failed on a different spec from that unrun part, then shard 3 on a third. `scripts/run-playwright-ci.mjs` adds `--max-failures=1` when `CI` is set.
**Cost**: Two extra landings, each a lock plus a CI cycle of about 30 minutes.
**Suspected cause**: Fail-fast hides the rest of a shard, so fixing only the visible failure re-lands straight into the next hidden one.
**Proposed change**: skill: after a failed landing, run the whole shard locally on a static build without `CI` before landing again, and `gh pr ready <n> --undo` before pushing a fix.
