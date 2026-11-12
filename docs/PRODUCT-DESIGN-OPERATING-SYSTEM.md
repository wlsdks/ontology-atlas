---
title: Product Design Operating System
doc_type: authority
status: current
area: process
---

# Product Design Operating System

> Atlas-specific design proof. The `AGENTS.md` workflow table decides whether a
> slice is one-way. This system says which design work and runtime evidence that
> slice needs. It does not grade taste and it does not make every UI edit wait
> for a review.

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

## Proof by change class

Before building, name every class the change touches; the `/ui-proof` table
(`.agents/skills/ui-proof/workflow.md`) gives each class its look, its measured
proof, and whether one `reviewer` follows. Do not substitute "small",
"meaningful", or "safe" for a class. Classes compose: a topology drag animation
is both a map-gesture and a timing change, so it takes map performance and a
recording, but not responsive or installed-app proof unless those also changed.
`pnpm checks:changed` remains the technical baseline.

## Pixel evidence contract

A words-only change takes one fresh `pnpm ui:look` capture of the affected state
after the change, with no baseline or slice loop. Any other rendered change is
built in small slices, and each slice is looked at with `pnpm ui:look` before
the next starts; do not build a whole screen unobserved. Use DOM rect and
computed-style measurement (`ui:look --audit`) for geometry questions. A window,
menu, Tauri bridge or WKWebView state is captured in the installed app through
Computer Use instead. Keep one final capture (route, width, or app window) for
the pull request. `/ui-build` owns the step-by-step loop.

Do not claim pass when screenshot capture is unavailable, the target is hidden,
or the image belongs to a different window. Report the capability blocker.
A token or primitive edit with no rendered output does not invent pixels; add
the local-visual class when it changes appearance. Visible copy is rendered
output and always takes its capture because wrapping, hierarchy, and action
meaning can change.

## Motion evidence contract

Motion is temporal output. Static screenshots, duration tokens, unit tests, and
“looks smooth” do not prove it.

Every timing change runs `/ui-proof` against a real macOS screen
recording, extracts uniform 30 fps frames, inspects a phase strip, and reports
frame-to-frame stalls and spikes. It also proves the reduced-motion equivalent.
Headless sequential screenshots are an explicitly named fallback, never a
recording claim.

Use `/ui-proof` separately for topology work cost. A smooth video does not prove
node drag is cheap, and a low work-time number does not prove the eye sees a
continuous transition.

## Direction threshold

`/ui-build` reads its directions guide only for:

- a new or removed primary surface;
- information architecture, navigation, or grouping;
- primary interaction model;
- primary attention model.

Sketch three structurally different directions including the status quo, let the
owner select one, then build. Token swaps, copy edits, spacing changes,
breakpoint fixes, and motion tuning do not pay for divergence by default.

## Independent review

Review runs only for a new or removed primary surface, a navigation or
grouping change, or a one-way change (`AGENTS.md`); it is not a generic quality
layer. Token, ramp and primitive changes get the rendered inventory over
`tests/e2e/audited-routes.ts` instead: a second seat of the same model adds a
correlated view, not an independent one. One `reviewer` that did not build the
change judges the built artifact and proof packet. The questions each lens asks
live in `.claude/agents/reviewer.md` and its Codex brief.

Every review starts with `moment` and `evidence`; the brief adds only the UI
lenses the surface has.

The reviewer judges from the `/ui-build` §0-B captures, and for motion from
a real recording; a missing capture is a finding. The author answers a finding
once, only on a material conflict, and a one-way disagreement takes one second
opinion, as in the reviewer brief. The owner decides,
`design-guardian` applies the chosen correction and reruns only the proofs it
invalidates, and "unchanged" is a valid verdict.

## No-Human-Designer Working Mode

When no human designer is present, the accountable builder still cannot approve
its own unmeasured pixels. The captures and instruments provide the independent
facts; the owner chooses and `design-guardian` applies the smallest correction.
If no independent reviewer can run, disclose lost independence. If Computer Use, recording, or a
required runtime is unavailable, defer that proof rather than judge a diff by
eye.

## Build order

1. Name the human ability being restored and every class the change touches.
2. For a new surface or a navigation or grouping change, run the `/ui-build`
   directions guide and select one shape.
3. Build through `/ui-build` using existing primitives and canonical
   values in `docs/DESIGN-SYSTEM.md`; look at each coherent visual slice with
   `pnpm ui:look`.
4. Run the `/ui-proof` rows for those classes against the final observed state.
5. When a row names one, give one `reviewer` the built artifact, proof packet,
   and lenses.
6. The owner decides; apply that one decision and remeasure only changed proof.

The quality bar remains fixed; only irrelevant ceremony is removed.

## Reference Permission Test

Public references are principle sources, not visual templates.

- **Allowed:** official guidance, published research, public implementation
  documentation, and examples used to derive an Atlas rule.
- **Not allowed:** copying assets, wording, palette, layout signature, or motion
  signature; invented quotations; or citing a source that changes no rule.
- **Translation format:** `Source -> Atlas rule -> verifier`.

The proof shape follows the same public testing principle Atlas already uses:
test user-visible behavior in the rendered output and isolate the state under
test ([Playwright best practices](https://playwright.dev/docs/best-practices)).
Motion remains purposeful, brief, optional, and subordinate to content
([Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion)).
These sources do not decide Atlas hierarchy; the ontology workflow does.

## Relief/Topology Graph Engine Fit Gate

The current renderer contract stands:

- `ontology-map` owns canvas-2D rendering, camera, hit testing, and visible
  frame work;
- Graphology owns graph data and ForceAtlas2 inputs;
- ForceAtlas2 owns bounded layout work;
- DOM overlays own readable ontology cards, evidence, and MCP/CLI handoff.

Sigma.js is retired. `nodeReducer` and `edgeReducer` history is not
permission to restore it. Force Graph-style products and Cytoscape.js can inform
principles but do not justify a second renderer. Reject renderer shopping unless
an observed Atlas reading failure cannot be solved inside the current contract
and a PO one-way decision explicitly replaces it.

Topology changes name separate classes, each with its own `/ui-proof` row:

- visual channel or density: map mark, relation channel, density;
- drag/pan/zoom/layout runtime: map drag, pan, zoom, hit test, frame loop;
- temporal camera or focus behavior: timing, easing, animation, camera travel;
- canonical design vocabulary: token, ramp, primitive interface.

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

Attention layers, Node Spec, motion rules, responsive reserves, and control
primitives live only in `docs/DESIGN-SYSTEM.md`; token values are printed by
`pnpm design:tokens`. Implementation rules
live in `.claude/rules/design.md`; gate archaeology lives in
`.claude/rules/design-gates.md`. Do not grow this document into a second value
catalog.

## Responsive and installed-app scope

`/ui-proof` measures affected bands for a breakpoint-local change and
the full 600/768/834/1024/1440/1920/2560 matrix for a new surface or information
architecture. It measures rect intersections, `elementFromPoint` reachability,
scroll reserve, and screenshots; class-string reasoning is not proof.

Installed macOS app proof is required only when a window, menu, Tauri bridge or
WKWebView state changed, or another class explicitly depends on that behavior. It covers the
touched state, not an automatic full release build. The proof records the
installed app route, WebView marker, window identity, lifecycle result, and a
Computer Use screenshot/accessibility tree.

A browser can prove web layout. It cannot prove AppKit/Tauri window behavior,
restoration, menus, shutdown, or WKWebView-only defects.

## Design post-check

Completion answers four short questions:

1. Which Atlas fact or action became easier to judge?
2. Which change classes produced the proof packet?
3. Where are the `ui:look` captures and, for motion, the recording results?
4. What remains unproved or was intentionally not run?

Do not summarize omitted instruments as passes. “Not applicable” is valid only
when the named classes make the omission inspectable.
