---
name: design-directions
description: Sketch three or four structurally different UI directions in text before code, include the status quo, and let the owner choose one before the design council reviews it.
---

# Design directions before implementation

Two evidence lines support this step.

First, frontier models return to a persistent frontend default. Generic
redirection such as “cleaner” or “not cream” replaces one default palette with
another; only a concrete specification changes the structure. With sampling
controls no longer exposed, generate several directions and let a person choose.

Second, Dow, Glassco, Kass, Schwarz, Schwartz, and Klemmer, “Parallel
Prototyping Leads to Better Design Results, More Divergence, and Increased
Self-Efficacy” (ACM TOCHI 2010), found parallel alternatives superior to serial
iteration on quality, divergence, and self-efficacy.

`/design-council` is serial critique of one built thing. This skill cheaply
creates the alternatives before that review. A 2026-08-03 council spent two
rounds reaching two shapes that could have been sketched in three lines first.

## Ownership

The owner of divergence is `chief`, not the builder `design-guardian`. A builder
who authors the options biases them toward the one they want to implement and
turns the rest into straw men. `chief` sketches, the human owner chooses, and the
builder implements.

## A direction is structural, not a palette

Atlas already fixes dark-only, achromatic-plus-indigo, and no gradients/glow/
glass. Do not copy example colours, fonts, or assets from reference documents.

Directions differ on at least one axis:

| Axis | Structural difference |
|---|---|
| Hierarchy | what the eye reaches first |
| Layout and density | grouping, rows, and spatial ownership |
| Interaction model | modal, inline, popover, or in-place action |
| Motion information | which state change moves and what that movement explains |

Different values inside the same shape are adjustments, not directions.

## When

Run before any non-trivial visual, layout, interaction, or motion change and
before `/design-council`. Skip token swaps, copy edits, spacing nudges, and other
value changes inside an already selected shape.

## Rules

1. Use text and ASCII only—no code, build, or screenshot. A built option wins by
   sunk cost.
2. Produce three or four directions. Two is a forced binary; five makes choosing
   the task.
3. One direction is **the status quo**. “Change nothing” must be able to win.
4. Each direction states the observation that would prove it wrong.
5. Do not propose a forbidden pattern. Request a rule change separately.
6. Build only the one selected by the human owner. Never merge directions into a
   third shape nobody chose.

## Output

```md
## Directions — <change>

**What this screen does now**: <one sentence>
**Diverging axes**: hierarchy / layout and density / interaction / motion

### A. Status quo
<honest current shape and what already works>
**Wins when**: …

### B. <structural name, not an adjective>
<ASCII sketch with known dimensions>
**Changes**: <axis and change>
**Cost**: <what is lost>
**Wrong if**: <observable falsifier>

### C. … / D. …

**Existing measurements**: <numbers or none>
**Recommendation**: <one direction and why; the owner still chooses>
```

## After selection

1. Record the selected direction in one implementation-grade sentence.
2. Implement only that sentence and retain rejected directions as history.
3. Convene `/design-council` when the selected change is expensive or difficult
   to reverse; it reviews the chosen direction rather than selecting one.
4. Finish with `/design-audit`, plus `/motion-verify` or `/responsive-sweep` when
   those axes changed.

## Failure modes

| Failure | Signal |
|---|---|
| all directions are one | none differs on the four axes |
| status quo is absent | change cannot lose |
| no option has a cost | alternatives were not investigated |
| code predates directions | post-hoc justification |
| directions are merged | the screen matches no selected option |
