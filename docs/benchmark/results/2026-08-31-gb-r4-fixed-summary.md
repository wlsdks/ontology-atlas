# Greenfield/brownfield lifecycle benchmark — 2026-08-31-gb-r4-fixed

Two sides answer the same questions about the same source code. `off` has no Atlas vault, no MCP server, and no answer key in its workspace; `on` has the identical source plus a checked Atlas vault and the read-only Atlas MCP server. These scores count whether an answer contained the things it should have named. They do not judge whether the answer was true or useful — read the saved answers before making any claim about the product.

Runs per cell: **3**

| Subject | Side | Cells | Content passes | Usable cells | Blended | Comparable (both sides) | Atlas names (Atlas side only) | Median duration | Median shell | Median MCP | Process failures |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| greenfield | on | 6 | 5 | 6 | 0.9583 | 1 | 0.9445 | 53384 ms | 3 | 3.5 | 0 |
| brownfield | on | 6 | 1 | 6 | 0.4778 | 1 | 0.1667 | 64052.5 ms | 3.5 | 4.5 | 0 |

## Paired gaps

| Subject | Comparable gap | Atlas-name gap | Blended gap | ON passes − OFF | ON duration − OFF |
|---|---:|---:|---:|---:|---:|
| greenfield | — | — | — | — | — |
| brownfield | — | — | — | — | — |

## How to read this

- **Only the comparable column compares the two sides.** It scores source paths and boundary words, which either side could have written.
- **The Atlas-name column is not a comparison.** It scores Atlas concept names, which live only in the vault, so the control side scores zero on it no matter how good its answer is. What it does show is worth showing: a name like `capabilities/checkout` can be looked up again next session by a person or an agent, and the phrase "the checkout feature" cannot.
- The blended column exists only so earlier published runs still reproduce. Do not quote it.
- **Boundary words are matched literally.** An answer that says "explicitly outside" instead of "excludes" scores zero for it, so a gap that rests on one word is a wording difference until a human grader says otherwise. The table at the end names the word behind every miss.
- A positive comparable gap is a lead, not proof that the meaning layer helped.
- A gap of zero, or a negative one, is a real result and should redirect the next slice.
- Build and upkeep cost, the source-hidden handoff, whether citations are true, and human grading of meaning are separate measurements. None of them is folded into these numbers.
- A cell that failed its setup check is a broken run, not evidence for or against Atlas.

## Cells

| Subject | Task | Side | Iteration | Blended | Comparable | Atlas names | Said what it did not know | Content pass | Setup | Usable | Status | Transcript |
|---|---|---|---:|---:|---:|---:|---|---|---|---|---:|---|
| greenfield | G1 | on | 1 | 0.75 | 1 | 0.6667 | yes | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-greenfield-G1-on-r1.txt) |
| greenfield | G1 | on | 2 | 1 | 1 | 1 | yes | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-greenfield-G1-on-r2.txt) |
| greenfield | G1 | on | 3 | 1 | 1 | 1 | yes | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-greenfield-G1-on-r3.txt) |
| greenfield | G2 | on | 1 | 1 | 1 | 1 | yes | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-greenfield-G2-on-r1.txt) |
| greenfield | G2 | on | 2 | 1 | 1 | 1 | yes | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-greenfield-G2-on-r2.txt) |
| greenfield | G2 | on | 3 | 1 | 1 | 1 | yes | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-greenfield-G2-on-r3.txt) |
| brownfield | B1 | on | 1 | 0.4 | 1 | 0 | yes | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-brownfield-B1-on-r1.txt) |
| brownfield | B1 | on | 2 | 0.4 | 1 | 0 | yes | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-brownfield-B1-on-r2.txt) |
| brownfield | B1 | on | 3 | 0.4 | 1 | 0 | yes | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-brownfield-B1-on-r3.txt) |
| brownfield | B2 | on | 1 | 0.3333 | 1 | 0 | yes | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-brownfield-B2-on-r1.txt) |
| brownfield | B2 | on | 2 | 0.3333 | 1 | 0 | yes | no | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-brownfield-B2-on-r2.txt) |
| brownfield | B2 | on | 3 | 1 | 1 | 1 | yes | yes | yes | yes | 0 | [raw transcript](2026-08-31-gb-r4-fixed-brownfield-B2-on-r3.txt) |

## Which word decided each miss

Every point of a gap is one specific thing a side did not write. `phrase` rows are the fragile ones: they are matched as literal words, so an answer that states the same boundary in other words scores zero. Send boundary judgement to blind human grading before reading a phrase gap as a difference in quality.

| Subject | Side | What was missing | Kind | Cells |
|---|---|---|---|---:|
| brownfield | on | `capabilities/decision-broadcast` | vocabulary | 5 |
| brownfield | on | `domains/coordination` | vocabulary | 5 |
| brownfield | on | `capabilities/acknowledgement-tracking` | vocabulary | 3 |
| brownfield | on | `capabilities/workspace-authorization` | vocabulary | 2 |
| brownfield | on | `domains/access-control` | vocabulary | 2 |
| greenfield | on | `capabilities/inventory-sync` | vocabulary | 1 |
