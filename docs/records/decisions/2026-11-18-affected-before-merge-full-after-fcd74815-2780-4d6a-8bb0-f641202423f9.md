---
id: fcd74815-2780-4d6a-8bb0-f641202423f9
date: 2026-11-18
---
## 2026-11-18 — Trains run affected checks; the push to main runs the full Checks set

**Why**: Over 22 train Checks runs each lane job spent 35 s on setup, 22 s cloning history; the full contract sweep ran on 15 of 18 comparable trains and knip on 21 of 22, failing none. In 56 trains every red Checks lane came from a change-mapped command or a missing install.
**Prior**: Overturns 2026-09-13 reviewed-tree reuse (cf67c7bf) for `checks.yml` main pushes, and the 2026-10-12 clause "a source-reading contract loses reach" (75e77494) before merge only: an unreached tree-scanning contract runs after merge, nightly, and in local `checks:changed -- --run`. `e2e.yml` keeps its policy.
**Decision**: Before merge: affected commands, changed-file lint, typecheck, reached contracts, security, vault-format and forbidden-pattern contracts, and ratchets when code, styles or messages change; knip only when its own scope changes. Every push to main runs the full set, ratchets against the previous tip; `pr:land` warns while it is red. A blobless plan checkout; unit shards split by measured seconds. No fourth shard: its gain is on full runs, now after merge, and trains sit near the 20-job limit.
**Dissent**: Some defects are found after merge: a copy, design-scan or dead-export failure turns main red and the next train inherits it. The post-merge run shares the job limit with the next train.
**Falsifier**: Over the next 30 merges, main's post-merge run is red more than twice for a suite the train skipped, or train jobs queue over 60 s behind a post-merge run.
**Owner**: Atlas maintainer.
