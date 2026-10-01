# The map's light layer

One WebGL2 canvas that draws light and nothing else: a travelling light along a
relation, a point of light at its head, and a bloom on the concept it reaches.
Concepts, labels, lines and hit-testing stay on the canvas-2D renderer. The
layer runs only in the Flat and Galaxy views, only for an event, and never under
reduced motion.

| Module | What it owns | Host call |
|---|---|---|
| `signal-plan.ts` | plans (focus, path), head position, arrival, bloom envelope, plan lifetime, the signalled-line registry | `planFocusSignal` · `planPathSignal` · `headAt` · `stepPlan` · `isPlanAlive` · `isEdgeSignalled` |
| `light-sources.ts` | the sources: each turns map state plus time into lights | `LIGHT_SOURCES` (one entry per source) |
| `light-frame-stage.ts` | creation in an idle callback, availability, per-frame prepare and render, the `lightActive` flag | `createLightFrameStage` from `ui/use-topology-frame-loop.ts` |
| `light-layer.ts` · `light-shaders.ts` | the WebGL2 context, two instanced programs, the canvas beside the map canvas; lazily imported | `createLightLayer` |
| `light-probe.ts` | `window.__atlasMapLight` under `?e2e=1` | `installLightProbe` |

## Frame

`prepare` runs after the reveal stage and before the presentation stage, so the
lines a light runs on are known when the canvas-2D draw asks
`isEdgeSignalled`: the ambient comet and the galaxy glint stand down on those
lines. `render` runs after the presentation stage and draws in the same frame,
from the same camera. The layer has no `requestAnimationFrame` of its own; while
a light is alive the frame gate keeps the loop awake through `lightActive`, and
once it is spent the layer clears once and makes no further call.

## Geometry

A signal is drawn on the line's own screen curve: the same projection as
`projectEdgePoints` in the 2D draw. Every light runs in its relation's direction
(`revealEnd`): a directional relation from its source to its target, whichever
end is focused or walked from, and a symmetric one from the attended end. It
leaves the rim of the concept it starts at and arrives at the rim of the concept
it reaches. A focus light never runs ahead of the drawn reveal span. A path
lights hop by hop in the walk's order; a hop the walk crosses backwards keeps
its place and lights source to target, and the stop it leads to blooms when the
hop is due. A path that appears while a concept is focused, or under the trail
lens, is held back and does not light later.

## Contracts the layer keeps

- Light only: two programs (a Gaussian strip along a quadratic, and radial
  blooms), additive inside the layer, `plus-lighter` against the map (`screen`
  where unsupported) set only while the canvas is visible, premultiplied output.
  The ink is `--map-indigo-bright`; there is no colour literal.
- One context per mounted map, created in an idle callback after the first 2D
  frame, 1 backing pixel per CSS pixel, released with `WEBGL_lose_context` on
  unmount. The host canvas's offsets are read when the size changes, not per
  frame. A software renderer gets no light unless the page asks with
  `?light=force`.
- An idle map draws 0 frames: nothing here runs without an event.
- Reduced motion: no canvas and no context; the reveal's snapped ink and the
  static ego glow carry the same facts.
- A new source adds one entry to `LIGHT_SOURCES` and one section to
  `docs/features/map/light.md`.
