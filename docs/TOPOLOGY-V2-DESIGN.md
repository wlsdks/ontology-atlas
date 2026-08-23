# TOPOLOGY-V2 DESIGN — Presentation Architecture Design (Phase 1)

> **Historical implementation record (superseded, 2026-07-27).** This document
> preserves the measurements and decisions that led to `topology-map-v2`; its
> descriptions of coexisting DOM/Sigma engines and future migration phases are
> not current runtime instructions. The shipped contract is one canvas-2D
> engine. Use `docs/TECH-STACK.md`, `docs/TOPOLOGY-FOCUS-AND-SCALE.md`,
> `docs/FEATURES.md`, and current source for maintenance.
>
> Input: `docs/prototypes/topology-b2plus.html` (approved B2+ "Circuit × Constellation"
> prototype) · `docs/plans/TOPOLOGY-V2-PHASE0.md` (measured bottleneck + adapter contract draft) ·
> `docs/archive/SIGMA-PLAYBOOK.md` (Sigma v3 built-in feature contract — investigated but v2 does not
> adopt Sigma, archived) · `docs/INTERACTION-DESIGN.md`
> (fluid interface principles) · `.claude/rules/design.md` · `docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md`
> (Design Gate · Graph Engine Fit Gate · Attention Layer Model · State Contract ·
> 14-inch rule) · design-guardian terrain map verdict (layer (b) item).
>
> The visual language is **finalized** (owner approved, B2+). This document only determines the
> **presentation architecture** to translate that language into actual code — it does not propose
> new visual designs.

## 0. Design Gate — compact pass

```md
PO: The observed phenomenon is [Phase 0 Measurement] — the map (TopologyMapCanvas, DOM/CSS) and graph
(SigmaTopology, WebGL) engines draw the same vault with different code, and one of them (Sigma)
incurs a 194ms click latency + 73ms forced reflow while carrying 38 effects · 11k lines of dead code (SigmaSkeletonCards). With B2+ approval, "what to draw" is settled, but without "how to draw it," implementation cannot start. Verdict: Shape a design slice (under Slice 2 P2~P6).
Interaction Designer: Post-click states react differently across map/graph engines (focus method, popover anchoring, dim rules exist separately in both codebases) — we need one state machine for one canvas.
Information Designer: The kind hierarchy (project⊃domain⊃capability⊃element) and
freshness (fresh/stale/hub) are already encoded as shape+border+engraved numbers in the B2+
prototype — there is simply no adapter connecting this to actual vault data.
macOS Workbench Designer: On a 14-inch viewport, nothing else may overlap except one popover and two utility chips (altitude + hint) — B2+ was already designed with "no panel" as a premise (§5).
Design Systems Engineer: All colors/dimensions/durations in the prototype are hardcoded JS
constants — without `--topology-v2-*` tokenization, they remain an unreproducible "feel" (§2).
Agent Handoff Designer: The current popover (tip) lacks next actions for MCP/CLI — while typed
facts (hub/freshness/count) exist, "so what should the agent do?" is missing. Must add in P4.
Design verdict: Shape a design slice → this document is that slice's architecture.
```

## 1. Engine Selection (Core Decision)

### 1.1 Graph Engine Fit Pass (PRODUCT-DESIGN-OPERATING-SYSTEM.md format)

```md
Graph engine fit pass
- User moment: overview scan → click focus (circuit dive) → relation
  inspect (popover) — B2+ merges these three moments into one continuous zoom.
- Current stack: TopologyMapCanvas (single container CSS transform, 538 lines + 79 lines
  camera.ts) map tab / SigmaTopology (WebGL, 3833 lines, 38 effects) graph tab +
  ~30 auxiliary modules under topology-map-sigma/lib.
- Observed failure: Phase 0 measurement — Sigma click causes 73ms forced reflow (inside the library's own resize(), not our code) + initial load 1412ms (2x compared to map).
  This is not a bottleneck "we can fix" but the structural cost of the WebGL engine itself.
- Missing capability: B2+ requires **unique polygons per kind** (hex plates, square chips, via pads), **shape morphing** converging corner-radius to circles as zoom increases, **engraved (embossed) numeric text**, **4-point diffraction spikes**, and star-dust textures. This set of shapes cannot be created with Sigma's built-in node programs (`NodeCircleProgram`/
  `NodePointProgram`) or official extension packages (`@sigma/node-border`/`node-image`/
  `node-piechart`/`node-square`) — it falls under the "custom GLSL programs are a last resort" category specified in SIGMA-PLAYBOOK §1.5.
- Can current stack solve it? No — nodeReducer/edgeReducer/camera API /
  label LOD settings (§1.1~1.4) only adjust color, size, hidden state, and label density. Polygon
  geometry, engraved text, and diffraction spikes require writing new shader-level custom programs (vertex/fragment GLSL, VAO/VBO management, clipspace coordinate transformation),
  which is a subsystem replacement, not configuration tuning.
- Candidate alternative: (1) Create 5 new custom GLSL programs on top of Sigma
  (hex/square/via/spike/engraved-text) (2) Extend TopologyMapCanvas (DOM/CSS)
  to approximate shapes with SVG/CSS (3) Create a **dedicated canvas-2D
  renderer** identical to the prototype.
- Tradeoff:
  - (1) Sigma+GLSL: While WebGL has throughput advantages for large datasets (5k+), semantic
    zoom already caps exposed nodes to ~40~120 (overview-first contract, §4), making this advantage meaningless. A solo developer would continue carrying the burden of 5 GLSL shaders + StrictMode double mount + WebGL context exhaustion (8–16 per browser, §6 pitfall7) + 38-effect cascade legacy. Rewriting prototype's `roundedPolygonPath`/
    `drawEngraved`/`drawSpike` in shaders costs multiples of the original.
  - (2) DOM/CSS extension: TopologyMapCanvas's "0 per-frame DOM writes" contract (camera is
    one container transform) can be preserved, but sub-pixel shapes like engraved text shadows, diffraction
    spikes, and star-dust would increase DOM node counts per kind/shape if built with CSS/SVG combinations, exactly reintroducing the "DOM churn"
    problem identified in Phase 0.
  - (3) Dedicated canvas-2D: The prototype **is already completed on this path** —
    `roundedPolygonPath`/`hexPoints`/`squarePoints`/`drawEngraved`/
    `drawSpike` are all implemented with pure Canvas 2D API (`ctx.arc`/`quadraticCurveTo`/
    `createLinearGradient`) and verified at ~60fps for 40-node scale.
    Immediate-mode rendering means zero React reconciliation·WebGL context·shader compilation
    costs. Maintenance surface = pure function modules (shapes/edges/camera) + single `<canvas>` component — much smaller than Sigma's shader+38-effect legacy.
- Decision: **(3) Replace subsystem with dedicated canvas-2D renderer.** The condition for "proving needed capability" via prototype spike (Fit Gate "Spike an alternative only when the current stack cannot prove a needed capability after one narrow experiment") is met — the B2+ prototype itself was that narrow
  experiment. This is not renderer shopping because it "looks smoother," but the result of structurally verifying the shape set required by the owner-approved visual language.
- Proof: P5 includes screenshots for 1920/2560/14-inch/compact screens + Phase 0 scenario
  a/a′/b/b′/c production build remeasurement + Design Guardian verdict + installed app evidence (§5).
```

### 1.2 Unifying Two Living Views — Explicit Unification Recommendation

Phase 0 §1 identified that the three render paths confirmed (Map tab `TopologyMapCanvas`, Graph tab
`SigmaTopology`, Project detail neighbor map `SigmaTopology minimal`) are already problematic from the owner's
"mode proliferation aversion" ([[owner-topology-taste]]) perspective — one vault
is drawn by three different codes. B2+’s continuous smoothstep transition (circuit ↔
constellation, no mode flip) is a design that renders the "map vs graph" dichotomy
meaningless at the render level: zoom in for circuitry (details closer to a graph), zoom out for star maps (overviews closer to a map) — **one camera axis absorbs both legacy modes.**

**Decision: v2 integrates into a single render engine (`TopologyMapV2`).** All three callers—Map tab,
Graph tab, and Project detail neighbor map—invoke the same component with
`TopologyMapV2Props` (Phase 0 §4.2, updated below in §4). The `minimal`
prop remains unchanged (embedded zoom-out mode).

**Explicitly out of Phase 1 scope**: Whether to remove the "map/graph **tab UI** itself"
is an IA (Information Architecture) decision separate from render engine integration. Since B2+ already absorbs the visual differences between the two modes, the tabs themselves are likely redundant — however,
this is not a question this presentation architecture document answers; it requires a separate PO pass as a product decision (see §6 Open Questions). Phase 1 integrates **only the engine**; tab UI retention will be re-evaluated after P6 completion.

### 1.3 Decision Summary

| Candidate | Verdict | Rationale |
|---|---|---|
| Sigma WebGL + custom node/edge shaders | **Rejected** | Requires introducing 5 new GLSL shaders (equivalent to subsystem replacement); WebGL throughput advantage is negligible at the semantic-zoom cap (~40-120); inherits 38-effect/context exhaustion debt |
| TopologyMapCanvas (DOM/CSS) extension | **Rejected** | DOM node count increases in sub-pixel shapes like engraved text, diffraction spikes, and stardust → reintroduces DOM churn flagged in Phase 0 |
| **Dedicated canvas-2D renderer** (port prototype as-is) | **Adopted** | Prototype already provides spike evidence; immediate-mode means 0 React/WebGL overhead; maintenance surface limited to pure function modules; fits the semantic-zoom cap scale |

The **concept** of TopologyMapCanvas (single camera state `{tx,ty,k}`, pure functions
`fitBounds`/`zoomAt`/`panBy`, 0 per-frame DOM writes) is inherited — specifically,
the four functions from `src/widgets/topology-map-canvas/lib/camera.ts` are **imported as-is**
(no duplicate implementation). The prototype’s spring/momentum integrator is
layered on top (§4 P2). Sigma/Graphology are removed from the topology-map-v2 scope, but this decision is a local judgment that "B2+ presentation doesn't fit" rather than "Sigma will never be used again" — updating the Graph Engine Fit Gate document will be a separate commit post-v2 release (P6).

## 2. B2+ Language Tokenization

A new token family `--topology-v2-*` is introduced (separated from the existing 657 tokens — to avoid adding new debt to the target of excessive token consolidation flagged by the Design Guardian verdict; when deleting in P6, grepping for the `--topology-v2-` prefix will clearly delineate the scope of old/new replacement). Values are extracted 1:1 from prototype JS constants.

### 2.1 Node Surface (kind-specific fill/stroke tier)

| Token | Value | Prototype Source |
|---|---|---|
| `--topology-v2-node-fill-project` | `#1c1c22` | `COL.fillTier.project` |
| `--topology-v2-node-fill-domain` | `#191920` | `COL.fillTier.domain` |
| `--topology-v2-node-fill-capability` | `#17171d` | `COL.fillTier.capability` |
| `--topology-v2-node-fill-element` | `#15151a` | `COL.fillTier.element` |
| `--topology-v2-node-stroke-project` | `#57575f` | `COL.strokeTier.project` |
| `--topology-v2-node-stroke-domain` | `#48484f` | `COL.strokeTier.domain` |
| `--topology-v2-node-stroke-capability` | `#3c3c44` | `COL.strokeTier.capability` |
| `--topology-v2-node-stroke-element` | `#34343b` | `COL.strokeTier.element` |
| `--topology-v2-node-fill-dim` | `#1a1a1e` | `COL.dimFill` |
| `--topology-v2-node-stroke-dim` | `#2b2b2f` | `COL.dimStroke` |
| `--topology-v2-node-fill-stale` | `#141418` | `COL.staleFill` |
| `--topology-v2-node-stroke-stale` | `#454549` | `COL.staleStroke` |
| `--topology-v2-node-hole-fill` | `#0c0c10` | `COL.holeFill` (via drill hole) |
| `--topology-v2-indigo` | `#5e6ad2` | Reuse existing `--color-indigo`/charter indigo (not new) |
| `--topology-v2-indigo-bright` | `#8890e0` | `COL.indigoBright` (focus center/fresh highlight) |
| `--topology-v2-amber-hub` | `#d4b478` | `COL.amber` (hub-specific, reusing charter exception tone) |
| `--topology-v2-numeral-shadow` | `#08080a` | `COL.numeralShadow` (engraved shadow) |
| `--topology-v2-numeral-face` | `#8c8c94` | `COL.numeralFace` |

### 2.2 Edges · Labels · Background

| Token | Value | Source |
|---|---|---|
| `--topology-v2-edge-contains` | `#28282e` | `COL.edgeContains` |
| `--topology-v2-edge-depends` | `#39394a` | `COL.edgeDepends` |
| `--topology-v2-edge-dim` | `#1e1e22` | `COL.dimEdge` |
| `--topology-v2-hull-stroke` | `#3a3a42` | `COL.hull` (domain cluster boundary) |
| `--topology-v2-label-domain` | `#b8b8c1` | `COL.labelDomain` |
| `--topology-v2-label-capability` | `#84848c` | `COL.labelCap` |
| `--topology-v2-label-element` | `#57575f` | `COL.labelEl` |
| `--topology-v2-canvas-bg-near` | `#0a0a0d` | circuit-side background (§working) |
| `--topology-v2-canvas-bg-far` | `#050507` | constellation-side background (§far-field), `lerpColor` endpoint |
| `--topology-v2-grid-minor` | `#0e0e13` | `buildGrid()` thin lines |
| `--topology-v2-grid-major` | `#121218` | `buildGrid()` thick lines |
| `--topology-v2-vignette-base-alpha` | `0.32` | Constant term in `render()` vignette calculation |
| `--topology-v2-vignette-far-alpha` | `0.18` | Coefficient for `farT` in the same expression |

[Updated 2026-07-19] Light mode has been fully abandoned (owner strategy decision) — this family
is confirmed for dark-only; no light variant P3 gate exists anymore.

### 2.3 Geometry (radius · layout · edges)

| Token | Value | Source |
|---|---|---|
| `--topology-v2-radius-project` | `25` (world unit) | `RADIUS.project` |
| `--topology-v2-radius-domain` | `17` | `RADIUS.domain` |
| `--topology-v2-radius-capability` | `11` | `RADIUS.capability` |
| `--topology-v2-radius-element` | `7` | `RADIUS.element` |
| `--topology-v2-layout-ring-domain` | `250` | domain ring radius (`domainR`) |
| `--topology-v2-layout-ring-capability` | `145` | capability ring radius (`capR`) |
| `--topology-v2-layout-ring-element` | `90` | element ring radius (`elR`) |
| `--topology-v2-edge-bow-contains` | `70` | `buildEdges` maxBow (contains) |
| `--topology-v2-edge-bow-depends` | `92` | `buildEdges` maxBow (depends) |
| `--topology-v2-edge-blend-contains` | `0.46` | bow blend coefficient |
| `--topology-v2-edge-blend-depends` | `0.62` | bow blend coefficient |
| `--topology-v2-star-count` | `4` | Diffraction spike top N |
| `--topology-v2-dust-area-per-point` | `5200` (px²) | `buildStarDust` density |

These values are not consumed directly by CSS (canvas 2D requires JS constants); `lib/tokens.ts`
interprets them once via `getComputedStyle(document.documentElement)` and caches them as numbers
(reusing the `skeletonInkRef` interpret-cache pattern mentioned in Design Guardian verdict a4).
Given that these are "tokens but consumed by canvas," the principle "no hardcoding inside JSX" from design.md is extended to the canvas context — the single source of truth for values remains `app/globals.css`.

### 2.4 Motion · Camera

| Token | Value | Source |
|---|---|---|
| `--topology-v2-camera-spring-angfreq` | `2.941` (rad/s, `1/0.34`) | `updateCamera` `angFreq` |
| `--topology-v2-camera-damping-default` | `1.0` | critically damped default |
| `--topology-v2-camera-damping-flick` | `0.82` | slight overshoot on flick release |
| `--topology-v2-camera-momentum-decay` | `0.998` | `releaseDrag` inertia projection `d` |
| `--topology-v2-camera-scale-min` | `0.24` | `MIN_SCALE` |
| `--topology-v2-camera-scale-max` | `2.6` | `MAX_SCALE` |
| `--topology-v2-altitude-far-high-ratio` | `0.92` | `FAR_HIGH = OVERVIEW_SCALE * 0.92` |
| `--topology-v2-altitude-far-low-ratio` | `0.62` | `FAR_LOW = OVERVIEW_SCALE * 0.62` |
| `--topology-v2-focus-fit-max-scale` | `1.9` | `setFocus` focus dive upper bound |
| `--topology-v2-focus-bbox-margin` | `70` | `setFocus` bbox margin |
| `--topology-v2-hysteresis-px` | `7` | Click=safe contract (drag判定 threshold) — INTERACTION-DESIGN §1 recommends "~10px"; prototype measurement adopted 7px (both in safe range, exact value prioritizes prototype) |
| `--topology-v2-emphasis-rise-tau` | `0.09` (s) | hover ripple rise time constant |
| `--topology-v2-emphasis-decay-tau` | `0.15` (s) | hover ripple decay time constant |
| `--topology-v2-ripple-stagger-ms` | `55` (+`12`/neighbor) | `startRipple` neighbor delay |
| `--topology-v2-breathe-amplitude` | `0.04` | fresh node breathing amplitude |
| `--topology-v2-breathe-freq-rad` | `1.15` | breathing angular frequency |
| `--topology-v2-pulse-duration-ms` | `420` | depends signal pulse lifespan |
| `--topology-v2-tip-fade-ms` | `120` | popup opacity transition (DOM, adheres to charter `transition-opacity`) |

`prefers-reduced-motion` branching already exists in the prototype (spring skip → immediate
target assignment, suppress pulses/breathing, binarize emphasis) — port as-is; no new logic needed.

## 3. State Contract

### 3.1 Altitude Tier — overview / transition / working

| Tier | Condition (camera.scale) | Visuals | Label (altitude chip) |
|---|---|---|---|
| **working (circuit)** | `scale ≥ FAR_HIGH` (`OVERVIEW_SCALE × 0.92`) | Blueprint grid 100%, mechanical part shapes (hex/chip/via), engraved numerals, chip-leg pin ticks, signal pulse + comet tail | `circuit` |
| **transition** | `FAR_LOW < scale < FAR_HIGH` | Grid ↔ constellation crossfade via `farT = 1 − smoothstep(FAR_LOW, FAR_HIGH, scale)`; edge radii converging to circles; diffraction spikes appearing proportional to `farT` | `transitioning` |
| **far-field (constellation)** | `scale ≤ FAR_LOW` (`OVERVIEW_SCALE × 0.62`) | Grid 0%, nodes = circles (stars), diffraction spikes on top 4-point nodes, stardust, domain labels (tracked lowercase → uppercase constellation notation) | `constellation` |

Transitions occur **without discrete branching** — a single `farT` value (0–1) drives all visual elements (color, edge radius, label alpha, edge thickness) simultaneously. "No mode flip" means that at the code level, this is enforced not by an `if(mode==='far') { ... } else { ... }` branch, but by a single continuous interpolation function. During implementation, `altitude.test.ts` checks this invariant (the rate of change of all derived values between any two adjacent scale samples is finite — no step functions).

### 3.2 Focus State (State Contract Mapping)

PRODUCT-DESIGN-OPERATING-SYSTEM.md State Contract table with B2+ concrete values:

| State | Required Behavior (OS Contract) | B2+ Implementation |
|---|---|---|
| **Click** | Create durable focus around selected node/edge, expose relationship context implied by drag preview | `setFocus(node)` — camera springs to node + 1-hop neighbor bbox (`fitTarget(bb, 1.9)`), all neighbors outside focus set to `egoState=dim` (opaque dim token, not alpha), popovers always visible while focus is held |
| **Hover** | Lightweight preview only; durable selection/camera/path/handoff packets remain immutable | `hoveredNode` — only ripple emphasis rises (camera/focus unchanged); if `focusedNode` exists, hover is suppressed (focus exclusively owns emphasis) |
| **Drag** | Intent to arrange/edit; may show alignment/relationship context but must not be the sole means of relationship discovery | Only canvas pan (camera movement) exposed via drag — **node dragging (repositioning) is out of B2+ prototype scope** (not P3 scope, separate decision from map view card dragging). Relationship discovery completed via hover/click, so no "drag-only discovery" violation |
| **Focus** | Active ontology handle, kind, relationship/evidence summary, next graph action name | Popover (§3.3) — slug, kind, hub/fresh/stale badge, dependency in/out counts, MCP/CLI next actions (new P4) |
| **Path** | Source/target progress on support/focus layers; must not cross left panel, inspector, HUD, or minimap | Out of v2 scope (current path workflow dedicated to TopologyMapCanvas, explicitly "omitted" in Phase 0 §4.2) — need reconfirmed after P6 |
| **Composer** | Graph interaction block, dim/scrim, pending mutation label, clear cancel/commit | Out of v2 scope (composer like Add Concept maintains existing chrome layer) — canvas dims via `blocking-map-opacity`/`blocking-map-filter` (existing `--topology-blocking-*` tokens) when composer opens; no new tokens needed |

### 3.3 Popover Typed Facts (plan §5 — including MCP/CLI handoff)

The prototype `renderTip()` only renders badges (hub/fresh/stale) + counts (dependency in/out, node count). To satisfy the Agent Handoff Design Contract (OS document §"Agent Handoff Design Contract"), add the following rows in P4:

| Field | Content | Source |
|---|---|---|
| Ontology Fact | kind Korean label + slug | Existing (`KIND_LABEL`) |
| Badge | Hub / Recently updated (fresh) / Stagnant (stale) | Existing |
| Count | "N items needed" / "N items used" / "N nodes" | Common plain-text relationship vocabulary |
| **Next Action (New)** | "View Details" (opt-in, complies with no-fullscreen-modal contract) | Existing popover extension pattern |
| **MCP Action (New)** | `get_concept("<slug>")` / if neighbor hops exist, `find_backlinks("<slug>")` | Textual notation separate from Phase 0 §4.2 adapter's `onSelect`/`onOpen` |
| **CLI Alternative (New)** | `ontology-atlas node <slug>` / `ontology-atlas backlinks <slug>` | Equivalent path for agents without MCP (e.g., Codex) |

### 3.4 Freshness — Powered / Unpowered Metaphor

Memory([[owner-topology-taste]]) confirmed metaphor: **operational state is embedded in visuals — power = freshness.**

| State | Visual (B2+) | Metaphor |
|---|---|---|
| **fresh (powered on)** | `breathe = 1 + 0.04·sin(t·1.15+phase)` micro size vibration, stroke lerps 85% toward indigo | Alive — recent data flows |
| **Normal (neutral)** | Tier color (§2.1), no vibration | Stationary, normal |
| **stale (unpowered)** | Dashed `[3,3]` border, dim fill/stroke (`staleFill`/`staleStroke`), no vibration | Power removed from circuit — stagnant |
| **hub** | Kind shape + 4px expanded amber ring (`COL.amber`, tone allowed by charter exception) | Structural importance, orthogonal to freshness (can display simultaneously) |

These four states are not mutually exclusive (both hub+fresh and hub+stale possible) — composed as independent overlays (§SIGMA-PLAYBOOK §4-1 "State via borders instead of new coloring" principle, same for canvas 2D: add dash/rings/vibrations per state rather than adding colors).

### 3.5 Drift Warning State (New — not in prototype)

The prototype is a single vault fixture and does not handle vault-level drift (`validate_vault`/`vaultWarnings`). v2 renders actual vaults, so add in P4:

- **Location**: Utility chrome layer like altimeter chip/hint chip (stacked below top-left chip group, no new layer).
- **Trigger**: `vaultWarnings > 0` from `list_concepts`/`validate_vault`.
- **Visual**: Same anatomy as existing chips (panel surface + soft border), text only "N items with validation warnings" + dashed border (reuse "attention" grammar same as stale — no new color).
- **Interaction**: Click exposes CLI alternative phrase (`ontology-atlas validate`) — do not open separate panel (prevent popup soup).
- **14-inch collision**: Verify in P4 gate via screenshot that altimeter chip (top-right), hint (bottom-center), and warning chip (top-left, stacked vertically with altitude chip) do not overlap.

### 3.6 Hover/Press State (Click = Safety Contract)

As per INTERACTION-DESIGN §1: press (pointerdown) gives immediate feedback (selection ring/emphasis rise scheduled), commit (focus switch) on pointerup, cancel on drag escape (`HYSTERESIS=7px`). Port prototype `pressedNode`/`pointer.dragging` state machine directly — no new design needed, port as-is in P2.

## 4. Implementation Phase Breakdown (strangler, feature flag `topology-map-v2`)

**Feature Flag**: New in `src/shared/config/feature-flags.ts` — `isTopologyMapV2Enabled()`: pure function reading `localStorage["atlas:feature:topology-map-v2"]` or URL query `?mapEngine=v2`, default `false`. No server/build flag service (local-first principle — local toggle only). Switch in one commit flipping default to `true` in P6.

New widget root: `src/widgets/topology-map-v2/`.

### P2 — Scaffold (Engine + Camera + Layout)

| Item | Content |
|---|---|
| Files (New) | `lib/camera.ts` (spring+momentum+hysteresis, reuse `fitBounds`/`zoomAt`/`panBy`/`clampScale` imports from `topology-map-canvas/lib/camera.ts`) · `lib/layout.ts` (concentric ring layout, vault graph → coordinates, no aspectX distortion) · `lib/altitude.ts` (`farT` smoothstep) · `ui/TopologyMapV2.tsx` (canvas mount, resize/DPR, rAF loop, pointer wiring — shapes drawn in P3) · `src/shared/config/feature-flags.ts` |
| Tests (TDD) | `camera.test.ts` (spring critical damping convergence, flick momentum landing calculation, hysteresis threshold crossing point) · `layout.test.ts` (fixed vault fixture → deterministic coordinates, **no overlap**, absence of aspectX-series distortion — structurally prevent Design Guardian a1 regression in v2) · `altitude.test.ts` (smoothstep monotonicity, `FAR_HIGH`/`FAR_LOW` calculated as actual fit scale ratios) |
| Gate | Entering `/topology?mapEngine=v2` with flag on shows empty canvas pan/zoomable (spring feel), all headless camera math rendered, `pnpm test src/widgets/topology-map-v2` passes |

### P3 — Nodes/Traces/Tiers

| Item | Content |
|---|---|
| Files (New) | `lib/shapes.ts` (hex/square/via `roundedPolygonPath`, corner radius `farT` interpolation) · `lib/edges.ts` (bow routing, contains/depends dash, signal pulse+comet tail) · `lib/tokens.ts` (§2 token interpretation-cache) · `ui/TopologyMapV2.tsx` shape drawing connection |
| Tests | `shapes.test.ts` (hex/square vertex generation, corner radius interpolation within `[min,r]` range) · `edges.test.ts` (bow does not exceed `maxBow`, reflects `blend` factor) · `tokens.test.ts` (§2 tokens all interpreted successfully, explicit failure on missing — token drift gate) |
| Gate | Continuous convergence of shapes from circle ↔ polygon in overview/transition/working scale screenshots (no discrete jumps), dark contrast check (verdict a5 regression prevention — screenshot review for whether second coloring like trust lines is introduced) |

### P4 — Focus/PoPover + Freshness Overlay

| Item | Content |
|---|---|
| Files (New) | `lib/emphasis.ts` (hover ripple + ego dim state machine) · `lib/freshness.ts` (fresh/stale/hub → visual mapping) · `ui/NodePopover.tsx` (§3.3 typed facts + MCP/CLI rows new) · drift warning chip (§3.5, utility chip group in `ui/TopologyMapV2.tsx`) |
| Tests | `emphasis.test.ts` (ripple stagger timing, hover suppression by focus priority, reduced-motion binarization) · `freshness.test.ts` (state combination → token mapping table verification) · Popover content test (adapter data → count/badge/MCP·CLI row rendering) |
| Gate | Click focus is durable (held until Esc/outer click), popover exposes all State Contract fields, drift chip does not overlap altitude/hint chips in utility chrome layer (14-inch screenshot) |

### P5 — Performance Validation + Guardian + Install App Gate

| Item | Details |
|---|---|
| Task | Re-measure Phase 0 scenarios a/a′/b/b′/c in the v2 engine using **production build** (`pnpm build`), create comparison tables against SigmaTopology and TopologyMapCanvas baselines · Review Design Guardian screenshots (dark × compact at 1100×800 / 14-inch 1512×917 / 1920×1080 / 2560×1440) · Provide evidence of installed macOS app |
| Gate | main-thread busy·INP clearly improved compared to SigmaTopology baseline (1412ms/194ms+73ms reflow), no regression vs. TopologyMapCanvas baseline (700ms/201ms) (canvas-2D should be similar or lighter — immediate mode means no React commit cost) · Guardian verdict = Build and verify · All 14-inch No-Gos passed |

### P6 — Migration + Legacy Engine Removal

| Item | Details |
|---|---|
| Task | Commit flag default change to `true` · Replace two call sites in `HomePage.tsx`/`ProjectDetailPage.tsx` with single `TopologyMapV2` call (§1.2 unify) · Verify zero remaining references via `codegraph_callers`, then delete `src/widgets/topology-map-sigma/` (~40 files) + `src/widgets/topology-map-canvas/` · Coordinate deletion of `SigmaSkeletonCards.tsx` with a separate PR per Phase 0 §7 checklist (same sprint, separate commit) · Update `docs/FEATURES.md`/`docs/ARCHITECTURE.md`/dogfood vault (`docs/ontology/capabilities/`) |
| Gate | Full regression suite (`pnpm test:run`, `pnpm exec playwright test`) green, zero legacy engine references (verified via codegraph), all 3 docs updated |

## 5. 14-inch Fullscreen Collision Rules + Attention Layer Model + MCP/CLI Handoff

### 5.1 Attention Layer Allocation (OS document "Relief/Topology Attention Layer Model")

| Layer | B2+ Elements |
|---|---|
| **Map layer** | Entire canvas (nodes, edges, pulses, stardust, domain hulls) — default winner when no focus/blocking exists |
| **Support panel layer** | No always-open panels in v2 Phase 1 scope (TopologyAnalysisBar is not a v2 target, verdict a6 diet is a separate track) |
| **Focus/path state layer** | Popovers on click focus (§3.3) — the only focus surface, capped at 1 |
| **Blocking composer/modal layer** | Out of v2 scope (keep existing Add Concept etc. chrome, dim uses existing `--topology-blocking-*` tokens) |
| **Utility chrome layer** | Altitude chip · Hint chip · Drift warning chip (§3.5) — must never obscure graph facts/popovers |

### 5.2 14-inch (1512×917) Collision Rules

- The three utility chips (altitude top-right, hint bottom-center, drift warning top-left) stack vertically but do not overlap the popover anchor area — popovers anchor next to nodes via `graphToViewport` coordinate calculation (`worldToScreen`), flipping to the opposite side if they go off-viewport (porting the prototype `renderTip` `left+240>viewW` branch as-is).
- Popovers are **simultaneously limited to 1** — clicking a new node replaces the previous popover (not a stack), adhering to Design Guardian's "popup soup" rejection rule.
- Decorative overlays like diffraction spikes, stardust, and domain hulls are **data marks of the map layer** (encoding importance/clump boundaries), not utility chrome, so overlapping chips is fine — chips are drawn on top, but DOM (popovers/chips) and canvas are separate layers, so z-order always puts DOM above (HTML overlay convention).
- Domain hulls (convex hulls) render only for the 1 hovered/focused domain (prototype `activeDomain` gate) — preventing "popup soup" variants where multiple hulls appear simultaneously.


### 5.3 MCP/CLI Handoff Notes

- Popovers (§3.3) are the only handoff surface — Path/Composer layers are out of v2 scope, so separate handoff surfaces are unnecessary.
- For CLI-only agents (Codex etc., no MCP), the popover's MCP row and CLI row must **always render simultaneously** (no state where only one is visible) — adhering to the "no MCP-only happy path" rule.
- `onSelect`/`onOpen` callbacks (Phase 0 §4.2 adapter contract) remain unchanged — v2 does not change this contract, only replaces rendering. Thus, parent state management in HomePage/ProjectDetailPage (selected slug, path query etc.) remains unmodified.


## 6. Open Questions

1. **Whether to keep the map/graph tab UI** (§1.2) — Whether the tab itself is needed after engine integration requires a separate PO pass. Phase 1 does not answer this.
2. ~~**Light mode B2+ values**~~ — [Resolved 2026-07-19] Decision to fully discard light mode means this is no longer an open question. §2.2 tokens are confirmed dark-only.
3. **Node drag (repositioning)** — Out of B2+ prototype scope (pan only). Whether to inherit TopologyMapCanvas's card drag repositioning feature in v2 is left as a separate slice after P6 (linked to Phase 0 §5 S6 remaining items).
4. **Path workflow overlay** — Phase 0 §4.2 already deferred this as "review separately via a thin adapter". Re-evaluate necessity after v2 P6 completion.
