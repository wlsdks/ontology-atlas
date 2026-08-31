# Greenfield/brownfield lifecycle benchmark — 2026-08-31-gb-pilot-r2

This is a paired Codex measurement of a prepared Atlas vault. `off` has no vault, MCP, or answer key in the subject workspace; `on` has the same source plus a validated curated vault and Atlas MCP. Machine coverage is not a semantic quality certificate; inspect the saved transcripts before making a product claim.

Runs per cell: **1**

| Subject | Arm | Cells | Usable passes | Required coverage | Median duration | Median shell | Median MCP | Process failures |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| greenfield | off | 2 | 2 | 0.25 | 27407.5 ms | 2.5 | 0 | 0 |
| greenfield | on | 2 | 2 | 1 | 48314 ms | 1.5 | 3.5 | 0 |
| brownfield | off | 2 | 2 | 0.2833 | 28896 ms | 3 | 0 | 0 |
| brownfield | on | 2 | 2 | 0.6167 | 61631.5 ms | 2.5 | 4 | 0 |

## Paired deltas

| Subject | ON coverage − OFF | ON passes − OFF | ON duration − OFF |
|---|---:|---:|---:|
| greenfield | 0.75 | 0 | 20906.5 ms |
| brownfield | 0.3334 | 0 | 32735.5 ms |

## Interpretation boundary

- A positive coverage delta is a lead, not proof of business meaning.
- A zero or negative delta is a valid result and should redirect the next slice.
- Bootstrap/maintenance cost, source-hidden handoff, citation truth, and human semantic grading remain separate measurements.
- A cell with failed arm integrity is a setup failure, not evidence for or against Atlas.

## Cells

| Subject | Task | Arm | Iteration | Coverage | Content pass | Integrity | Usable | Status | Transcript |
|---|---|---|---:|---:|---|---|---|---:|---|
| greenfield | G1 | off | 1 | 0.25 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-pilot-r2-greenfield-G1-off-r1.txt) |
| greenfield | G2 | off | 1 | 0.25 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-pilot-r2-greenfield-G2-off-r1.txt) |
| greenfield | G1 | on | 1 | 1 | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-pilot-r2-greenfield-G1-on-r1.txt) |
| greenfield | G2 | on | 1 | 1 | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-pilot-r2-greenfield-G2-on-r1.txt) |
| brownfield | B1 | off | 1 | 0.4 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-pilot-r2-brownfield-B1-off-r1.txt) |
| brownfield | B2 | off | 1 | 0.1667 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-pilot-r2-brownfield-B2-off-r1.txt) |
| brownfield | B1 | on | 1 | 0.4 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-pilot-r2-brownfield-B1-on-r1.txt) |
| brownfield | B2 | on | 1 | 0.8333 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-pilot-r2-brownfield-B2-on-r1.txt) |
