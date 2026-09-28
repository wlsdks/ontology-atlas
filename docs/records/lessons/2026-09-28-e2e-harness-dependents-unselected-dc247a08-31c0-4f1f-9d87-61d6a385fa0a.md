---
id: dc247a08-31c0-4f1f-9d87-61d6a385fa0a
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: Train #2086 ejected #2056 (run 36360347334). `tests/e2e/map-toolbar-popovers.spec.ts` and `tests/e2e/map-toolbar-no-overlap.spec.ts` waited 30 s for `getByTestId('agent-activity-bell')` and found 0. The app had moved the activity-log read to a new native command, `read_vault_text_tail`, and `tests/e2e/desktop-rail-arrival-harness.ts` had no case for it. The harness rejected it as `unstubbed native command`, and the product's reader swallowed the rejection as an empty log. The same branch had already edited that harness, for raw-byte binary reads. CI's `buildImpactPlan` treats any non-spec file under `tests/e2e/` as a full-suite input (`E2E_FULL_INPUTS`), so the train ran every spec. Locally, `pnpm checks:changed -- --run` passed 31 of 31 twice. Its e2e lane ran only the five changed spec files and web smoke, none of the ~30 specs that import the edited harness.
**Cost**: one train ejection (shard 4/5 ran 771 s and stopped at `--max-failures=5`) and a second landing round; about 45 minutes of diagnosis and re-verification.
**Suspected cause**: when an e2e helper changes, the local suggester and CI's planner disagree. CI runs the whole suite. The suggester runs the changed spec files only, and says nothing about the helper's dependents.
**Proposed change**: script. When a non-spec file under `tests/e2e/` changes, `checks:changed` names the specs that import it, and runs them under `PLAYWRIGHT_STATIC=1` with `--run`. At minimum, it prints that CI will run the full suite.
