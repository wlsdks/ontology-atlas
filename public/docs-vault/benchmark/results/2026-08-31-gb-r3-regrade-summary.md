# Lifecycle benchmark, re-scored with the two halves separated — 2026-08-31-gb-r3

Two sides answer the same questions about the same source code. `off` has no Atlas vault, no MCP server, and no answer key in its workspace; `on` has the identical source plus a checked Atlas vault and the read-only Atlas MCP server. These scores count whether an answer contained the things it should have named. They do not judge whether the answer was true or useful — read the saved answers before making any claim about the product.

**This file re-scores the answers already saved for `2026-08-31-gb-r3`. Nothing was re-run: no Codex process started, no fixture was rebuilt, and no answer changed.** Only the scoring is new. The single score published for that run is split in two — the part both sides could earn, and the part only the Atlas side could.

### Does this read the same answers the run scored?

Yes. All 4 published averages came back exactly from the saved answers, so the split below is a different reading of the same run — not a different run.

| Side | Published score | Recomputed | Same |
|---|---:|---:|---|
| greenfield:off | 0.25 | 0.25 | yes |
| greenfield:on | 0.875 | 0.875 | yes |
| brownfield:off | 0.2834 | 0.2834 | yes |
| brownfield:on | 0.7389 | 0.7389 | yes |

Runs per cell: **3**

| Subject | Side | Cells | Content passes | Usable cells | Blended | Comparable (both sides) | Atlas names (Atlas side only) | Median duration | Median shell | Median MCP | Process failures |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| greenfield | off | 6 | 0 | 6 | 0.25 | 0.75 | 0 | — | 2.5 | 0 | 0 |
| greenfield | on | 6 | 4 | 6 | 0.875 | 1 | 0.8333 | — | 2 | 4 | 0 |
| brownfield | off | 6 | 0 | 6 | 0.2834 | 0.75 | 0 | — | 3 | 0 | 0 |
| brownfield | on | 6 | 2 | 6 | 0.7389 | 1 | 0.5695 | — | 3 | 4.5 | 0 |

## Paired gaps

| Subject | Comparable gap | Atlas-name gap | Blended gap | ON passes − OFF | ON duration − OFF |
|---|---:|---:|---:|---:|---:|
| greenfield | 0.25 | 0.8333 | 0.625 | 4 | — |
| brownfield | 0.25 | 0.5695 | 0.4555 | 2 | — |

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
| brownfield | B1 | off | 1 | 0.4 | 1 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B1-off-r1.txt) |
| brownfield | B1 | off | 2 | 0.4 | 1 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B1-off-r2.txt) |
| brownfield | B1 | off | 3 | 0.4 | 1 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B1-off-r3.txt) |
| brownfield | B1 | on | 1 | 0.4 | 1 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B1-on-r1.txt) |
| brownfield | B1 | on | 2 | 0.8 | 1 | 0.6667 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B1-on-r2.txt) |
| brownfield | B1 | on | 3 | 0.4 | 1 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B1-on-r3.txt) |
| brownfield | B2 | off | 1 | 0.1667 | 0.5 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B2-off-r1.txt) |
| brownfield | B2 | off | 2 | 0.1667 | 0.5 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B2-off-r2.txt) |
| brownfield | B2 | off | 3 | 0.1667 | 0.5 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B2-off-r3.txt) |
| brownfield | B2 | on | 1 | 1 | 1 | 1 | yes | yes | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B2-on-r1.txt) |
| brownfield | B2 | on | 2 | 1 | 1 | 1 | yes | yes | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B2-on-r2.txt) |
| brownfield | B2 | on | 3 | 0.8333 | 1 | 0.75 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-brownfield-B2-on-r3.txt) |
| greenfield | G1 | off | 1 | 0.25 | 1 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G1-off-r1.txt) |
| greenfield | G1 | off | 2 | 0.25 | 1 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G1-off-r2.txt) |
| greenfield | G1 | off | 3 | 0.25 | 1 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G1-off-r3.txt) |
| greenfield | G1 | on | 1 | 0.75 | 1 | 0.6667 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G1-on-r1.txt) |
| greenfield | G1 | on | 2 | 1 | 1 | 1 | yes | yes | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G1-on-r2.txt) |
| greenfield | G1 | on | 3 | 0.5 | 1 | 0.3333 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G1-on-r3.txt) |
| greenfield | G2 | off | 1 | 0.25 | 0.5 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G2-off-r1.txt) |
| greenfield | G2 | off | 2 | 0.25 | 0.5 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G2-off-r2.txt) |
| greenfield | G2 | off | 3 | 0.25 | 0.5 | 0 | yes | no | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G2-off-r3.txt) |
| greenfield | G2 | on | 1 | 1 | 1 | 1 | yes | yes | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G2-on-r1.txt) |
| greenfield | G2 | on | 2 | 1 | 1 | 1 | yes | yes | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G2-on-r2.txt) |
| greenfield | G2 | on | 3 | 1 | 1 | 1 | yes | yes | yes | yes | — | [raw transcript](2026-08-31-gb-r3-greenfield-G2-on-r3.txt) |

## Which word decided each miss

Every point of a gap is one specific thing a side did not write. `phrase` rows are the fragile ones: they are matched as literal words, so an answer that states the same boundary in other words scores zero. Send boundary judgement to blind human grading before reading a phrase gap as a difference in quality.

| Subject | Side | What was missing | Kind | Cells |
|---|---|---|---|---:|
| brownfield | off | `capabilities/decision-broadcast` | vocabulary | 6 |
| brownfield | off | `domains/coordination` | vocabulary | 6 |
| brownfield | off | `capabilities/acknowledgement-tracking` | vocabulary | 3 |
| brownfield | off | `capabilities/workspace-authorization` | vocabulary | 3 |
| brownfield | off | `domains/access-control` | vocabulary | 3 |
| brownfield | off | `excludes` | phrase | 3 |
| brownfield | on | `capabilities/decision-broadcast` | vocabulary | 3 |
| brownfield | on | `domains/coordination` | vocabulary | 3 |
| brownfield | on | `capabilities/acknowledgement-tracking` | vocabulary | 2 |
| greenfield | off | `capabilities/checkout` | vocabulary | 6 |
| greenfield | off | `capabilities/inventory-sync` | vocabulary | 6 |
| greenfield | off | `domains/purchase` | vocabulary | 3 |
| greenfield | off | `excludes` | phrase | 3 |
| greenfield | on | `capabilities/inventory-sync` | vocabulary | 2 |
| greenfield | on | `domains/purchase` | vocabulary | 1 |
