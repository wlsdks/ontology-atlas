# Inspecting the Map from Outside — `window.__atlasMap`

> **One-liner**: States that cannot be distinguished from outside cannot be inspected from outside.
> The map is a single canvas with no DOM — if state is not explicitly exported,
> automation merely «pretends to see» the screen while measuring the wrong things.

## Why This File Exists

On 2026-07-31, the owner reported node drag lag. I replied **six times in a row**
that "It's not slow in my environment." Each time, I pushed back the blame.

The cause was not code but **observability**:

| What's seen from outside | What actually happens |
|---|---|
| Cursor `grabbing` | Node drag **or** background pan — same text |
| Cursor `pointer` | Just a hover hit, irrelevant to **whether it's grabbed** |
| Frame 60fps | App is fast **or** input didn't reach the canvas |
| rAF interval 8.3ms | App workload **or** just a 120Hz refresh interval |

All four lines were wrong because they looked only at the left and concluded about the right. It ended only after the owner pointed out, looking at the screen,
*"You're just shaking the background, not the nodes."*

**Things that can only be known by humans looking at the screen are blind spots for automated inspection.** Eliminating these blind spots is the purpose of this hook.

## How to Enable

`window.__atlasMap` is attached only when `e2e=1` is in the URL. **This is not a product API** —
without the query parameter, the object itself does not exist; even when present, it's just
a getter that reads refs at that moment, so frame cost is 0.

```
http://localhost:4173/ko/topology?synth=3000&t=freeze&guides=off&e2e=1
```

Implementation: Last effect in `src/widgets/topology-map-v2/ui/use-topology-loop.ts`.

## Interface

### `nodes()` — What is where, and what can be dragged

```js
[{ id, kind, label, x, y, radius, draggable, hidden }]
```

- `x`/`y` — **CSS pixels** (mouse coordinate system). Since `screenToWorld`'s inverse function is calculated with the same
  camera, they cannot be misaligned.
- `radius` — **Screen radius.** Uses the same formula as the drawing side (`radiusForKind ×
  magnitudeScale × camera scale`). If the formula changes, the trigger measures self-imagination rather than the screen. Overlaps cannot be counted without this value.
- `draggable` — **Is it in the simulation?** Grabbing requires passing `sim.hasNode()`, and
  if it fails, it silently flows into panning. **Not checking this caused six errors.**
- `hidden` — Folded by density gate, not on screen.

### `edges()` — Where lines pass through

```js
[{ sourceId, targetId, kind, ax, ay, bx, by, controlX, controlY }]
```

Added on 2026-08-03. Until then, **there was no metric for whether the map was readable as a graph** — node specs had contract tests, type ramps had linting, motion had frame measurements, but the layout occupying most of the screen was judged merely by "looks complex".

- **Why control points are needed**: These edges are not straight lines but quadratic Beziers
  (`quadraticCurveTo`). Connecting only endpoints and counting intersections **counts intersections not on screen
  and misses those on screen** — the number is produced, so this error is silent.
- Edges touching folded subtrees are excluded. Same condition as the first gate in the draw loop.
- Consumer: `scripts/measure-graph-readability.mjs`.

### `interaction()` — Is what's being dragged a node or the background?

```js
{ kind: "node" | "pan" | "idle", nodeId }
```

Called **during** drag. If `"pan"`, that measurement is invalid. This single line prevents the entire incident above.

### `backing()` — Canvas backing size

```js
{ width, height, dpr }
```

Confirms whether resolution capping **actually engaged** during interaction. There have been precedents where we believed it was "fixed" but it never even fired.

### `camera()` — Where the map is looking

```js
{ x, y, scale, width, height }
```

For verifying deep link landing, camera dive, and FitView. There was an actual defect where "the target was calculated correctly but the camera didn't move," and without this window, we failed to prove it.

### `selection()` — What is selected

```js
{ nodeId, edge }
```

### `chips()` — The chip's **claim** vs. **reality**

```js
[{ parentId, claimedCount, expanded, shownChildren }]
```

There have been cases where a chip was engraved with `+24` but only one was actually drawn (the tier gate didn't support chip deployment). **You must display the claim and reality side-by-side** so that discrepancies can be caught externally.

## How to use

```bash
pnpm build && npx serve out -l 4173
node scripts/perf-node-drag.mjs
```

If the output does not contain `node noise ✓`, discard that metric—the harness judges it itself.

**Readability** (crossings · overlaps) is a separate harness and requires no real input, so it is headless:

```bash
node scripts/serve-static-export.mjs --port=4173 &
node scripts/measure-graph-readability.mjs
```

Because the batch is deterministic, two runs under the same conditions are **byte-for-byte identical** (empirically). Thus, this metric can be used for regression testing. Baseline as of 2026-08-03 (1512×900, after convergence):

| Case | Visible nodes/edges | Crossings | Quality | Overlaps |
|---|---|---|---|---|
| Dogfood vault | 31 / 66 | 89 | 0.9508 | 0 |
| Synthetic 300 | 72 / 80 | 23 | 0.9920 | 0 |
| Synthetic 3000 | 86 / 18 | — | Cannot measure (folded) | 0 |

⚠️ **Do not read "cannot measure" as a perfect score.** If the density gate folds a subtree and all remaining edges share endpoints, crossings become fundamentally impossible—treating that as quality 1 would lead to the opposite conclusion that "larger vaults are better." Therefore, it emits `null` along with the reason.

**Why trust overlap 0** — because it distinguishes from the detector being idle. Since the calculation is a pure function outside the page (`scripts/lib/graph-readability.mjs`), you can feed in known answers, and `tests/contract/graph-readability.contract.test.ts` does exactly that. We injected four types of defects (current line regression · sweep axis inversion · endpoint-sharing pair miscount · overlap threshold weakening) and confirmed they all turn red.

The full procedure and pitfalls are in the `/map-perf` skill
(`.claude/skills/map-perf/SKILL.md` · `.agents/skills/map-perf/SKILL.md`).

## Four Measurement Disciplines

These are the things that actually went wrong in this incident.

1. **Use real mouse only** (`page.mouse.*`). `new PointerEvent(...)` created within the page has `isTrusted: false`, causing `setPointerCapture` to be rejected and node capture to break, **drifting into pan mode.**
2. **`headless: false`.** Headless mode lacks display, so there is no vsync or composite backpressure. **Headless fps does not translate to real devices** — only JS cost translates. Empirical: the same code ran at 44fps headless / 7fps on a real device.
3. **`work`, not `gap`.** The rAF interval is contaminated by frame rate and harness round-trip (one CDP call ≈ 24ms). The time the callback spends synchronously is our share.
4. **Measure the control group together.** Placing `synth=31` next to `synth=3000` immediately reveals whether cost scales with node count (empirical: 139.9ms vs 1.0ms).

## Screen Instrument

Settings → "Map Background" → **Frame Instrument** (off by default). Bottom-right of the map shows
`fps · worst ○○ms · stutter ○`. **The worst interval is more important than fps** — stuttering is in the tail, not the average (empirical: median 16.7ms but worst 150ms). If it's off, the measurement loop doesn't even run — a performance counter that eats performance is a liar.

When something can only be reproduced on the user's device, telling them to turn this on is the fastest path.

## Final Gate

This hook and harness measure **Chrome**. The product surface is Tauri (WKWebView), so the engine differs. Once a prescription is confirmed in Chrome, you must re-test it in the installed app (`.claude/rules/surfaces.md`).
