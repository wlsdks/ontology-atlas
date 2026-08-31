# Greenfield/brownfield lifecycle benchmark — 2026-08-31-gb-r3

This is a paired Codex measurement of a prepared Atlas vault. `off` has no vault, MCP, or answer key in the subject workspace; `on` has the same source plus a validated curated vault and Atlas MCP. Machine coverage is not a semantic quality certificate; inspect the saved transcripts before making a product claim.

Runs per cell: **3**

| Subject | Arm | Cells | Content passes | Usable cells | Required coverage | Median duration | Median shell | Median MCP | Process failures |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| greenfield | off | 6 | 0 | 6 | 0.25 | 27467 ms | 2.5 | 0 | 0 |
| greenfield | on | 6 | 4 | 6 | 0.875 | 44673 ms | 2 | 4 | 0 |
| brownfield | off | 6 | 0 | 6 | 0.2834 | 26959.5 ms | 3 | 0 | 0 |
| brownfield | on | 6 | 2 | 6 | 0.7389 | 60200 ms | 3 | 4.5 | 0 |

## Paired deltas

| Subject | ON coverage − OFF | ON content passes − OFF | ON duration − OFF |
|---|---:|---:|---:|
| greenfield | 0.625 | +4 | 17206 ms |
| brownfield | 0.4555 | +2 | 33240.5 ms |

## Interpretation boundary

- A positive coverage delta is a lead, not proof of business meaning.
- A zero or negative delta is a valid result and should redirect the next slice.
- Bootstrap/maintenance cost, source-hidden handoff, citation truth, and human semantic grading remain separate measurements.
- A cell with failed arm integrity is a setup failure, not evidence for or against Atlas.

## Cells

| Subject | Task | Arm | Iteration | Coverage | Content pass | Integrity | Usable | Status | Transcript |
|---|---|---|---:|---:|---|---|---|---:|---|
| greenfield | G1 | off | 1 | 0.25 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G1-off-r1.txt) |
| greenfield | G1 | off | 2 | 0.25 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G1-off-r2.txt) |
| greenfield | G1 | off | 3 | 0.25 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G1-off-r3.txt) |
| greenfield | G1 | on | 1 | 0.75 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G1-on-r1.txt) |
| greenfield | G1 | on | 2 | 1 | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G1-on-r2.txt) |
| greenfield | G1 | on | 3 | 0.5 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G1-on-r3.txt) |
| greenfield | G2 | off | 1 | 0.25 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G2-off-r1.txt) |
| greenfield | G2 | off | 2 | 0.25 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G2-off-r2.txt) |
| greenfield | G2 | off | 3 | 0.25 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G2-off-r3.txt) |
| greenfield | G2 | on | 1 | 1 | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G2-on-r1.txt) |
| greenfield | G2 | on | 2 | 1 | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G2-on-r2.txt) |
| greenfield | G2 | on | 3 | 1 | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-greenfield-G2-on-r3.txt) |
| brownfield | B1 | off | 1 | 0.4 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B1-off-r1.txt) |
| brownfield | B1 | off | 2 | 0.4 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B1-off-r2.txt) |
| brownfield | B1 | off | 3 | 0.4 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B1-off-r3.txt) |
| brownfield | B1 | on | 1 | 0.4 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B1-on-r1.txt) |
| brownfield | B1 | on | 2 | 0.8 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B1-on-r2.txt) |
| brownfield | B1 | on | 3 | 0.4 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B1-on-r3.txt) |
| brownfield | B2 | off | 1 | 0.1667 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B2-off-r1.txt) |
| brownfield | B2 | off | 2 | 0.1667 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B2-off-r2.txt) |
| brownfield | B2 | off | 3 | 0.1667 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B2-off-r3.txt) |
| brownfield | B2 | on | 1 | 1 | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B2-on-r1.txt) |
| brownfield | B2 | on | 2 | 1 | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B2-on-r2.txt) |
| brownfield | B2 | on | 3 | 0.8333 | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r3-brownfield-B2-on-r3.txt) |
