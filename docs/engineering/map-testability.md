# Inspecting the Map from Outside — `window.__atlasMap`

> **One-liner**: States that cannot be distinguished from outside cannot be inspected from outside.
> The map is a single canvas with no DOM — if state is not explicitly exported,
> automation merely «pretends to see» the screen while measuring the wrong things.

## Why This File Exists

Canvas state is invisible from outside unless exported; this hook exports it.
A cursor, a frame rate, or a rAF interval cannot tell a node drag from a
background pan, so automation that reads only those measures the wrong thing.

## How to Enable

`window.__atlasMap` is attached only when `e2e=1` is in the URL. **This is not a product API** —
without the query parameter, the object itself does not exist; even when present, it's just
a getter that reads refs at that moment, so frame cost is 0.

```
http://localhost:4173/ko/topology?synth=3000&t=freeze&guides=off&e2e=1
```

Implementation: Last effect in `src/widgets/ontology-map/ui/use-topology-loop.ts`.

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

Procedure and pitfalls (real mouse input, headed runs, `work` not `gap`, a
control group, and the on-screen Frame meter under Settings → Map background):
the `/map-perf` skill (`.claude/skills/map-perf/SKILL.md` ·
`.agents/skills/map-perf/SKILL.md`).

## Final Gate

This hook and harness measure **Chrome**. The product surface is Tauri (WKWebView), so the engine differs. Once a prescription is confirmed in Chrome, you must re-test it in the installed app (`.claude/rules/surfaces.md`).
