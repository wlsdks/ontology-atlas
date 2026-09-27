---
id: 32a31859-1e49-4440-b244-cffb559b8169
date: 2026-09-27
kind: gate-gap
status: reported
harness_area: checks-changed
---
**Observed**: recurrence of 648dee33, measured in CI's own plan. `buildImpactPlan({ files: [path] })` (`scripts/classify-change.mjs`) gives `unit.contract=skip` for `app/styles/tokens.css`, `app/globals.css`, `src/shared/lib/cn.ts`, `src/shared/lib/format.test.ts`, `tests/e2e/page-frame.spec.ts`, `scripts/desktop-smoke.test.mjs`, `mcp/src/analyze.test.mjs`, `cli/src/integration.test.mjs` and `scripts/quality/source-language/test-titles.mjs`. So a CSS-only change runs neither token gate, and `test-title-language` and `source-comment-bytes` run only when a `.tsx` file, a non-test `tests/contract/` file or a parser path is in the diff; contract tests alone run just themselves. #2050's own diff (106 paths) runs 77 contracts `focused` without either, so the census rewrite would not run the census.
**Cost**: unknown; any PR confined to those paths merges without these gates.
**Suspected cause**: CI's unit lane derives contract files from the focused-check suggestions, and no rule routes a stylesheet or a non-`tsx` source path to the contracts that measure it.
**Proposed change**: script: a rule in `scripts/lib/check-rules/` that names the exact contract files, so CI runs them `focused`: the token gates for `app/(globals|styles/*).css` and `src/**`, and the per-area ratchets for any supported source path in an area.
