---
id: d2b53e3e-a379-4367-8b85-815bb7cc8894
date: 2026-10-06
kind: gate-gap
status: reported
harness_area: ci-impact
---
**Observed**: Release train #2547 failed `pnpm test:ci:impact`: the tracked-path inventory reported `patches/three@0.185.1.patch` as an unknown namespace. Focused implementation checks and pre-push had passed before the exhaustive inventory ran in CI.
**Cost**: One failed release train and a repeated push/CI cycle.
**Suspected cause**: The first pnpm patch introduced a runtime-dependency namespace without registering it in the impact planner.
**Proposed change**: script. Treat `patches/` like the root dependency manifest, retain exhaustive lanes, and test both known-path coverage and exhaustive routing. Each missing condition was reproduced as RED before restoring GREEN.
