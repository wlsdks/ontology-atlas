# Findings — 2026-08-31 end-to-end change flow

## Question

Does a reviewed Atlas meaning layer change what an agent can safely carry
through a small repository change, rather than only improve a lookup answer?

The measured slice is deliberately narrow: one greenfield-shaped subject and
one brownfield-shaped subject, each with Atlas physically absent (`off`) or a
prepared Atlas vault plus MCP (`on`). The same Codex model receives the same
approved change task in a fresh temporary Git repository.

## Protocol

Each task required the agent to:

1. inspect the available context and source;
2. implement one fixed behavior change and focused tests;
3. keep the declared responsibility boundary;
4. on the Atlas arm, patch one existing capability with an exact change record,
   then run `validate_vault` and `compile_ontology`;
5. review and commit the allowlisted files with a fixed conventional subject.

The harness then ran the exact test command, checked the changed-file allowlist,
checked the feature commit, pushed to a fresh local bare remote, merged to
`main`, ran the post-merge test, and deleted the local and remote feature
branch. The brownfield case intentionally introduced one deterministic main
branch conflict and checked recovery. No external remote was contacted.

Git push, merge, and cleanup are workflow evidence here, not a new Atlas Git
contract. Atlas owns the meaning, provenance, boundaries, handoff, and
post-change ontology record; ordinary Git remains the transport and
integration mechanism.

## Adopted result: `2026-08-31-change-r7`

This is one feasibility repeat per cell, not a general or decision-grade
customer claim.

| Subject | Arm | Workflow | Tests | Commits | Ontology update | Main push | Merge | Cleanup | Median time |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| greenfield-shaped purchase | off | 1/1 | 1/1 | 1/1 | n/a | 1/1 | 1/1 | 1/1 | 64.0 s |
| greenfield-shaped purchase | on | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 92.2 s |
| brownfield-shaped collaboration | off | 1/1 | 1/1 | 1/1 | n/a | 1/1 | 1/1 | 1/1 | 58.8 s |
| brownfield-shaped collaboration | on | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 109.9 s |

The paired time delta was **+28.2 s** for greenfield and **+51.1 s** for
brownfield. The greenfield merge was clean; both brownfield arms completed the
intentional conflict recovery. The on arm made exactly one `patch_concept`, one
`validate_vault`, and one `compile_ontology` call per subject, and committed
the corresponding capability Markdown beside the source and test changes.

Evidence: [r7 summary](results/2026-08-31-change-r7-summary.md), [greenfield
on diff](results/2026-08-31-change-r7-greenfield-on-r1.diff), [brownfield on
diff](results/2026-08-31-change-r7-brownfield-on-r1.diff), and the four linked
raw transcripts in the summary.

## Interpretation

The first end-to-end result is **workflow parity, not an Atlas win**:

- both arms completed the fixed code change, tests, commit, local push, merge,
  and cleanup in all four cells;
- only the Atlas arm carried a reviewed capability update through the same
  commit and validated/compiled it after the code change;
- the on arm took longer in this small synthetic run;
- no human semantic grading was performed, so this run cannot show that the
  Atlas-guided implementation was more correct, safer, or more useful than the
  control implementation.

The honest current product signal is therefore: Atlas can participate in a
meaning → code/test → ontology record → commit → push → merge handoff, but this
slice does not yet prove that the meaning layer improves the final code
outcome. A future result must measure boundary fidelity, unsupported claims,
reviewer trust, and maintenance cost—not just whether Git commands completed.

## Defects found and fixed while building the measurement

These are harness/fixture findings, not silently discarded results:

- The first brownfield fixture had an unterminated template literal in its
  baseline source. It was corrected and the invalid-baseline run was not used
  as evidence.
- MCP writes create `atlas/.ontology-atlas/activity.jsonl` as local state. The
  fixture initially lacked the real vault's ignore contract, so valid on-arm
  work was falsely marked dirty after merge. The fixture now includes
  `atlas/.ontology-atlas/` in its baseline `.gitignore`.
- The runner originally inspected `HEAD` after switching to the merged branch,
  which compared the merge subject rather than the feature commit subject. It
  now captures the feature commit before merge and records `main...HEAD` for
  the pre-merge diff.
- The runner now records the individual Atlas update conditions (`file`,
  `marker`, `patch`, `validate`, and `compile`) in the summary so a future
  failure cannot collapse into an unexplained `workflow=false`.

The diagnostic runs remain available: [the unadopted sidecar-failure run](results/2026-08-31-change-r3-summary.md), [the unadopted verification run](results/2026-08-31-change-r4-summary.md), and [the passing diagnosis smoke](results/2026-08-31-change-r5-diagnose-summary.md).

## Next falsifiable slice

Keep the public claim bounded until the next run adds:

1. blind human grading of code correctness, boundary preservation, citations,
   and the post-change ontology record;
2. a real unfamiliar greenfield and brownfield repository snapshot;
3. Atlas construction and maintenance cost, including stale-vault handling;
4. a source-hidden handoff where a second agent answers only from the emitted
   vault and committed evidence.

If those measures show parity or a cost-adjusted loss, narrow or remove the
README claim. Do not add a public Git push/merge API to manufacture a win:
branch integration remains ordinary Git evidence unless a separate product
decision authorizes and proves such a contract.
