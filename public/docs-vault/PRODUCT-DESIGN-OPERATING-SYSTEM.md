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

### Senior Design Team Standard

If no human designer is present, the agent must simulate a small senior design
team in writing before changing Relief/Topology. This is not a brainstorming
exercise. Each role must reject weak work from its own craft lens:

- **Product designer**: translates "looks weird" into the user moment, primary
  surface, and next action.
- **Interaction designer**: separates click, hover, drag, focus, path, keyboard,
  and modal behavior so discovery does not depend on editing gestures.
- **Information designer**: makes node, relation, quality, provenance, and agent
  readiness visible as facts, not as decoration.
- **macOS workbench designer**: checks that the screen behaves like a stable
  desktop tool at 14-inch fullscreen, not like a responsive web demo squeezed
  into a shell.
- **Design systems engineer**: converts repeated taste decisions into tokens,
  layout constraints, markers, and tests.
- **Agent handoff designer**: keeps MCP and CLI actions visible from the exact
  state a human is inspecting.

The design team is successful when the chosen slice makes the screen quieter
and more informative at the same time. If the critique only asks for more
chrome, a new panel, or more visual styling, the slice is not ready.

### Council Output Contract

The design council is allowed to be short, but it must be concrete. A useful
pass names the visible failure, assigns attention layers, states the graph fact
that must remain legible, and names the proof artifact. A weak pass uses words
like "modern", "clean", "premium", or "polished" without saying what changes in
the user's ontology-reading moment.

Before implementation, the council must produce these five lines:

```md
Primary moment: [overview scan / click focus / relation inspect / path build /
drag arrange / composer / agent handoff]
Attention stack: base=[map], support=[panel/legend/minimap], focus=[selected
node/relation/path], blocking=[composer/modal], utility=[HUD/top chrome]
Graph fact: [kind/relation/provenance/quality/evidence/agent gate] remains
visible because [surface/label/chip/copy packet]
Responsive rule: at [viewport], [surface] must [align/collapse/dim/reflow] and
overlap markers must stay 0
Proof: [unit test] + [installed app route] + [WebView marker] + [Computer Use or
fallback evidence]
```

If any line is missing, the next step is `Investigate first` or
`Shape a design slice`, not implementation.

### Council Rejection Rules

The simulated design team must reject a proposed UI slice when:

- it makes the graph prettier but does not make a typed ontology fact easier to
  understand or act on;
- it introduces a second attention layer for the same job instead of collapsing,
  dimming, or aligning the existing one;
- it makes drag the only way to discover relationship context;
- it hides MCP/CLI handoff behind a panel that is not visible from the selected
  state;
- it relies on an external product's style instead of translating a public
  principle into Atlas's neutral + single-indigo system;
- it cannot be verified in the installed macOS app at compact WebView and
  14-inch-class sizes.

These rejection rules are intentional. Atlas should feel designed because the
ontology workflow is clearer, not because another visual layer was added.

### How The Council Talks

The council is a working critique loop, not a committee vote. The PO names the
observable problem and final product verdict. The design council then challenges
the proposed slice through craft, interaction, information, macOS, system, and
agent-handoff lenses. If the lenses disagree, choose the smallest change that
reduces the observed workflow problem while preserving ontology meaning.

Use this compact dialogue before meaningful Relief/Topology design work:

```md
PO: The observed phenomenon is [runtime/screenshot evidence]. This blocks
[user/agent] during [moment]. Verdict: [PO verdict].
Interaction Designer: The current state/next action is unclear because [reason].
Information Designer: The graph mark does/does not encode [typed ontology fact].
macOS Workbench Designer: At [viewport], [panel/label/HUD/minimap] competes with
[primary surface].
Design Systems Engineer: This should be solved by [token/layout contract/test],
not taste.
Agent Handoff Designer: MCP/CLI agents can/cannot act because [handoff state].
Design verdict: [Do not design / Investigate first / Shape a design slice /
Build and verify].
```

Do not average the lenses into a larger feature. A good council pass usually
removes, dims, aligns, collapses, or clarifies one existing surface before adding
another one.

For user-reported screenshots, add this second pass before implementation:

```md
Designer: The screenshot fails because [surface A] and [surface B] compete for
the same attention layer.
Designer: The primary action should be [read/select/inspect/arrange/handoff],
so [surface] must become [primary/supporting/dimmed/collapsed].
Designer: The graph meaning that must remain visible is [node/relation/evidence
/quality/agent gate].
Designer: The 14-inch rule is [width/alignment/collision/viewport constraint].
Designer: The proof is [installed app route + WebView marker + screenshot or
Computer Use observation].
```

## Reference Rules

Only use public, citable references. Do not copy proprietary assets, layouts,
screenshots, icons, illustrations, or brand-specific styling. Extract principles
and adapt them to Ontology Atlas.

Reference checks were refreshed on 2026-06-15. Treat the links below as
principle sources, not as visual targets.

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
- **Rauno Freiberg public craft writing/interviews**: high-fidelity interaction
  detail, fast feedback, and design-engineering craft close to the final medium.
- **yFiles knowledge graph guidance**: labels and visual encodings should answer
  analysis questions, control density, and expose graph attributes deliberately.
- **Cambridge Intelligence graph visualization guidance**: filtering, styling,
  interaction, and accessibility should turn connected data into actionable
  insight rather than visual clutter.
- **Edward Tufte / data visualization lineage**: maximize truthful information
  density and remove non-data ink that does not clarify the decision.

### Modern Reference Bar

Use modern references only when they help the shipped workbench answer one of
Atlas's own questions:

- **Can I tell what kind of ontology object this is?**
- **Can I tell what relation/evidence/quality this mark represents?**
- **Can I tell whether this state is overview, focus, path, drag, edit, or
  handoff?**
- **Can a Codex/Claude/Cursor agent reproduce the same action through MCP or
  CLI?**
- **Does the first viewport on a 14-inch MacBook-class window look intentional,
  not merely responsive?**

If a reference does not help answer one of those questions, it is inspiration
only and must not drive implementation.

Reference links:

- Apple HIG Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple HIG Sidebars: https://developer.apple.com/design/human-interface-guidelines/sidebars
- Apple HIG Selection and Input: https://developer.apple.com/design/human-interface-guidelines/selection-and-input
- Fluent 2 Layout: https://fluent2.microsoft.design/layout
- Atlassian Spacing: https://atlassian.design/foundations/spacing
- Atlassian Elevation: https://atlassian.design/foundations/elevation
- Carbon Chart Anatomy: https://carbondesignsystem.com/data-visualization/chart-anatomy/
- Linear redesign note: https://linear.app/now/how-we-redesigned-the-linear-ui
- Rauno Freiberg interview: https://ui.land/interviews/rauno-freiberg
- yFiles knowledge graph visualization guide: https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs
- Cambridge Intelligence graph visualization learning hub: https://cambridge-intelligence.com/learn/graph-visualization/
- Edward Tufte: https://www.edwardtufte.com/

These references are allowed as principle sources only. The permissible use is:

- **Adopt**: spacing discipline, hierarchy, direct labels, responsive reflow,
  semantic motion, progressive disclosure, graph density controls, and
  accessibility checks.
- **Adapt**: macOS workbench density, panel alignment, selected-state
  elevation, relation labels, minimap/HUD priority, and copyable agent handoff
  packets.
- **Do not copy**: proprietary visual assets, exact layouts, icon sets, brand
  colors, marketing composition, screenshots, illustrations, or signature
  animation styles.

### Reference Permission Matrix

Use this matrix when "look at modern references" is part of the request.

| Reference | Safe To Borrow | Not Allowed | Atlas Translation |
| --- | --- | --- | --- |
| Apple HIG | platform hierarchy, sidebars, input/selection expectations, motion restraint | Apple assets, exact app chrome, private platform styling | macOS workbench surfaces should feel stable, keyboard-aware, and non-modal unless a task blocks the graph |
| Fluent 2 | responsive show/hide, reflow, resize, alignment language | Microsoft visual identity or component skin | compact WebView and 14-inch fullscreen may show less supporting metadata, but must not hide the current ontology fact |
| Atlassian | 8px spacing discipline, restrained elevation roles, dark-surface separation | Jira/Trello component styling | draggable graph cards need one clear raised layer; persistent panels need a different, quieter layer |
| Carbon | direct labels, concise legends, visualization anatomy | IBM chart styling or palette | relation labels should sit near the relation they explain; legends are backup, not the main reading path |
| Linear public writing | reduced visual noise, alignment, hierarchy, dense product-work surfaces | Linear's exact sidebar, issue UI, colors, icons, or animations | make Atlas calmer and more scannable while preserving ontology-specific facts |
| Rauno/public craft writing | fine interaction detail, immediate feedback, implementation craft close to the final medium | signature motion or personal portfolio styling | selection/focus/drag states should feel deliberate and verified in the installed app |
| yFiles/Cambridge Intelligence | graph question framing, filtering, clustering, accessible graph interaction | SDK demo visuals or vendor styling | Relief must answer "what is this fact and what can I do next?", not merely render a graph |
| Tufte/Rams | truthful density, less decoration, understandable and unobtrusive design | book/page aesthetics as a theme | remove non-informative chrome before adding new UI |

When a design decision cites a reference, state the principle in Atlas terms.
Example: "Use Carbon's direct-label principle so relation labels explain typed
facts without forcing the user to scan the legend." Do not write "make it look
like Carbon."

### Reference Translation Examples

- Apple HIG -> "A selected relation inspector should behave like focused
  workbench state, not a floating decoration over the map."
- Fluent 2 -> "When the viewport tightens, supporting metadata may reflow or
  collapse, but the current selected ontology fact must remain visible."
- Atlassian spacing/elevation -> "Persistent analysis panels and active
  selected-state cards need different layers and an 8px-compatible rhythm."
- Carbon visualization -> "Prefer direct relation labels and concise evidence
  chips over a legend-only explanation."
- Linear public redesign writing -> "Reduce visual noise and align panels so
  the work surface gains density without becoming busier."
- Rauno/public craft writing -> "Interaction details should be proven in the
  actual app, close to the final medium, not only in code review."
- yFiles/Cambridge graph guidance -> "Graph styling must answer an analysis
  question: relation type, provenance, confidence, focus path, or next action."

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
- **Composer blocks the map**: when Add Concept or another composer is open, the
  graph beneath it must be visibly demoted, dimmed, or interaction-blocked so
  the user can tell they are editing, not selecting topology.
- **Path prompt is supporting chrome**: path/focus guidance must not cross over
  the left analysis panel or selected inspector. If it cannot fit, collapse it
  into the panel or top chrome instead of floating across the graph.
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
- any blocking composer dims or suppresses competing topology interaction,
- path/focus prompt does not overlap the left panel, selected inspector, HUD, or
  minimap,
- minimap viewport frame is readable, not a hairline,
- click focus and drag focus both expose relationship context,
- MCP/CLI action remains discoverable from the selected state.

## 14-Inch MacBook Critique Protocol

Use this protocol whenever a screenshot or installed-app run comes from a
14-inch MacBook-class fullscreen window.

1. Treat the first viewport as the product. Do not assume the user will resize
   the app to discover the intended layout.
2. Name the primary task state: overview, selected node, selected relation, path
   selection, drag arrange, composer, or agent handoff.
3. Assign every visible surface to one attention layer: base map, persistent
   support, active focus, blocking edit, or utility chrome.
4. If two surfaces share the same layer, one must move, collapse, dim, or become
   part of the other surface.
5. Check the installed app, not only the browser: route, viewport size, overlap
   markers, selected geometry, and whether the app exits cleanly after
   verification.
6. If Computer Use can observe the app, capture the accessibility tree or
   screenshot as human proof. If it cannot, use deterministic WebView evidence
   and say so.

### 14-Inch No-Gos

On a 14-inch-class first viewport, do not ship a Relief/Topology state where:

- a mode prompt crosses over the left analysis panel;
- Add Concept or another composer floats above active graph cards without a
  dimmed/blocking edit layer;
- a selected node/relation card and the left analysis panel compete as equal
  primary surfaces;
- drag preview reveals more relationship context than click selection;
- a minimap, HUD, legend, relation label, or selected card overlaps another
  fixed/card surface;
- a panel changes width language between adjacent modes without a named reason;
- Korean and English labels are mixed in the top chrome for the same locale;
- the verifier cannot prove the installed app route, viewport, overlap count,
  selected geometry, and handoff marker.

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
