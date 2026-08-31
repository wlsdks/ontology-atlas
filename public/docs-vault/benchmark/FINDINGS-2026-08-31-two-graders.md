# The difference is smaller than the ruler — 2026-08-31-gb-r3

A second reader was given the same 24 answers, then asked to read them three
times. The three readings are what matters. Command:
`pnpm benchmark:grade --bypass --run-id=2026-08-31-gb-r3 --repeat=3`.

## The result

| Correctness, out of 3 | Reading 1 | Reading 2 | Reading 3 |
|---|---:|---:|---:|
| Without Atlas | 2.75 | 2.833 | 2.833 |
| With Atlas | 2.833 | 2.833 | 2.833 |
| **Gap** | **0.083** | **0.0** | **0.0** |

The gap between the two sides is 0.0 to 0.083. Re-reading the *same*
answers with nothing changed moves a side by up to 0.083.

> **The difference between having Atlas and not having it is the same size as
> the grader changing its mind.** On this measurement, at this sample size, no
> correctness difference exists.

That is not a claim that Atlas does not help. It is a statement about what
this instrument can currently resolve: twelve answers per side, graded on a
four-point scale, cannot separate effects this small. Any future claim of a
quality difference has to clear its own noise floor, and has to publish that
floor beside it.

## Measure the floor at the size of the claim

Across all 24 answers the same three readings move by only 0.041. Split into
twelve per side, they move by 0.083. The comparison is made per side, so 0.083
is the relevant number and 0.041 would flatter it. **A noise floor measured at
a coarser grain than the claim is not a noise floor.**

## What the readings do agree on

Not everything here is noise. Across all three readings and the earlier
screening pass:

- **Both sides answered every ownership and boundary question correctly.**
  Boundary scores are near-identical and rarely move.
- **The single invented claim in the run is on the side without a vault** — it
  reused one domain's permission verbs as another domain's capability names.
  Every reading found it; none found a counterpart on the Atlas side.
- **Citations agree at 0.958** with the screening pass once the criteria
  separated *unsupported* from *unverifiable*.

These are consistent, and they are all narrow. None of them is a quality gap.

## The criterion that had to be fixed first

The first independent reading returned 17 unsupported claims against the vault
side and citations of 1 out of 2 on nearly every one of its answers — while its
own notes called those same answers *"correct"*, *"fully establish the
boundary"*, and *"decisively"* right.

A score and its own note disagreeing that consistently is a signal about the
criteria, not the answers. The packet does not contain the tool responses the
vault-side agents read, so every claim resting on reported metadata looked
unsupported. Splitting the count into **unsupported** (the material
contradicts it) and **unverifiable** (the packet cannot show it, and it is not
a fault) moved citation agreement from 0.333 to 0.958 and the vault side's
unsupported count from 17 to 0, without changing a single answer.

## A finding hiding inside that fix

Every answer on the vault side cited at least one piece of tool-reported
metadata that no grader can check afterwards. The answers may be right; the
artifact simply does not let anyone confirm it. A reviewer reading the saved
record months later has the claim and no way to test it. That is worth fixing
at the source, and worth remembering before treating any of these cells as
settled evidence.

## What still outranks all of this

Neither reader is a person, and both are the same kind of system. Agreement
between them shows the criteria are legible, not that the verdict is right.
The packet regenerates byte for byte, and a person grading it remains the
measurement that outranks both.
