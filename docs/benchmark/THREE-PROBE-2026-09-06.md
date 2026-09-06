# three.js structure probe, 2026-09-06

A **trial, not a feature.** The owner asked two questions on 2026-09-06: try
three.js on the map's 3D view and compare it with what ships, and look for a 3D
structure better suited to an ontology than the cone. This file is the answer;
nothing here is on by default and no decision record was written, because the
decision is the owner's to make from this page.

Everything below was measured on this laptop against the running static export
(`node scripts/serve-static-export.mjs --port=5540`) at 1512×982, device pixel
ratio 1, dark, in an isolated Chromium (ANGLE/Metal), not the owner's browser.
The display runs at 120 Hz, so **8.33 ms is the floor**, not a good score.

## How to open it

```bash
pnpm build && node scripts/serve-static-export.mjs --port=5540
open "http://127.0.0.1:5540/en/topology/?e2e=1&guides=off&three=1"
```

`?three=1` plus the map's own 3D switch (`atlas.appearance.view3d`) is the only
door. The probe puts a WebGL canvas over the map area and a four-button toolbar
top-left, Cone · Strata · Shells · Cloud, offset by
`--topology-v2-safe-inset-left` so the INDEX panel does not cover it. Add
`&synth=1000` (or up to 10000) for the synthetic vault.

## What was built

| Piece | Where |
|---|---|
| Flag, layouts, types | `src/widgets/topology-three-probe/model/` |
| WebGL renderer (the only file importing `three`) | `src/widgets/topology-three-probe/ui/probe-scene.ts` |
| Flag-gated shell, toolbar, label layer | `src/widgets/topology-three-probe/ui/ThreeProbeMount.tsx` |
| The one mount | `src/views/home/ui/HomePage.tsx` (10 lines beside the map) |

**Cone and Cloud are not re-derived.** They call `buildDomeModel` from
`topology-map-v2`, the same placement the 2D loop uses, so the twin draws the
arrangement the engine computes rather than a lookalike. That required naming
the placement in `topology-map-v2/index.ts`'s public API (the ESLint slice rule
forbids reaching inside a slice). It is a widget→widget edge the architecture
rules discourage and
`tests/contract/same-layer-cross-import-ratchet.contract.test.ts` counts, so
**that contract test now fails on one new row** (`widgets:topology-three-probe->topology-map-v2: 2 (ledger 0)`), deliberately left
failing rather than edited, because a shipped version should move `dome-view`'s
placement down a layer instead of buying a ledger entry. `pnpm exec tsc
--noEmit`, `pnpm lint` and `pnpm build` are green.

Selection goes through the page's own handler: clicking a node in the probe
opens the same inspector and lights the same INDEX row as the 2D map. Hover
raycasts. Orbit, damping (`ORBIT_SMOOTH_TAU_MS`), the 48 s idle spin
(`DOME_PERIOD_MS`) and the pitch limits are the shipping constants, not new
ones. With WebGL unavailable the overlay unmounts, one console note is written
and the 2D draw underneath keeps working, verified with WebGL disabled:
overlay count 0, map canvas count 1, note printed.

## The design pass, and why there are before/after shots

The first build was honest geometry and ugly. Rendered on the synthetic vault
it showed two dozen grey translucent spheres and labels stacked on each other,
and the owner said so. Three things changed, and the "before" screenshots are
kept so the difference is checkable rather than claimed:

1. **Containment volumes became hairlines.** A shell was a translucent sphere
   at 0.07 alpha; twenty-four of them read as frosted lampshades hiding their
   own contents. A shell is now three great circles and a stratum two rings, all
   hairline, at ≤ 0.12 alpha. A boundary is a line you see through.
2. **Labels stopped colliding.** Project and domain always; a capability only
   inside the ego set or under the pointer; an element only on hover or when
   selected. On top of that a screen-space collision pass runs every frame , 
   candidates sorted by selection, hover, then tier, and a box that intersects
   one already placed is dropped, so the coarse level never loses to a leaf.
   Labels use the app's type ramp (`text-label` 11 px, `text-body` 12.5 px for
   the selection) with a four-offset one-pixel outline in the canvas colour , 
   an outline, not a glow.
3. **Depth without a fog colour.** Brightness falls with camera distance, down
   to 0.62, and only on the two lower tiers and the edges; the top two tiers
   keep their full value. Refreshed at most every sixth frame and only when the
   camera actually moved.

Node shapes and colour are the Node Spec and nothing else: project hexagonal
prism, domain cube, capability sphere, element small cube, radii in the
30/17/11/7 ratio; matte Lambert under one hemisphere light plus a low ambient;
the neutral tier ramp (`--topology-v2-ink-depth-*`) read from the app's own
tokens at runtime; the selection and its edges in the one indigo
(`--color-indigo-accent`); containment solid, dependency dashed and paler.

## Screenshots

All on the **sample vault** (125 concepts, 258 relations, 9 domains) at
1512×982. In `/Users/jinan/side-project/ontology-atlas/.claude/shots-2026-09-06/`:

| Frame | Before the design pass | After |
|---|---|---|
| Cone overview | `three-before-cone-overview.png` | `three-cone-overview.png` |
| Cone, project selected | `three-before-cone-project-selected.png` | `three-cone-project-selected.png` |
| Cone, domain selected | `three-before-cone-domain-selected.png` | `three-cone-domain-selected.png` |
| Strata overview | `three-before-strata-overview.png` | `three-strata-overview.png` |
| Strata, project / domain selected | `three-before-strata-*-selected.png` | `three-strata-*-selected.png` |
| Shells overview | `three-before-shells-overview.png` | `three-shells-overview.png` |
| Shells, project / domain selected | `three-before-shells-*-selected.png` | `three-shells-*-selected.png` |
| Cloud overview + selections | `three-before-cloud-*.png` | `three-cloud-*.png` |
| Today's shipping Cone-2D |, | `three-cone2d-overview.png` |
| Synthetic 1,000 (three structures) |, | `three-synth1000-{shells,strata,cone}.png` |

Recording: `three-probe-orbit.mov`, 12.0 s, 3024×1800, ~58 fps, a real macOS
`screencapture -v` of the isolated window: four seconds of hand orbit on the
cone, then Strata → Shells → Strata through the toolbar so the morph between
structures is visible.

## Frame time during orbit

Three seconds of continuous pointer drag across the canvas centre, frame
intervals collected by a `requestAnimationFrame` sampler in the page. "Dropped"
counts frames longer than 16.7 ms, i.e. two missed refreshes at 120 Hz.

### Sample vault (125 concepts)

| Engine · structure | p50 ms | p95 ms | max ms | dropped |
|---|---|---|---|---|
| Cone-2D (ships today) | 8.30 | 8.40 | 9.3 | 0 / 421 |
| Cone-WebGL | 8.30 | 8.60 | 24.9 | 1 / 423 |
| Strata-WebGL | 8.30 | 8.40 | 9.2 | 0 / 421 |
| Shells-WebGL | 8.30 | 8.50 | 9.2 | 0 / 421 |
| Cloud-WebGL | 8.30 | 8.50 | 9.3 | 0 / 421 |

### Synthetic 1,000 nodes (`?synth=1000`)

| Engine · structure | p50 ms | p95 ms | max ms | dropped |
|---|---|---|---|---|
| Cone-2D | 8.30 | 9.10 | 16.6 | 0 / 456 |
| Cone-WebGL | 8.30 | 8.90 | 25.1 | 2 / 488 |
| Strata-WebGL | 8.30 | 8.90 | 16.7 | 1 / 467 |
| Shells-WebGL | 8.30 | 9.10 | 16.7 | 3 / 474 |
| Cloud-WebGL | 8.30 | 9.20 | 17.6 | 4 / 482 |

**At the sizes the brief asked about, the measurement finds no difference.**
Both engines sit on the display's 8.33 ms floor at 125 and at 1,000 nodes; the
handful of long frames in the WebGL rows are single events, not a pattern. Any
argument for or against three.js has to be made on reading, not on speed.

### Where it breaks (5,000 nodes, beyond the brief)

| Engine · structure | p50 ms | p95 ms | max ms | dropped |
|---|---|---|---|---|
| Cone-2D | 33.3 | 33.6 | 50.1 | 244 / 244 |
| Cone-WebGL | 33.3 | 33.6 | 57.8 | 245 / 245 |
| Strata-WebGL | 33.3 | 33.5 | 41.7 | 244 / 244 |
| Shells-WebGL | 33.3 | 33.8 | 41.8 | 244 / 244 |

Both land at ~30 fps; **WebGL buys no headroom here.** An earlier run put
Cone-2D at 25.1 ms p50 against WebGL's 33.3, so the honest reading is "the same
band, run to run", not "2D wins". Two caveats, both real:

- The probe is a straight, unoptimised twin, no level of detail, no instance
  culling, MSAA on, a React commit per frame for the label layer. A zoom-out
  test at 5,000 (40.9 → 33.4 ms p50) ruled out fill rate, and the bound was not
  isolated inside the timebox.
- The Cloud row at 5,000 is excluded. Switching to it blocks the main thread for
  **3.24 s** because the probe builds the coupling cloud synchronously; the
  shipping engine slices exactly that work through `beginDomeModelBuild`. The
  sampler's post-stall numbers are not comparable.

## JS payload

Measured as every `.js` file the exported `/en/topology/index.html` references.

| | files | raw bytes |
|---|---|---|
| `origin/main` | 41 | 3,587,286 |
| with the probe | 41 | 3,593,918 |
| delta | 0 | **+6,632 (+0.18 %)** |

That 6.6 kB is the flag-gated wrapper. `three` itself is a separate chunk of
**548,469 B raw / 137,606 B gzip**, and **none of the 41 eagerly referenced
files contains it** (checked by string, not by faith), it is fetched only when
`?three=1` and the 3D switch are both on. Versions: `three` 0.185.1
(`dependencies`), `@types/three` 0.185.4 (`devDependencies`).

## What each structure gains and loses

**Cone-WebGL.** The same arrangement the map already draws, in a real renderer.
Tier legibility and containment are unchanged, because the placement is
unchanged. What it gains is honest solids and lighting: a hexagonal prism, a
cube and a sphere are told apart by shading rather than by outline, so kind
survives at small sizes better than it does in the 2D projection. What it loses
is the 2D engine's bowed relation curves, the probe draws straight segments, so
dependency lines cut through the cone instead of riding its surface, and the
crossing count reads worse than the shipping view at the same angle. "Where am
I" is answered exactly as today: height is tier, the bump under a parent is
ownership.

**Strata.** The best tier legibility of the four, and by a distance. Four
labelled planes with a hairline disc under each make "which level am I looking
at" a glance rather than an inference, and because a child keeps its parent's
angular sector, containment drops are short, near-radial and cannot cross
between siblings. That is the layered-radial-DAG property, and it is visible:
in the sample all nine domain labels stay on screen with no collisions. What it
loses is compactness, a plane fills its whole disc rather than clustering under
its parent, so the silhouette is wider and cross-plane dependency lines run
long and shallow, which is where its crossings come from. It is the structure to
pick if the question is *what kind of thing is this and what level is it on*.

**Shells.** The only structure that shows containment as **enclosure** rather
than as altitude, and the only one that answers "what is inside this domain" by
pointing rather than by tracing edges. A domain is a boundary you can see
through, its capabilities are satellites on it, its elements cluster on their
capability, and the orbit radius is solved so no two shells intersect. What it
loses is the tier ladder: height carries nothing, so project/domain/capability/
element are told apart only by shape and size, and dependency edges between
distant domains cross the whole scene with nothing to ride on. Also the
weakest at scale, twenty-four boundaries at 5,000 nodes is a lot of line even
at 0.10 alpha. It is the structure to pick if the question is *what belongs to
what*.

**Cloud-WebGL.** Kept because it was cheap (it is the shipping coupling
arrangement). Reads coupling well and containment not at all, exactly as it does
in 2D, and it is the one structure whose build cost is superlinear.

## Recommendation

Do not adopt three.js for the shipping map on this evidence: at both the sizes
that matter it is not faster, it costs 137 kB gzip, and its only measured
reading gain, solid shaded kinds, is available to the canvas-2D engine too.
Do keep **Strata**, which is the real find here: it answers the tier and
containment questions better than the cone does, and its placement is about
eighty lines of pure geometry that the existing 2D projection can draw with no
new dependency at all. Shells is the right picture for one narrower question
("what is inside this domain") and would be worth a second look as a focused
mode, not as the default map. If three.js is adopted later it should be for
something the 2D engine genuinely cannot do, true occlusion, thick lines, or
depth-correct labels, and that case has not been made yet. The next cheap step
is to port Strata into `dome-view.ts` as a third arrangement beside Cone and
Cloud and put it in front of the owner on the real vault.

## Known gaps

- The same-layer ratchet contract test fails on one new row (above).
- The probe re-implements orbit, fit and labels rather than reusing the 2D
  loop's, so its feel is close to but not identical with the shipping 3D view.
- Dependency edges are straight segments; the shipping engine bows them.
- No test file: a probe that may be deleted next week does not earn a suite.
- The 5,000-node bound was not attributed.
