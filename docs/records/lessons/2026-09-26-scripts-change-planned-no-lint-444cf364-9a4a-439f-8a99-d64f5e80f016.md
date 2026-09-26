---
id: 444cf364-9a4a-439f-8a99-d64f5e80f016
date: 2026-09-26
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: #1919 changed only scripts/ files; its CI plan had no lint, so an unused `trainOf` in scripts/pr-land.test.mjs landed on main. The next change whose plan ran the whole-repository `pnpm lint` (#1913, train #1921) went red on it and was ejected.
**Cost**: one red train (about 5 minutes of gates) and an ejected unrelated pull request.
**Suspected cause**: the direct lint suggestion matched only src/ and app/ TypeScript, while the full lint lane covers scripts, tests and packages.
**Proposed change**: script: suggest `eslint --max-warnings 0 --no-warn-ignored` for every other changed JS/TS path, which also puts it in the CI plan.
