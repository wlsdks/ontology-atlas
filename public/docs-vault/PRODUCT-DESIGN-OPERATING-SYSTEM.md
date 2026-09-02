# Product Design Operating System

> Atlas-specific design routing. The PO pass decides whether a product slice is
> worth doing. This system derives which design work and runtime evidence that
> slice needs. It does not grade taste and it does not make every UI edit hold a
> council.

## Outcome

Atlas exists so a person can recover understanding after agents change code
faster than the person can follow. A designed Atlas surface therefore has one
job: make the current product meaning, implementation evidence, uncertainty,
impact boundary, correction action, or handoff path easier to judge.

The design gate protects four Atlas-specific properties:

1. a visible mark represents a typed ontology fact or an action on one;
2. the selected fact remains readable while topology, panels, and camera move;
3. a person can inspect and correct agent-authored meaning;
4. the next person or agent can reuse the accepted fact through MCP or CLI.

Decoration, generic “polish,” and a tidy screen that hides those properties do
not pass.

## Route from change facts

Run this after the PO pass and before implementation:

```bash
pnpm design:route -- --change=<change> [--change=<change>] --json
```

Supply every observable class. Do not supply “small,” “meaningful,” “safe,” or
a desired proof plan; the router derives directions, council seats, instruments,
and scope.

| Change fact | Use when | Derived design proof |
|---|---|---|
| `copy` | only visible words change | changed-path checks + Computer Use render loop; add `responsive` when length or wrapping can alter geometry |
| `local-visual` | colour, type, spacing, radius, shadow, or local hierarchy changes inside the current system | affected-state design audit + Computer Use render loop |
| `layout` | geometry changes without a new information architecture | affected-state design audit + Computer Use render loop |
| `responsive` | breakpoint, reflow, touch, safe area, or scroll reserve changes | affected-state audit + affected bands + Computer Use render loop |
| `interaction` | visible states, keyboard, modality, discoverability, or reversibility change | affected-state audit + Computer Use render loop |
| `motion` | timing, easing, animation, camera travel, or reduced-motion output changes | real screen recording through `/motion-verify` + Computer Use render loop |
| `topology-encoding` | a node/edge mark, relation channel, density rule, or graph-readable fact changes | audit + graph readability + contrast + Computer Use render loop |
| `topology-gesture` | drag, pan, zoom, hit testing, layout work, or the frame loop changes | `/map-perf` + Computer Use render loop |
| `journey` | order, destination, next step, or completion signal changes | changed-path `/user-walkthrough` + Computer Use render loop |
| `desktop-shell` | window, menu, AppKit/Tauri bridge, WKWebView, restoration, or lifecycle changes | touched-state installed-app proof + Computer Use render loop |
| `agent-handoff` | the visible MCP/CLI next action or state-bound handoff changes | agent-handoff walkthrough + Computer Use render loop |
| `design-contract` | a token, ramp, primitive, design rule, or enforcement contract changes | selected-seat council + design-system audit + `/gate-probe` |
| `new-surface` | a primary user-facing surface is added or removed | directions + selected-seat council + full surface, responsive, and journey proof |
| `information-architecture` | navigation, primary hierarchy, or grouping changes | directions + selected-seat council + full surface, responsive, and journey proof |
| `interaction-model` | the primary way a person selects, edits, confirms, or reverses work changes | directions + lead/interaction council + full interaction and journey proof |
| `attention-model` | the Atlas fact or action that wins attention changes across a primary state | directions + lead/infoviz council + full-surface proof |

Signals compose. A topology drag animation can declare
`topology-gesture,motion`; the result includes map performance and a recording,
but not responsive or installed-app proof unless those facts also changed.

Examples:

```bash
# Spacing nudge: no directions, council, responsive sweep, or recording.
pnpm design:route -- --change=local-visual

# Animation timing: recording is required; a full static audit is not inferred.
pnpm design:route -- --change=motion

# New installed workbench surface: the structural and desktop proofs compose.
pnpm design:route -- --change=new-surface --change=desktop-shell
```

The route is an inspectable claim, not omniscience. If the diff shows an omitted
class, rerun it with the missing fact. `pnpm checks:changed` remains the
technical baseline.

## Pixel evidence contract

Every route that changes rendered UI includes `computer-use-loop`. This is an
implementation loop, not one final screenshot:

1. before editing, open the exact state and capture its baseline with Orca
   Computer Use;
2. implement one coherent visual slice—one hierarchy, state, or interaction,
   not a whole screen imagined at once;
3. render that slice in the actual browser, WebView, or installed app;
4. request a fresh Computer Use accessibility tree and screenshot and inspect
   both;
5. use browser DOM/computed-style/rect measurement when the pixels or tree expose
   a geometry question;
6. correct the observed defect before starting the next slice;
7. repeat and retain a final capture of the completed state.

The accessibility tree is not the DOM. Computer Use proves the actual window,
pixels, visible labels, and actionable ownership; browser measurement localizes
DOM geometry and computed styles. Neither replaces the other.

Do not build a whole UI from imagination and inspect it only after the structure
has ossified.

For the baseline, each material checkpoint, and the final state record:

- app and window identity, route, commit, viewport, and DPR;
- the exact state and dataset;
- screenshot path from the Computer Use result;
- the accessibility element that owns the primary action or selected fact;
- what was visually confirmed and any defect found.

“Material checkpoint” means the smallest slice whose visual result can be judged
on its own. It is not every CSS line, and it is never the entire new surface in
one unobserved batch.

Do not claim pass when screenshot capture is unavailable, the target is hidden,
or the image belongs to a different window. Report the capability blocker.
A design-contract edit with no rendered output does not invent pixels; combine
`local-visual` when the contract changes appearance. Visible copy is rendered
output and always uses the loop because wrapping, hierarchy, and action meaning
can change.

## Motion evidence contract

Motion is temporal output. Static screenshots, duration tokens, unit tests, and
“looks smooth” do not prove it.

Every `motion` route runs `/motion-verify` against a real macOS screen
recording, extracts uniform 30 fps frames, inspects a phase strip, and reports
frame-to-frame stalls and spikes. It also proves the reduced-motion equivalent.
Headless sequential screenshots are an explicitly named fallback, never a
recording claim.

Use `/map-perf` separately for topology work cost. A smooth video does not prove
node drag is cheap, and a low work-time number does not prove the eye sees a
continuous transition.

## Direction threshold

`/design-directions` runs only when the router says `directions=yes`:

- new primary surface;
- information architecture;
- primary interaction model;
- primary attention model.

Sketch three structurally different directions including the status quo, let the
owner select one, then build. Token swaps, copy edits, spacing changes,
breakpoint fixes, and motion tuning do not pay for divergence by default.

## Design Council

The Design Council exists for hard-to-reverse structural commitments, not as a
generic quality layer. It runs only when `design:route` says
`council.required=true`.

### Atlas Designer Bench

| Bench seat | Agent | Atlas question |
|---|---|---|
| Lead Product Designer | `design-lead` | Which Atlas fact or action wins attention? |
| Design Systems Engineer | `design-system` | Which token, primitive, marker, and gate preserve the decision? |
| Interaction Designer | `design-interaction` | Can a person select, inspect, correct, confirm, and reverse it? |
| Motion / Action Designer | `design-motion` | Does temporal output preserve the selected fact and reduced-motion meaning? |
| Information Visualization Designer | `design-infoviz` | Which typed fact does each topology mark encode? |
| macOS Workbench Designer | `design-workbench` | Does the installed workbench state hold in its real window? |
| Responsive & Touch Designer | `design-responsive` | Which measured band, input mode, or safe area changes? |
| Agent Handoff Designer | `design-handoff` | Can MCP and CLI agents continue from the visible fact? |

`design-guardian` is **not** a seat. It is the accountable editor and decider.
No seat always attends. The router selects only seats implicated by the facts;
structural council routes derive at least two contrasting seats.

Run independent first positions against the same built artifact and proof
packet. Cross-critique happens only when two positions materially conflict on
the same decision or a new fact could change one. The guardian chooses one
proposal or something smaller, applies it, and reruns only the proofs affected
by that last-mile change.

### Council utility

Every council states, in its pull-request rationale (the ledger record itself
keeps only the six template fields):

- the decision before review;
- selected seats and first-position turn count;
- whether a rebuttal occurred and the material conflict;
- the exact decision, scope, or proof delta caused by review;
- the one unique contribution, or `none`;
- the losing dissent and falsifier.

A council with no delta is allowed but cannot call itself useful.
Five consecutive no-delta councils trigger owner review of the threshold. This
is how Atlas learns whether council is earning its cost instead of declaring
quality from the number of reviewers.

## No-Human-Designer Working Mode

When no human designer is present, the accountable builder still cannot approve
its own unmeasured pixels. The route and instruments provide the independent
facts; `design-guardian` applies the smallest correction. If independent seats
cannot run, disclose lost independence. If Computer Use, recording, or a
required runtime is unavailable, defer that proof rather than judge a diff by
eye.

## Build order

1. Run the PO route and name the human ability being restored.
2. Run `design:route` with every observed design change.
3. If directed, run `/design-directions` and select one shape.
4. Build through `/design-build` using existing primitives and canonical
   values in `docs/DESIGN-SYSTEM.md`; run the Computer Use render loop after
   each coherent visual slice.
5. Run the remaining proof packet returned by the router against the final
   observed state.
6. If directed, run one selected-seat `/design-council` over the built artifact
   and proof packet.
7. Apply one decision and remeasure only changed proof.

The quality bar remains fixed; only irrelevant ceremony is removed.

## Reference Permission Test

Public references are principle sources, not visual templates.

- **Allowed:** official guidance, published research, public implementation
  documentation, and examples used to derive an Atlas rule.
- **Not allowed:** copying assets, wording, palette, layout signature, or motion
  signature; invented quotations; or citing a source that changes no rule.
- **Translation format:** `Source -> Atlas rule -> verifier`.

The routing shape follows the same public testing principle Atlas already uses:
test user-visible behavior in the rendered output and isolate the state under
test ([Playwright best practices](https://playwright.dev/docs/best-practices)).
Motion remains purposeful, brief, optional, and subordinate to content
([Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion)).
These sources do not decide Atlas hierarchy; the ontology workflow does.

## Relief/Topology Graph Engine Fit Gate

The current renderer contract stands:

- `topology-map-v2` owns canvas-2D rendering, camera, hit testing, and visible
  frame work;
- Graphology owns graph data and ForceAtlas2 inputs;
- ForceAtlas2 owns bounded layout work;
- DOM overlays own readable ontology cards, evidence, and MCP/CLI handoff.

Sigma.js is retired. `nodeReducer` and `edgeReducer` history is not
permission to restore it. Force Graph-style products and Cytoscape.js can inform
principles but do not justify a second renderer. Reject renderer shopping unless
an observed Atlas reading failure cannot be solved inside the current contract
and a PO one-way decision explicitly replaces it.

Topology changes declare separate facts:

- visual channel or density: `topology-encoding`;
- drag/pan/zoom/layout runtime: `topology-gesture`;
- temporal camera or focus behavior: `motion`;
- renderer or canonical design vocabulary: `design-contract`.

That separation prevents a colour adjustment from paying for node-drag
performance and prevents a fast drag harness from approving unreadable marks.

## Relief/Topology Surface Rules

These product rules remain non-negotiable:

- **Selection beats overview:** selected concepts and relations win over legends
  and utility chrome.
- **Click focus must be durable:** relationship context remains until selection
  changes.
- **Drag is editing, not discovery:** a relationship cannot be discoverable only
  by dragging.
- **Composer blocks the map:** a write surface dims or blocks competing topology
  interaction.
- **One transient group:** unrelated popovers, prompts, and menus do not stack.
- **Marks carry facts:** colour, shape, size, line, and motion encode kind,
  relation, evidence, quality, selection, correction, or handoff—or are removed.
- **Handoff is state-bound:** the visible MCP action and CLI fallback carry the
  selected slug, relation, evidence, or real vault path.

Values, attention layers, Node Spec, motion tokens, responsive reserves, and
control primitives live only in `docs/DESIGN-SYSTEM.md`. Implementation rules
live in `.claude/rules/design.md`; gate archaeology lives in
`.claude/rules/design-gates.md`. Do not grow this router into a second value
catalog.

## Responsive and installed-app scope

`/responsive-sweep` measures affected bands for a breakpoint-local change and
the full 600/768/834/1024/1440/1920/2560 matrix for a new surface or information
architecture. It measures rect intersections, `elementFromPoint` reachability,
scroll reserve, and screenshots; class-string reasoning is not proof.

Installed macOS app proof is required only when `desktop-shell` is present or a
different route explicitly depends on WKWebView/window behavior. It covers the
touched state, not an automatic full release build. The proof records the
installed app route, WebView marker, window identity, lifecycle result, and a
Computer Use screenshot/accessibility tree.

A browser can prove web layout. It cannot prove AppKit/Tauri window behavior,
restoration, menus, shutdown, or WKWebView-only defects.

## Design post-check

Completion answers four short questions:

1. Which Atlas fact or action became easier to judge?
2. Which route facts produced the proof packet?
3. Where are the Computer Use render loop and, for motion, recording results?
4. What remains unproved or was intentionally not run?

Do not summarize omitted instruments as passes. “Not applicable” is valid only
when the route facts make the omission inspectable.
