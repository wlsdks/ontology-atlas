# The map's expressive layer

Self-contained pieces that give the map weight, light and a press. Each is a
pure module with its own tests: plain data in, plain calls out, no React, no
DOM, no knowledge of the world model or the camera. The host (`ui/use-topology-loop.ts`,
`ui/topology-frame-draw.ts` and its `ui/frame-draw/` passes) call one function per piece per frame and owns
every ref. Delete the folder and the call sites and the map is back to critical
damping and flat marks; copy the folder and the tokens and the pieces work on
any canvas graph.

| Module | What it owns | Host call |
|---|---|---|
| `mass-spring.ts` | mass from degree, the release spring per mass, a damped-spring step, the press step response, the drop velocity cap | none directly |
| `release-offsets.ts` | one `SpringOffset` per node: lag while dragging, spring home on release, the drop seed, velocity smoothing | `stepLagOffset` · `stepHomeOffset` · `seedDropOffset` · `smoothVelocity` · `isOffsetAtRest` |
| `ego-light.ts` | the bloom under a node, the glow on ego lines | `drawNodeBloom` · `beginEdgeGlow`/`endEdgeGlow` |
| `edge-reveal.ts` | a selection's lines drawn from their current ink, source to target (symmetric ones from the selected end), on the centre's ego-reveal ramp; comets stay inside the drawn span | `edgeRevealProgress` (traces split the curve with `partialQuadratic`) |

## Tokens

All in `app/globals.css` under the `--map-*` ramp and read through
`tokens/read-map-tokens.ts`:

| Token | Piece | Meaning |
|---|---|---|
| `mass-heavy-degree` | mass | degree at which a node is fully heavy |
| `mass-angfreq` · `mass-heavy-zeta` | mass | the release spring's ω (one value for every node, at the stability bound `spring-stability.contract.test.ts` proves) and its ζ at full mass |
| `mass-drop-max-px` | drop | the farthest a released node carries past its drop point |
| `press-angfreq` · `press-zeta` | press | the hovered node's underdamped step |
| `ego-glow-blur-px` · `ego-glow-alpha` · `node-bloom-blur-px` · `node-bloom-alpha` | light | the bloom under the focused or hovered node and the glow on its lines |

## Contracts the pieces keep

- Every effect rides a ramp the host already has (focus, emphasis, the drag
  heat) and paints nothing at 0. Nothing at rest glows or moves.
- Reduced motion: the host passes snapped ramps and skips the seeds, so every
  end state lands with no ring and no travel.
- The idle canvas still draws zero frames; the pieces add no clock of their own.
- Ego light is 2D only; the 3D views keep their own depth grammar.
- A mark carries a fact or it goes. The ground halo shipped here on 2026-09-08 and
  the council cut it the same day: its radius said "this is the neighbourhood" while
  enclosing 290 non-neighbours out of 410 nodes over 36 focus states.

Decision: `docs/DECISIONS.md`, 2026-09-08 "The expression bans are lifted".
