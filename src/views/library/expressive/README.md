# The Library's expressive layer

Self-contained pieces that give the Library a ground. Each is a pure module with its own
tests: plain data in, plain numbers out, no three.js, no canvas, no React, no DOM, no
clock. The hosts (`ui/parts/LibraryConstellation.tsx`,
`ui/parts/LibrarySynapseField.tsx`) own the frame, the device pixel ratio, the ink and the
sleep, and each is one call from `ui/LibraryPage.tsx`. Delete this folder and those two
hosts and the Library is back to a flat panel on a black field; copy the folder, the two
hosts and the tokens and the pieces work on any screen.

Same contract as `src/widgets/ontology-map/expressive/`, and the same reason: an effect
nobody can lift out is an effect nobody can remove.

| Module | What it owns | Host |
|---|---|---|
| `constellation-model.ts` | where a folder's marks go: pages on an inner shell, sources on an outer one, both on a Fibonacci spiral, each cited source pulled toward the page that cites it | `constellation-scene.ts` |
| `constellation-scene.ts` | the three.js object — instanced cubes and spheres, citation lines, fog, the slow turn, the pointer parallax | `LibraryConstellation.tsx` |
| `synapse-field.ts` | the ambient network: a jittered-grid field of drifting points, and which pairs are close enough to draw a line between | `LibrarySynapseField.tsx` |

## Where each one is drawn, and why only there

| Screen | Piece | Why |
|---|---|---|
| Library, no folder open | the constellation | It is the screen's **subject**: the shape of the thing a person is about to make, drawn whole beside the ask. The folder is anonymous and deterministic — never a claim about files they have. |
| Library, folder open, nothing selected | the synapse field | The stepper is the subject here and the field is **texture**. It draws no count and no link that exists, so there is nothing on it to mistake for a fact about the folder. |
| Library, folder open, nothing selected | **not** the constellation | Tried three ways and cut. A working folder's object is small — the frame that settled it had six documents and four write-ups — and ten marks across half a pane read as debris drifting into the cards, not as a ground. |

The distinction the third row protects is the one `docs/DESIGN-SYSTEM.md` states as *a mark
carries a fact or it goes*: the constellation's marks **are** facts, so they may only be
drawn where they can be read as facts. The synapse field is not a chart with its facts
filed off; it is a background on a screen that carries no chart.

## Tokens

All in `app/globals.css`.

| Token | Piece | Meaning |
|---|---|---|
| `--color-canvas-a70` | both | the vignette step that fades a field into the canvas at a pane's rim |
| `--library-empty-max` | empty state | the cap on the copy-plus-object row, so the two do not drift apart on a wide monitor |
| `--library-empty-object-max` | empty state | the object's own box, square at every width and capped so it never out-weighs the ask |

A glass panel over the object was built and cut in the same session — the copy stands
beside the object now, not on it — and its three tokens (`--color-panel-a80`,
`--color-panel-a92`, `--library-glass-blur`) went with it. So did `--library-spine-rim`,
whose only consumers were the shelf's coloured rims. An unused token is misinformation.

Ink comes from the existing ramps and is read at mount:
`--color-text-secondary` (sources), `--color-text-primary` (pages),
`--color-indigo-accent` (page emission), `--color-indigo-brand`
(citation lines), `--color-text-quaternary` (synapse points and links).

## Contracts the pieces keep

- **Reduced motion stops them dead.** Neither host registers a loop; each draws one still
  frame of a deterministic field. Measured in the browser 2026-09-09: **0 rAF callbacks
  per second** under `prefers-reduced-motion: reduce`, against 120 with it off.
- **They sleep.** Both use `ambientSleepFactor` from the map — full speed until 30s after
  the last input, a 2s deceleration to a complete stop, and any input restores them on the
  next frame. Both release their frame callbacks while asleep, hidden or outside the
  viewport; the synapse field also parks when covered. A returning constellation resumes
  assembly at its visible-time phase, including a model replaced while hidden. Both use
  a fresh wake clock and keep the settled still if viewport observation is unavailable.
  Resizing a sleeping constellation repaints the canvas instead of leaving its cleared
  backing buffer blank.
- **Nothing moves fast.** The constellation takes four minutes for one turn; a synapse
  point travels under a tenth of a pixel per frame. Nothing crosses the eye while a
  sentence is being read — which is the rule the Library's own 2D graph was corrected on
  when its ambient drift was cut (`docs/DECISIONS.md`, 2026-09-08).
- **They are `aria-hidden` and `pointer-events-none`,** and that is a statement rather
  than an omission: every fact the constellation draws is also in the copy on top of it,
  so a reader who never sees a canvas loses nothing.
- **They are deterministic.** Same folder, same object; same seed, same field. A screenshot
  gate can compare two frames, and a reduced-motion viewer gets a considered still rather
  than whatever `Math.random` produced that second.
- **They degrade to nothing.** No WebGL context, or no 2D context, and the host keeps the
  screen that shipped before the folder existed.

Decision: `docs/DECISIONS.md`, 2026-09-09 "The Library gets a ground".
