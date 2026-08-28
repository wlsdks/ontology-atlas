# How an agent designs here

> What a coding agent (Claude Code, Codex, or whatever comes next) has to do differently to
> produce a drawing somebody wants to look at. Every rule below is something that went wrong in
> this repository and was measured, not advice collected from a blog. Written 2026-08-28 during
> the `/architecture` canvas rebuild; add to it when a new failure earns a line.

## The failure this document exists for

An agent looks at a full-page screenshot, sees no obvious problem, and moves on. The owner opens
the same screen, zooms into one box, and finds the outline does not close: every corner carries a
stray tail because the shape's corners were computed twice with different noise.

**A full screenshot is where a defect hides, not where it shows.** At page scale a broken 2px
corner is one grey pixel. The agent had shipped three rounds past it.

## The loop

1. **Build and install for real.** A dev server is not the artifact. On this product the installed
   app is the only place source listing, the record sidecar, and the real window width exist.
2. **Capture the whole screen.** Read it back; do not describe it from memory of what you wrote.
3. **Zoom into one element** — a node, a row, a control — and look at its edges, corners,
   alignment, and stroke joins.
4. **Write the defects as a numbered list with a verdict per row.** Not prose, not "looks a bit
   off". The list is what stops an agent from talking itself past something.
5. **Fix, and pin whatever can be pinned as a test.** The closing-outline defect was not a matter
   of taste: "the last point equals the first point" is a string comparison. Anything checkable
   without eyes belongs in a test, because the next agent will not zoom in either.

| Step | Failure it prevents |
|---|---|
| Install, do not trust the dev server | measuring a product the user never runs |
| Read the screenshot back | describing intent instead of output |
| Zoom to one element | shipping past a defect the page scale hides |
| Numbered defect list | eyeballing, then rationalising |
| Test what is testable | the same defect returning in a month |

## Notation before style

When the drawing means something, look up who already decided what it means. Do not invent a
vocabulary.

- Shapes: **ISO 5807** (flowchart symbols, 1985, revised 2019) assigns terminator, process,
  decision and data. **BPMN 2.0** (ISO/IEC 19510) covers process flows, **C4** covers software
  systems, **UML** and **ArchiMate** cover components and enterprise structure.
- Use only the symbols whose meaning your drawing actually carries. This canvas has no branch and
  no input step, so the diamond and the parallelogram stay unused rather than being repurposed. A
  shape that means something else is worse than no shape.
- Assign the symbol from **derived facts**, never from a name. This surface reads a role's shape
  from the declared dependency graph, because a profile may call its entry layer anything at all,
  and reading intent from a name is what `docs/DECISIONS.md` (2026-08-26) forbids.

## References are for principles, and the licence is part of the check

Public references are where the principle comes from; the assets are not yours. Two live examples
from this session:

- **Rough.js** — the hand-drawn stroke behind Excalidraw. MIT, under 9kB. Usable, and the
  technique (offset the points, draw the path twice) is reproducible in about forty lines, which
  is what this repository did rather than take a dependency it would have to justify.
- **transparenttextures.com** — a pattern library with **no stated licence** on its own page. The
  idea (a faint background field) was taken; not one byte of the PNGs was.

Check the licence before you plan around an asset, and prefer rebuilding a small technique to
adding a package this repository would then have to explain.

## A generated drawing must be deterministic

If a drawing is produced by code, the same input has to produce the same picture every time. This
is not a preference:

- yesterday's screenshot can be compared with today's;
- a reviewer can read the change as a diff;
- and a test can assert on the output at all.

The sketch stroke here takes its wobble from a hash of the shape's own id. `Math.random` would
have made every one of the checks above impossible.

## Say what you drew, and draw what you said

Two symmetrical defects, both of which shipped here before being caught:

- **A fact only the accessibility tree carries.** The rule "what may this role depend on" lived in
  an `sr-only` list measured 1px wide and was on no screen at all. A fresh-eyes reader could not
  answer the question the screen existed to answer.
- **A fact only the drawing carries.** The mirror image: a count that exists as a stroke width and
  nowhere in words.

Every mark states itself somewhere readable, and every legend row names a mark that is actually on
screen. A legend claiming arrows on a drawing with no arrowheads is the same class of lie.

## What to put in front of the model

Ranked by what actually moved the output in this session:

1. **A screenshot of the real thing**, especially a zoomed one. Text prompts produce text-shaped
   output.
2. **The failure named.** "This is unreadable, nobody can tell what connects to what" changed the
   direction; "make it nicer" would not have.
3. **A reference class, not a gallery.** For a node canvas the useful references are n8n, ComfyUI,
   Figma and Excalidraw — the products themselves. Landing-page galleries have nothing to say
   about a diagram surface.
4. **The banned list.** Naming what must not appear is more effective than describing what should;
   this repository's `.claude/rules/forbidden.md` is that list, and it works.

## When a rule blocks the work, change the rule, do not route around it

`.claude/rules/forbidden.md` ends with **Ask why**: if a change appears to require breaking a
rule, explain why and change the rule first, rather than making a silent exception in code.

An agent's failure mode is the opposite one — quoting a rule as a reason not to think. Two checks
before citing a ban:

- **Is it actually a ban, or a proxy for a measurable rule that already exists?** The gradient ban
  is a blunt proxy for "background never beats data", which this repository already states as a
  number (`--canvas-bg-ink-max: 0.08`). Where the measurable rule exists, use it.
- **Does the lint actually match what you are about to write?** The gradient selector here matches
  Tailwind's `from-purple-* … to-pink-*` and nothing else; a CSS `radial-gradient` painting a dot
  field was never blocked. Read the selector before you decide you are stuck.

## A screen that claims a number has to be checked against its source

Reading a screenshot catches a wrong shape. It cannot catch a wrong number, because a number looks
correct however wrong it is. So when a surface prints a count, count the same thing yourself, from
the source, by a route that shares no code with the screen.

Done here on 2026-08-28, on the two counts the architecture canvas prints:

| Claim | Independent count | Result |
|---|---|---|
| source modules per role | `ls` of each role's glob base, minus dot-prefixed entries | six roles matched; one was over by one |
| reviewed concepts per role | the vault's own frontmatter `path` fields, matched against the same globs | all seven matched |

The one mismatch was real: a role listed `.gitkeep` as its first module and counted it. The point
is not the placeholder — it is that the defect was invisible to every other method. It survived
a full-page screenshot, a zoom, two fresh-eyes walkthroughs, and every gate, because "22" and "23"
look equally true.

Two things make the check worth trusting:

- **Take a different route to the number.** Reusing the screen's own function proves only that it
  agrees with itself. Here the comparison was a shell listing and a frontmatter scan, neither of
  which shares a line with the walk being audited.
- **Distrust the checker too.** The first version of the vault scan used `lstrip('./')`, which
  strips a *set of characters* rather than a prefix, and turned `.claude/…` into `claude/…` — a
  vault defect that did not exist. The same session's table scan had already produced twenty false
  hits by substituting inline code with a placeholder. A one-off script written to audit something
  is exactly as unreviewed as the thing it audits, so read its disagreements before believing them.

What this cannot do is stay green. It is a measurement, not a gate: role counts change whenever the
repository does. Gate the rule the measurement exposed instead — here, that a dot-prefixed entry is
not a module.


## Drawing depth: the techniques, and where each comes from

Everything above is a rule this repository paid for. This section is not — it is a **reference
shelf**, collected because the owner asked for the drawing techniques themselves rather than for a
verdict on whether depth is allowed. Nothing here has been used on a screen yet, and nothing here
is permission to use it. Kept separate on purpose, so a later reader cannot mistake a technique for
a measured rule.

### Depth without a 3D engine

An agent asked to draw something "in 3D" reaches for a renderer, and that is usually the wrong
first move: it costs a dependency, it cannot be diffed, and it cannot be asserted on. Every
technique below is a **parallel projection** — an affine transform of 2D coordinates — so it stays
plain SVG, stays deterministic, and stays testable the way the sketch strokes here already are.

**ISO 5456-3:1996**, *Technical drawings — Projection methods — Part 3: Axonometric
representations* (reviewed and confirmed 2025) is the standard for exactly this. It defines
parallel projection from an infinitely distant point onto one plane, and recommends three:

| Method | What it does | Where it fits |
|---|---|---|
| **Isometric** | Three axes at 120°, one scale on all three | Equal emphasis on all faces; the shape everyone recognises as "isometric" |
| **Dimetric** | Two scales — one axis foreshortened | One face is the subject and the other two are context |
| **Oblique** | The front face keeps its true shape, depth runs off at an angle | A face that must stay readable — a label, a diagram, a screen inside the drawing |

Oblique is the one that matters most for a drawing whose faces carry text, because it is the only
one that leaves a face undistorted. Cabinet oblique halves the depth axis; cavalier draws it full
length and looks stretched.

### Two illustration conventions worth knowing by name

- **Exploded view** — parts displaced along a shared axis so an assembly's order is visible without
  taking it apart. The convention that answers "what is inside this, and in what order".
- **Cutaway or ghosted view** — a surface removed or made transparent to show what it contains. The
  X-ray. This is the one the owner named for this product, and it is a drawing convention with a
  long technical-illustration history rather than a UI effect.

### Depth cues, in the order they work

Ranked by how strongly each carries depth on its own. The first is nearly absolute and the last is
nearly free to lose:

1. **Occlusion** — what covers what. The strongest, and the only one that survives every other
   choice.
2. **Relative size** — the same object drawn smaller reads as further away.
3. **Elevation on the surface** — how high in the frame something sits.
4. **Aerial perspective** — contrast and saturation falling off with distance. On a dark ground
   this is the cheapest and least destructive of the four.

Shadow deserves its own line, because on a dark ground it barely works: there is not enough range
below the background for a shadow to carry. **Material's dark-theme model uses the inverse** — a
surface at a higher elevation receives a semi-transparent light overlay, so **higher reads as
lighter**, with the alpha computed from the elevation. That is a published, directly usable rule
for a dark product, and it is what this repository's own elevated surfaces already do.

### The constraint that makes any of this safe here

This product's palette is neutrals plus one indigo, dark only, with no gradients, glow, or glass.
That rules out most of the ways depth is usually faked, and leaves the ones above — which is
convenient, because the ones above are the ones that survive being printed in one colour. If a
drawing needs a gradient to read as deep, it was relying on the weakest cue.


## Registering what you made

New visual language goes into `docs/DESIGN-SYSTEM.md` as its own section, with values as tokens
and a gate naming what would catch a regression. Design first, register second: deriving a new
surface from what already exists produced, twice here, a slightly different version of the thing
that was not working.
