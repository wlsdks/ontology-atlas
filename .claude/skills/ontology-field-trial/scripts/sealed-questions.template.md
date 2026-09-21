# Sealed source-hidden questions — template

Copy this file into the scratch directory, fill the six questions for the
chosen repository, and **write the date you sealed it at the top**. Write it
**before any vault exists** — before the build turn, before the survey, before
you have read anything the builder will read. A question written after seeing
the vault measures the vault's strengths, which is the one thing already known.

`sealed-reader.sh` passes only the `Q1.`–`Q6.` block to the reader. The scoring
line and the ground-truth line below it are the grader's, and never reach the
reader; keep them under the headings used here so they stay behind.

Ask nothing that names this checkout, the product, or the repository's brand —
the reader has a vault and no source, and the point is to find out whether the
vault alone answers a new engineer's first day.

---

Sealed on: YYYY-MM-DD, before the build turn ran.

Q1. **Outcome and who.** What does this product do and who uses it? Name the
    outcome, not the folder.

Q2. **A behaviour and the file that implements it.** Pick one behaviour a user
    of this library or tool would notice. Does the product support it, and which
    source file implements it?

Q3. **Definition against resolution.** Take one thing the product lets a caller
    declare and later resolves at run time. Which file owns the declaration and
    which file owns the resolution?

Q4. **The error path.** What happens when the caller gets it wrong — an unknown
    input, a missing required one? Where is that error produced?

Q5. **The customisation surface.** Name one thing a program using this product
    can replace or override, and which file owns the piece being replaced.

Q6. **Impact.** If the rule behind Q4 changed, which other concepts in the vault
    are affected, and which of those claims can be checked from the vault alone?

---

## Scoring

Per question, one of: answered-with-checkable-citation / answered-uncited /
refused-honestly / invented. `refused-honestly` is a pass for the vault and a
finding for the construction rules; `invented` is the only outright failure, and
it is the number phase 4 exists to produce.

The reader is also asked one fixed seventh question it cannot prepare for —
which claims the vault itself marks as uncertain. `sealed-reader.sh` always asks
it; do not write it into this file, and do not score it with the six.

## Ground truth

After the reader has answered and its output is sealed, list here the files in
the clone that actually implement Q2–Q5, and check each answer against them.
Nothing in this section may be written before the answers exist.
