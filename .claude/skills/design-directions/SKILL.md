---
name: design-directions
description: When Atlas design routing finds a structural commitment, sketch three different directions in text before code, including the status quo, and let the owner choose one.
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

`/design-council` reviews one built direction. This skill cheaply creates the
alternatives before that review when the route identifies a structural choice.

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

Run only when `pnpm design:route` returns `directions=yes`: a new surface,
information architecture, primary interaction model, or primary attention
model. Do not invoke it for generic “non-trivial” work, token swaps, copy edits,
spacing/layout fixes inside a selected shape, responsive repairs, or motion
tuning.

## Reuse an existing selection

If the owner has already selected a concrete direction in this session, record
that selection and proceed with its implementation. Reopen selection only when
the requested structure or a material constraint changes; identify that change
before requesting a decision. An implementation request without a selected
structural direction still follows the rules below.

## Rules for a new selection

Apply this section only when a new owner selection is needed. The text-only
restriction covers proposed alternatives; it does not prohibit reading source
or inspecting the current baseline. An already selected direction proceeds to
"After selection" without regenerating alternatives.

1. Use text and ASCII only—no code, build, or screenshot. A built option wins by
   sunk cost.
2. Produce exactly three directions. Two is a forced binary; more turns choosing
   into the task.
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

### C. …

**Existing measurements**: <numbers or none>
**Recommendation**: <one direction and why; the owner still chooses>
```

## After selection

1. Record the selected direction in one implementation-grade sentence.
2. Implement only that sentence and retain rejected directions as history.
3. Convene `/design-council` only when the same route says it is required; it
   reviews the chosen built direction rather than selecting one.
4. Run only the route's proof packet. Every rendered result includes an Orca
   Computer Use capture; motion includes a real screen recording.

## Failure modes

| Failure | Signal |
|---|---|
| all directions are one | none differs on the four axes |
| status quo is absent | change cannot lose |
| no option has a cost | alternatives were not investigated |
| code predates directions | post-hoc justification |
| directions are merged | the screen matches no selected option |
