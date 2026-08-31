# Meaning-to-change benchmark — 2026-08-31-change-r2

Each cell gave a fresh temporary Git repository to the same Codex agent. `off` had no Atlas vault or MCP; `on` had the same source plus a prepared validated vault and read-only Atlas MCP. A local bare remote stood in for push. No external remote was contacted.

Runs per cell: **1**

| Subject | Arm | Cells | Workflow passes | Usable cells | Tests | Commits | Main pushes | Merges | Cleanups | Median time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| greenfield | off | 1 | 1 | 1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 62823 ms |
| greenfield | on | 1 | 1 | 1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 83542 ms |
| brownfield | off | 1 | 1 | 1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 61786 ms |
| brownfield | on | 1 | 1 | 1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 87862 ms |

## Paired deltas

| Subject | ON workflow − OFF | ON merges − OFF | ON time − OFF |
|---|---:|---:|---:|
| greenfield | 0 | 0 | 20719 ms |
| brownfield | 0 | 0 | 26076 ms |

## Interpretation boundary

- A workflow pass requires direct evidence of the changed file set, tests, commit, local push, merge/recovery, post-merge tests, and owned cleanup.
- A failed step is not converted into a success by harness repair; inspect the cell row and raw transcript.
- Atlas is measured as meaning/navigation context. Generic Git mechanics remain ordinary Git actions and are reported separately.
- This pilot uses internal synthetic subjects and does not establish a general customer or cross-repository effect.

## Cells

| Subject | Task | Arm | Content | Usable | Workflow | Changed files | Merge | Transcript | Diff |
|---|---|---|---|---|---|---|---|---|---|
| greenfield | discount handling | off | exact · tests pass · commit pass | yes | yes | src/checkout.mjs<br>test/checkout.test.mjs | clean | [raw](2026-08-31-change-r2-greenfield-off-r1.txt) | [diff](2026-08-31-change-r2-greenfield-off-r1.diff) |
| greenfield | discount handling | on | exact · tests pass · commit pass | yes | yes | src/checkout.mjs<br>test/checkout.test.mjs | clean | [raw](2026-08-31-change-r2-greenfield-on-r1.txt) | [diff](2026-08-31-change-r2-greenfield-on-r1.diff) |
| brownfield | acknowledgement note | off | exact · tests pass · commit pass | yes | yes | apps/web/src/acknowledgement.mjs<br>apps/web/test/acknowledgement.test.mjs | recovered | [raw](2026-08-31-change-r2-brownfield-off-r1.txt) | [diff](2026-08-31-change-r2-brownfield-off-r1.diff) |
| brownfield | acknowledgement note | on | exact · tests pass · commit pass | yes | yes | apps/web/src/acknowledgement.mjs<br>apps/web/test/acknowledgement.test.mjs | recovered | [raw](2026-08-31-change-r2-brownfield-on-r1.txt) | [diff](2026-08-31-change-r2-brownfield-on-r1.diff) |
