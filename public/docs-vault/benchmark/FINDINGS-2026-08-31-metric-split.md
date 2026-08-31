# Most of the published gap was our own vocabulary — 2026-08-31

> Read this before quoting any number from
> [`FINDINGS-2026-08-31.md`](FINDINGS-2026-08-31.md). It does not replace that
> run. It re-scores the very same answers and shows that most of the headline
> gap was never a comparison between the two sides.

## What was re-scored

Nothing was re-run. No Codex process started, no fixture was rebuilt, and no
answer changed. The 24 answers already saved for `2026-08-31-gb-r3` were read
again and scored a second way:

```bash
pnpm benchmark:lifecycle --regrade --run-id=2026-08-31-gb-r3
```

Before splitting anything, the re-score re-derives the numbers the original run
published. All four came back exactly — control 0.25 and Atlas 0.875 on the
greenfield subject, control 0.2834 and Atlas 0.7389 on the brownfield one — so
what follows is a different reading of the same run, not a different run. Full
matrix: [`2026-08-31-gb-r3-regrade-summary.md`](results/2026-08-31-gb-r3-regrade-summary.md).

## What was wrong with the original score

The score was one number: of the things an answer was supposed to name, how many
did it name? The list of required things mixed two kinds of item, and that is
where it broke.

| Kind of item | Example | Could the side without Atlas write it? |
|---|---|---|
| **An Atlas concept name** | `domains/purchase`, `capabilities/checkout` | **No.** That name exists only inside the vault. With no vault there is nothing to name, however good the answer is. |
| **Something either side can reach** | `src/features/checkout/index.ts`, `packages/realtime`, the word `excludes` | **Yes.** The file is on disk for both sides, and either can say a thing is excluded. |

Fourteen of the nineteen required items were Atlas concept names. So the number
we published was, for the most part, asking *"did this answer use our
vocabulary?"* — a question only one side could answer at all — and then
reporting the result as though the two sides had been compared.

## The two halves, separated

| Subject | Comparable half, control → Atlas | Comparable gap | Atlas names, control → Atlas | Gap we published |
|---|---|---:|---|---:|
| Greenfield | 0.75 → 1.00 | **+0.25** | 0 → 0.8333 | +0.625 |
| Brownfield | 0.75 → 1.00 | **+0.25** | 0 → 0.5695 | +0.4555 |

**In all twelve control cells, the side without Atlas named 100% of the source
paths it was supposed to name.** Everything it missed was an Atlas concept name,
with one exception per subject: the literal word `excludes` in the two boundary
questions.

That last quarter-point does not survive a look either. Asked where permission
checks belong, the control answered:

> "Permission evaluation belongs in Access Control, implemented by the policy
> package—not in Coordination. … deciding who may read, coordinate, or
> administer an incident is **explicitly outside it**."

That is the boundary, correct, with the exclusion stated outright. It scored
zero because it wrote *outside* where the key wanted *excludes*. The greenfield
control is a weaker case — it kept reconciliation in Inventory and gave the
reason, but never framed it as an exclusion — yet it too was decided by a word
match rather than by meaning.

## What we can and cannot say now

- **We cannot say the two sides gave different quality answers.** Take away the
  items only one side could write, and the one item decided by wording, and no
  measured difference is left standing.
- **We can say only the Atlas side returned names that can be looked up again.**
  That matters and is worth reporting: `capabilities/checkout` is an address a
  person or an agent can resolve next session, in another tool, months later.
  "The checkout feature" is not. It is a real property of the vault — and a
  different claim from "better answers".
- **It exposed a bug on our own side.** The side that *had* the vault scored
  only 0.8333 on greenfield and **0.5695 on brownfield** for naming its own
  concepts. It read the vault and then answered without the names:
  `capabilities/decision-broadcast` missing in 3 of 6 cells,
  `domains/coordination` in 3 of 6, `capabilities/acknowledgement-tracking` in 2
  of 6. The pilot's backlog already suspected this; now it has a number.

## What changed in the harness

- Required items are sorted into three kinds — an Atlas concept name, a source
  path, or an ordinary phrase — and the sorting is **checked, not trusted**. The
  runner refuses to start unless every concept name is a real entry in that
  subject's vault *and* absent from the source tree, and every path exists on
  disk. Nothing can be filed into the flattering category by hand.
- Summaries now print the comparable score and the Atlas-name score in separate
  columns. The old combined number stays only so past runs still reproduce, and
  is labelled as not for quoting.
- Every summary ends with **the exact word behind each miss**, so nobody reads a
  score as a verdict without seeing what decided it.
- `--regrade` re-scores a saved run and fails if it cannot reproduce what that
  run published.
- `--dry-run` used to print `definitions valid` while calling nothing that could
  fail. It now runs the checks and exits non-zero. Both new checks were tested by
  planting a concept name that does not exist and a path that does not exist:
  each turned the gate red, and removing them turned it green again.

## What has to happen next

1. **Fix the public claim.** `README.md` shows the combined +0.625 / +0.4555
   table as evidence for what Atlas is trying to earn. That table is not a
   comparison and has to be restated.
2. **Blind human grading is now the only way forward.** It is the sole remaining
   route to a comparable result. The criteria already exist in
   [`rubric.md`](rubric.md) and the 24 answers are on disk; grade them with the
   side labels removed.
3. **Do not add synonyms to the word list.** Adding *outside*, *not part of* and
   friends after seeing which answers they would rescue is tuning the ruler to
   the result we wanted. Boundary judgement belongs to the human grader.
4. **Treat 0.5695 as a bug, not a scoring artifact.** An agent that reads the
   vault and then answers without the name has dropped the one thing the vault
   uniquely supplies.

## The rule this produces

> **A score only one side can earn is not a comparison.** Report it — but never
> as a gap.
