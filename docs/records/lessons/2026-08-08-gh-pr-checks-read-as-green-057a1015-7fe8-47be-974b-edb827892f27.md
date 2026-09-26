---
id: 057a1015-7fe8-47be-974b-edb827892f27
date: 2026-08-08
kind: mistake
status: reported
harness_area: ci-status
---
**Observed**: A landing watcher read `gh pr checks <N>` with `awk '{print $2}'`. The output is tab-separated, so check names containing spaces shifted the status column, and the empty output printed before checks register was counted as zero failures. Seven pull requests (#987, #988, #990 to #994) merged red; #987 had broken two e2e specs.
**Cost**: Seven red merges and the repair after them.
**Suspected cause**: Whitespace field splitting on tab-separated output, and reading "no data" as green.
**Proposed change**: script: read check state from JSON and treat a missing or empty result as undecided, never green.
