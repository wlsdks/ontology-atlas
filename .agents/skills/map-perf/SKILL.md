---
name: map-perf
description: Measure topology-map drag, pan, and zoom with a deterministic harness that proves it grabbed a real node instead of silently panning the background.
---

# Map performance

Run when `pnpm design:route` includes `map-perf`. It proves the changed topology
gesture's work cost; add the separate `motion` change fact when temporal output
also changed.

This skill exists because a 2026-07-31 node-drag report was dismissed six times
while the measurement was actually panning the background. The two gestures look
the same from outside.

## Why grabbing a node is difficult

| | Node drag | Background pan |
|---|---|---|
| Cursor | `grabbing` | `grabbing` |
| Visible motion | one node | whole map |
| Physics | reheats through `heatRef` | remains idle |
| Measured cost at 3,000 nodes | about 140 ms/frame | about 2 ms/frame |

A pointer cursor is not proof of a grab. If `sim.hasNode()` is false, capture
fails silently and becomes a pan.

## Instrumentation: `?e2e=1`

The query enables a test-only `window.__atlasMap` surface:

```js
window.__atlasMap.nodes()
// [{ id, kind, label, x, y, draggable, hidden, radius, agentFocus }]

window.__atlasMap.interaction()
// { kind: "node" | "pan" | "idle", nodeId }
// Call during the gesture. A "pan" result invalidates the sample.

window.__atlasMap.backing()
// { width, height, dpr }
```

It also exposes `edges()`, `edgeAt()`, `camera()`, `selection()`, and `chips()`.
Implementation: the final effect in
`src/widgets/topology-map-v2/ui/use-topology-loop.ts`.

## Procedure

```bash
pnpm build && npx serve out -l 4173
node scripts/perf-node-drag.mjs
```

Discard output unless the harness explicitly reports a successful node grab.

## Four rules

1. Use real CDP mouse input through `page.mouse.*`. Synthetic PointerEvents are
   untrusted, cannot capture the pointer, and become pans.
2. Run headed. Headless rendering lacks display vsync and compositor
   backpressure; it measured 44fps where the real device measured 7fps. Only JS
   work cost transfers reliably.
3. Report `work`, not frame `gap`. Gap includes refresh rate and CDP round trips
   (about 24ms); work is time owned by Atlas.
4. Measure a control group such as `synth=31` beside `synth=3000`. The observed
   139.9ms versus 1.0ms exposes size-dependent cost directly.

## On-screen meter

Settings → Map background → Frame meter shows fps, worst frame, and jank count.
The worst frame matters more than average fps; one run had a 16.7ms median and a
150ms worst frame. Turning the meter off stops its measurement loop.

## Common traps

- Never reuse a fixed Chrome profile directory; a previous process can close the
  page and produce `Target page has been closed`. The harness uses a unique profile.
- Add `guides=off`; first-run overlays intercept input and create false 0.1ms work.
- fps changes in refresh-rate steps. Improvements below 8ms may appear only in
  `work`.

## Prefer browser-free measurement for pure physics

ForceAtlas2 cost is more accurately isolated without a browser:

```js
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
// Vary n and measure forceAtlas2.assign(g, { iterations: 3, settings }).
```

Measured 2026-07-31: n=800 took 5.6ms; n=3000 took 79.4ms, or 34.5ms with
Barnes–Hut. Cost grows roughly quadratically.

## Final proof

The harness measures Chrome, while the installed app uses WKWebView. After the
fix is clear in Chrome, measure once more in the installed app according to
`.claude/rules/surfaces.md` when the route includes desktop-shell. In every
case, use the computer-use capability to capture the reviewed app/window, accessibility
owner, and visible gesture state. The capture proves target/state identity; it
does not replace the work measurement or a routed motion recording.
