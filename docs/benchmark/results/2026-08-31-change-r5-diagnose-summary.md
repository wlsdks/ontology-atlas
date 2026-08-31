# Meaning-to-change benchmark — 2026-08-31-change-r5-diagnose

Each cell gave a fresh temporary Git repository to the same Codex agent. `off` had no Atlas vault or MCP; `on` had the same source plus a prepared validated vault, read-only context reads, and one reviewed Atlas update. A local bare remote stood in for push. No external remote was contacted.

Runs per cell: **1**

| Subject | Arm | Cells | Workflow passes | Usable cells | Tests | Commits | Ontology updates | Main pushes | Merges | Cleanups | Median time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| greenfield | on | 1 | 1 | 1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 79573 ms |

## Paired deltas

| Subject | ON workflow − OFF | ON merges − OFF | ON time − OFF |
|---|---:|---:|---:|
| greenfield | — | — | — ms |

## Interpretation boundary

- A workflow pass requires direct evidence of the changed file set, tests, commit, local push, merge/recovery, post-merge tests, owned cleanup, and (only in the Atlas arm) an existing capability update checked through Atlas MCP plus vault validation and compilation.
- A failed step is not converted into a success by harness repair; inspect the cell row and raw transcript.
- Atlas is measured as meaning/navigation context and a reviewed post-change ontology update. Generic Git mechanics remain ordinary Git actions and are reported separately.
- This pilot uses internal synthetic subjects and does not establish a general customer or cross-repository effect.

## Cells

| Subject | Task | Arm | Content | Ontology | Usable | Workflow | Changed files | Merge | Transcript | Diff |
|---|---|---|---|---|---|---|---|---|---|---|
| greenfield | discount handling | on | exact · tests pass · commit pass | pass | yes | yes | atlas/capabilities/checkout.md<br>src/checkout.mjs<br>test/checkout.test.mjs | clean | [raw](2026-08-31-change-r5-diagnose-greenfield-on-r1.txt) | [diff](2026-08-31-change-r5-diagnose-greenfield-on-r1.diff) |
