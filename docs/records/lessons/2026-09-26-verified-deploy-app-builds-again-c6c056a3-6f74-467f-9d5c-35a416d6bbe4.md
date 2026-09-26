---
id: c6c056a3-6f74-467f-9d5c-35a416d6bbe4
date: 2026-09-26
lesson: 612f3882-1faf-44bc-8b5a-87857b692496
status: verified
parents: 612f3882-1faf-44bc-8b5a-87857b692496
---
**Evidence**: scripts/deploy-macos-app-local.mjs:151 plans `pnpm desktop:build:app:local` unless `--skip-build` is passed, so the chained command builds twice; timing still unmeasured.
