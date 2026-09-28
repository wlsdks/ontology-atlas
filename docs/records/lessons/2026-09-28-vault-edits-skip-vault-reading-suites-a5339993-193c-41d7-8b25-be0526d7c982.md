---
id: a5339993-193c-41d7-8b25-be0526d7c982
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: ci
---
**Observed**: #2095 (54bbf0373) added `docs/ontology/capabilities/gray-area-discovery.md`, and the main push reused the verdict of train PR #2098 ("exact Git tree already passed required CI", run 36374552686). On that exact tree `pnpm exec vitest run src/widgets/ontology-map/model/territories-layout.test.ts` failed 6 of 6 ("keeps every disc and every name it draws at rest inside a 1040x720 with INDEX open room"), and on its static build `map-canvas-interaction-placement.spec.ts` MC-02 (1040) and MC-03 (1280) failed. Both suites read the live dogfood vault: the unit test through `resolveStaticVaultSource("dogfood")`, the specs through `dogfoodVaultFiles()`. Later trains whose changes selected the unit test went red on it (runs 36375351377, 36375612696, 36375626977).
**Cost**: three red trains measured on 2026-09-28, and main blocked every landing train until the fix.
**Suspected cause**: `vitest run --changed` follows imports, and the vault reaches these suites as a generated manifest and a file walk, so a `docs/ontology/**` edit selects none of them; `suggestFocusedChecks` recommends vault and docs checks for such an edit but no suite that asserts on the vault's content.
**Proposed change**: gate: map `docs/ontology/**` to the unit suites and e2e specs that read the dogfood vault, in the CI impact plan and the focused-check rules, so a vault edit runs the assertions it can break.
