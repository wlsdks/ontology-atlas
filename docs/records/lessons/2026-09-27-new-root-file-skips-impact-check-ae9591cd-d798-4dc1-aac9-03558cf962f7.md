---
id: ae9591cd-d798-4dc1-aac9-03558cf962f7
date: 2026-09-27
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: #2053 added a tracked root file, `.bun-version`. `pnpm checks:changed -- --run` passed 20 of 20 locally without selecting `pnpm test:ci:impact`. The landing train's "Types · Lint · Docs" lane then failed `every currently tracked path belongs to a known impact namespace` with `actual: [ '.bun-version' ]` (run 36356019385). The same file failed two more train runs it rode in (36355781216, and 36355844314 labelled #2065). This is the class of 648dee33 and dbb4417c: the set `checks:changed` recommends is narrower than the lanes that judge the diff.
**Cost**: three failed landing-train runs, and #2065 was held back by the train it shared with #2053.
**Suspected cause**: no focused-check rule selects `pnpm test:ci:impact` when a changed path matches none of `KNOWN_PATHS` in `scripts/classify-change.mjs`, so a new root file is judged only in CI.
**Proposed change**: script: have `checks:changed` select `pnpm test:ci:impact` whenever a changed or added path matches no `KNOWN_PATHS` pattern, reusing that list.
