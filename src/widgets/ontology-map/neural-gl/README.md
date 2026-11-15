# Neural's WebGL painter

Neural (the map's 3D view, arrangement `coupling`) is described once per drawn
frame by a `NeuralFrame` (`ui/frame-draw/neural-frame.ts`). This folder paints
that frame with three.js on a canvas beside the map canvas. Picking, turning,
the map probe and the names stay where they are; the painter only draws the
frame's screen coordinates, so a click selects the painted cell.

| Module | What it owns |
|---|---|
| `neural-gl-stage.ts` | the two sibling canvases, the state machine and the fallback order; created beside the light stage in `ui/frame-loop/use-topology-frame-loop.ts`; imports no `three` |
| `neural-gl.ts` | the `WebGLRenderer`, an orthographic camera in CSS pixels, nine instanced draws in one pass; loaded with `import()` on first entry to Neural |
| `neural-gl-buffers.ts` | the instanced records of one frame; reused arrays |
| `neural-gl-shaders.ts` | the cell (lit sphere), shell, spot (glow, ring, dot) and ribbon (quadratic) programs, and the shading constants |
| `neural-gl-probe.ts` | `window.__atlasMapNeuralGl` under `?e2e=1` |

## One opener

`neural-gl.ts` is the only file here that opens a WebGL context, and the
`webgl-context-census` contract licenses it. A mounted map holds one live
context: Neural's is created on first entry and disposed when Neural's ramp
returns to 0 or the map unmounts, and the light layer (`light/`) stands down
while Neural holds it.

## What it draws

The frame's marks, in the 3D look the canvas-2D fallback does not attempt:

- **Cells** are lit spheres on the frame's own disc (picking and names rely on
  it): one key light from the upper left, an ambient floor, a small highlight
  (none on a stale cell, so its amber holds), a capability's darker nucleus.
  Depth darkens a cell to `DEPTH_FLOOR` on top of the frame's alpha, and the
  frame's alpha mixes the cell with the ground, so a cell is opaque: it writes
  depth and hides farther cells and every connection behind it. A cell a
  selection has veiled writes no depth, so a lit connection crossing it stays
  whole.
- **Connections** are tapered ribbons at the canvas painter's widths, drawn
  behind every cell; a lit one keeps a soft glow that fades across its width.
- **Clusters** are shells: the pool's disc with ink rising toward its rim.

No bloom, post-processing or second render target; edges are antialiased in
the shaders, not by multisampling.

| Token | What it sets |
|---|---|
| `--map-neural-shell-alpha` | a cluster shell's rim at full strength |
| `--map-neural-lit-glow-alpha` | the soft light under a lit connection, at its centre line |

Every other ink and alpha is the canvas painter's (`read-neural-tokens.ts`).

## Canvases

`map-neural-gl` and `map-neural-names` sit directly after the map canvas,
`pointer-events: none` and `aria-hidden`. While WebGL paints, the map canvas
draws only the backdrop; the GL canvas is transparent and its CSS opacity is
Neural's ramp; the names canvas is a 2D canvas at the frame's pixel ratio on
which `paintNeuralNames` draws as before. The painter draws only inside a frame
the loop already draws: no shader term depends on time.

## Fallback order

Each step leaves the canvas-2D painter drawing the same frame:

1. `?neuralgl=off`.
2. No WebGL2 context (`webgl2Available()`, a throwaway context opened before
   the chunk is requested), or `webglAccelerated()` false, unless
   `?neuralgl=force` (which does not override a missing WebGL2).
3. The chunk import or `createNeuralGl` failing.
4. A lost context: canvas 2D until Neural is next entered.

While the chunk loads, canvas 2D draws. A leaving snapshot redraws the last
frame into the GL canvas in the same task and composites it with the names
(`composeNeuralSnapshot`), since the drawing buffer is not preserved.
