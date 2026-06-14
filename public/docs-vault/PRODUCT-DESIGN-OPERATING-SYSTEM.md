# Product Design Operating System

> Design gate for Ontology Atlas product work. Use this with
> [`PRODUCT-OWNER-OPERATING-SYSTEM.md`](./PRODUCT-OWNER-OPERATING-SYSTEM.md):
> PO decides whether the slice matters; this document decides whether the slice
> is designed well enough to ship.

## Default Design Stance

Ontology Atlas is a local-first ontology workbench, not a decorative graph demo.
The Relief/Topology screen must help a human and an AI agent understand:

- where they are in the ontology,
- which typed facts are currently selected,
- what evidence and handoff action is trustworthy,
- what action is available next.

If a surface does not improve one of those jobs, remove it, collapse it, dim it,
or demote it before adding more UI.

## Design Council

Use these roles in design reviews. They are lenses, not separate agents unless a
tool explicitly provides them.

| Role | Owns | Must Ask |
| --- | --- | --- |
| Product Owner | User problem, slice value, kill criteria | Does this reduce a real ontology workflow problem? |
| Interaction Designer | Selection, hover, drag, focus, path, keyboard, panel behavior | Does the UI explain current location and next action without prose? |
| Information Designer | Graph semantics, relation labels, legends, evidence density | Is the visual mark tied to a typed ontology fact, not decoration? |
| macOS Workbench Designer | Window chrome, density, side panels, focus management | Does this feel stable on 14-inch fullscreen and compact WebView? |
| Design Systems Engineer | Tokens, spacing, elevation, responsive contracts | Can this be enforced by reusable tokens/tests instead of taste? |
| Agent Handoff Designer | MCP/CLI copy, command markers, handoff readiness | Can both MCP-connected and CLI-only agents act from this state? |

## Reference Rules

Only use public, citable references. Do not copy proprietary assets, layouts,
screenshots, icons, illustrations, or brand-specific styling. Extract principles
and adapt them to Ontology Atlas.

Allowed reference categories:

- **Apple Human Interface Guidelines**: macOS-native expectations for layout,
  sidebars, selection/input, motion, and platform fit.
- **Microsoft Fluent 2 Layout**: spacing/proximity, hierarchy, responsive
  resize/reflow/show-hide, and alignment principles.
- **Atlassian Design System**: 8px spacing foundation, elevation as layered
  focus, dark-mode surface separation.
- **IBM Carbon Data Visualization**: chart anatomy, direct labels over long
  legends, concise labels/tooltips, graph frame restraint.
- **Linear public redesign writing**: reduce visual noise, keep alignment,
  increase hierarchy and density in product-work tooling.
- **Edward Tufte / data visualization lineage**: maximize truthful information
  density and remove non-data ink that does not clarify the decision.

Reference links:

- Apple HIG Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple HIG Sidebars: https://developer.apple.com/design/human-interface-guidelines/sidebars
- Apple HIG Selection and Input: https://developer.apple.com/design/human-interface-guidelines/selection-and-input
- Fluent 2 Layout: https://fluent2.microsoft.design/layout
- Atlassian Spacing: https://atlassian.design/foundations/spacing
- Atlassian Elevation: https://atlassian.design/foundations/elevation
- Carbon Chart Anatomy: https://carbondesignsystem.com/data-visualization/chart-anatomy/
- Linear redesign note: https://linear.app/now/how-we-redesigned-the-linear-ui
- Edward Tufte: https://www.edwardtufte.com/

## Relief/Topology Design Gate

Before changing Relief/Topology UI, write a compact design pass after the PO
pass:

1. **Observed visual problem**: what screenshot/runtime evidence shows the
   problem?
2. **Primary user moment**: overview scan, click focus, relation inspect, path
   build, drag arrange, agent handoff, or repair.
3. **Surface hierarchy**: which surface is primary, supporting, dimmed, or
   collapsed?
4. **Graph semantics**: which node/edge/relation/evidence fact does the visual
   mark encode?
5. **Responsive contract**: what must hold at 1100x800, 14-inch fullscreen,
   1920x1080, and 2560x1440?
6. **Agent contract**: what MCP action and CLI fallback remain visible or
   copyable?
7. **Verification**: which unit test, WebView marker, screenshot, and installed
   app evidence will catch regressions?

Verdicts:

- `Do not design`: the issue is not a user workflow problem.
- `Investigate first`: screenshots/evidence are insufficient or the state is
  not reproducible.
- `Shape a design slice`: the problem is real but too broad; reduce it to one
  screen state.
- `Build and verify`: the slice has a clear hierarchy, graph meaning, agent
  value, and installed-app proof.

## Relief/Topology Surface Rules

- **Selection beats overview**: when a node or relation is selected, overview
  panels, legends, and minimap must not compete for primary attention.
- **Click focus must be durable**: click selection should reveal the same kind
  of linked context that drag previews, then keep it visible until the user
  changes selection.
- **Drag is editing, not discovery**: dragging may move cards, but discovering
  relationships must not require dragging.
- **Panels should share a width language**: left analysis surfaces should align
  with the top Relief chrome group on 14-inch fullscreen unless a selected
  inspector explicitly needs more.
- **Labels must not fight cards**: relation labels, selected cards, popovers,
  HUD buttons, legends, and minimap are fixed surfaces for collision tests.
- **One elevation per job**: map canvas is base, analysis panel is persistent
  support, selected node/relation is active focus, modal/composer is blocking.
- **No unexplained color**: color always means ontology kind, relation quality,
  evidence state, selection, or agent readiness.
- **No decorative motion**: motion must show selection, camera relocation,
  drag movement, or state transition; otherwise remove it.

## Responsive Quality Bar

Required breakpoints:

- compact WebView: `1100x800`
- MacBook 14-inch fullscreen: approximately `1512x917`
- desktop HD: `1920x1080`
- large desktop: `2560x1440`

For each relevant breakpoint, verify:

- fixed/card overlap count is `0`,
- selected label/card geometry stays inside viewport,
- analysis panel does not hide the selected cluster,
- minimap viewport frame is readable, not a hairline,
- click focus and drag focus both expose relationship context,
- MCP/CLI action remains discoverable from the selected state.

## Design Post-Check

After implementation, report:

- Did the user problem get smaller?
- Did ontology understanding improve?
- Did graph semantics become clearer?
- Did agent handoff improve for MCP and CLI-only agents?
- Did 14-inch macOS evidence pass?
- What visual risk remains?

If any answer is weak, do not call the design complete. Tighten, cut, or add
runtime proof.
