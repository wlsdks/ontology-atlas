---
title: Design System
tags: [design, ux, linear, overview]
---

# Design System

> This document is maintained based on Section 3 of the design spec. For the original Linear specification, see [`design-references/DESIGN-linear.md`](design-references/DESIGN-linear.md).

## Why this direction

`ontology-atlas` should feel like a compact graph workbench, not a documentation
portal with a graph attached. The visual direction is still restrained: dark or
light neutral surfaces, one indigo accent, dense but readable controls, and no
decorative gradients. The product value comes from moving between three modes
over the same local markdown graph:

- **Browse** — hierarchy, node detail, reachability, and ego graph.
- **Write** — builder canvas edits that write back to vault frontmatter.
- **Query** — graph DB-style scans, health checks, domain matrix, and path
  evidence.

The tree is therefore a browse mode, not the whole product identity. Headers,
cards, and navigation should point users from tree inspection into Builder and
Insights whenever the next action is writing or graph-level verification.

## Cited lineage — where these rules come from

These rules are an applied reading of public, citable design thinking, not arbitrary taste.
Full grounding + verified links in [`FOUNDATIONS.md` §4](./FOUNDATIONS.md#4-design-lineage--restraint-as-craft-cited).

| Our rule | Descends from |
|---|---|
| Neutral greys + single indigo; ban glow/neon/gradients/glassmorphism | **Dieter Rams**, *Ten Principles* — "unobtrusive / honest / as little design as possible" ("Less, but better") |
| Topology & insights = maximal signal, minimal chrome; honest, proportional relation rendering | **Edward Tufte** — data-ink ratio + graphical integrity |
| `@theme` token scale; constrained spacing; "no second coloring system"; hierarchy by de-emphasis | **Wathan & Schoger**, *Refactoring UI* (also the Tailwind authors) |
| Kind hierarchy + typed relations as the organizing device; lean high-signal vault | **John Maeda**, *Laws of Simplicity* — Reduce / Organize; "subtract the obvious, add the meaningful" |
| Restraint as a *quality* decision (not decoration) that wins against AI-UI clichés | **Karri Saarinen / Linear**, "Why is quality so rare?" |
| Invisible-detail polish (hover/focus/transition feel) without flashy patterns | **Rauno Freiberg**, "Craft" |
| Motion: `transition-colors`/opacity, sub-200ms, minimal transform, `prefers-reduced-motion`; state-conveying not decorative | **Emil Kowalski**, "Great animations" |
| Native-feeling motion that explains status, feedback, and continuity without overwhelming the task | **Apple Human Interface Guidelines**, Motion |
| Design-system quality as a shared language for designers, developers, and product work; interaction detail as part of product finish | **Toss Design System** public docs and Toss design-system article |
| Unstyled accessible primitives + our own theming; mono for code/diagrams | **Radix Primitives**, **Vercel Geist** |
| Topology: overview first, ego-focus + details-on-demand popover (never fullscreen on click); start focused as the graph scales | **Ben Shneiderman**, *The Eyes Have It* (1996) — "overview first, zoom and filter, details-on-demand"; **Cambridge Intelligence / yFiles** large-graph guidance |

When proposing a design change, name which row it serves — or argue explicitly why it diverges.

## Top-tier Quality Bar

Ontology Atlas should feel like a designer-grade macOS workbench for a local
ontology, not a web dashboard that happens to run in a desktop shell. The target
is **Apple-level clarity and continuity** plus **Toss-level product finish**:
every action should feel calm, direct, and obviously useful, while still keeping
the restrained graph-workbench language that makes the product trustworthy for
developers and AI agents.

This bar changes how we judge UI work:

- **Action quality** — every primary control should answer "what happens next?"
  in the label, tooltip, aria label, and resulting state change. If a command
  writes or validates the graph, the next proof surface should be one click
  away.
- **Motion quality** — motion is a semantic contract, not decoration. Use it to
  confirm command feedback, preserve continuity between focused nodes, reveal
  staged changes, or explain graph-state transitions. Keep it fast,
  interruptible, transform/opacity-based, and fully compatible with
  `prefers-reduced-motion`.
- **Ontology expression** — visible UI should name the ontology handle it is
  operating on: kind, slug, relation type, proof target, path, or graph query
  contract. Avoid hiding the ontology behind generic document/editor language.
- **Agent usability** — screens that change the graph should expose copyable
  MCP/CLI proof packets or direct handoffs so Claude Code/Codex can verify the
  same state the human just changed.
- **Performance honesty** — graph DB-style affordances must show result
  contracts, limits, partial evidence, and cache/query readiness. A pretty graph
  without query evidence is not enough.

Reference anchors for this bar:

- Apple HIG Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Toss Design System overview: https://developers-apps-in-toss.toss.im/design/components.html
- Toss design-system article: https://toss.tech/article/toss-design-system

## Design tokens

Defined via Tailwind 4's CSS-based `@theme`. See `app/globals.css` for the actual implementation.

### Backgrounds

- `--color-canvas`: `#08090a`
- `--color-panel`: `#0f1011`
- `--color-elevated`: `#191a1b`
- `--color-secondary-surface`: `#28282c`

### Text

- `--color-text-primary`: `#f7f8f8`
- `--color-text-secondary`: `#d0d6e0`
- `--color-text-tertiary`: `#8a8f98`
- `--color-text-quaternary`: `#62666d`

### Accent (the only color)

- `--color-indigo-brand`: `#5e6ad2`
- `--color-indigo-accent`: `#7170ff`
- `--color-indigo-hover`: `#828fff`

### Borders

- `rgba(255,255,255,0.05)` — subtle
- `rgba(255,255,255,0.08)` — default
- `rgba(255,255,255,0.12)` — strong

### Typography

- Primary: `Inter Variable` (OpenType `"cv01", "ss03"` applied globally)
- Signature weight: `510` (Linear's signature)
- Mono: `JetBrains Mono`

### Relief/Topology layout tokens

Relief/Topology layout tokens live in `app/globals.css` under `:root` because
they are runtime workbench contracts, not Tailwind-only decoration. Use token
names in component data markers and tests whenever a surface depends on
14-inch fullscreen geometry.

- `--topology-panel-selected-rail-width`: selected node support rail.
- `--topology-panel-overview-rail-width`: overview left support rail.
- `--topology-panel-overview-reserved-width`: overview rail when a right-side
  inspector reserves map space.
- `--topology-panel-path-rail-width`: path mode support rail; the path prompt
  must not become a second large panel.
- `--topology-panel-standard-width`: non-overview/non-path analysis panel.
- `--topology-panel-standard-reserved-width`: standard panel with reserved
  right-side inspector space.
- `--topology-panel-compact-width`: compact fallback when header alignment is
  unavailable.
- `--topology-panel-compact-reserved-width`: compact fallback with reserved
  right-side inspector space.
- `--topology-selected-relation-card-width` /
  `--topology-selected-relation-card-max-height`: compact selected relation
  inspector geometry; keeps MCP/CLI handoff visible without turning the card
  into a central map panel or a tall relation drawer.
- `--topology-selected-relation-card-inset`: selected relation right-rail inset
  that keeps the inspector out of the central relation path.
- `--topology-selected-relation-card-top`: selected relation top offset that
  clears the first-row workspace chrome.
- `--topology-selected-relation-action-min-width`: selected relation copy
  action minimum width; keeps the recommended MCP/CLI action readable without
  widening the inspector.
- `--topology-selected-relation-copy-payload-min-height`: selected relation
  payload strip minimum height; keeps the handoff command visible as one
  compact proof row.
- `--topology-selected-relation-next-action-surface` /
  `--topology-selected-relation-next-action-border`: selected relation
  next-action rail. The primary MCP action must read first, with payload and
  CLI fallback evidence inside the same rail instead of floating as separate
  proof fragments.
- `--topology-selected-relation-accent-text` /
  `--topology-selected-relation-accent-muted` /
  `--topology-selected-relation-focus-ring` /
  `--topology-selected-relation-copy-primary-shadow`: selected relation
  inspector action accent system. The title, relation direction, recommended
  action label, payload label, focus rings, and primary copy elevation must use
  one token-backed accent language instead of scattered RGBA values.
- `--topology-selected-relation-route-step-min-width`: selected relation
  fact/evidence/gate/action step minimum width; prevents cramped ontology
  proof cells inside the compact inspector.
- `--topology-relation-label-card-clearance`: minimum distance between
  scan-level relation labels and visible map cards; keeps the label readable as
  a topology annotation instead of a clipped card badge.
- `--topology-relation-label-surface` / `--topology-relation-label-border` /
  `--topology-relation-label-shadow`: scan-level relation label treatment that
  separates typed relation facts from selected-card surfaces.
- `--topology-relation-label-selected-surface` /
  `--topology-relation-label-selected-border` /
  `--topology-relation-label-selected-shadow`: focus-level selected relation
  label treatment. A selected relation is the active ontology fact on the map,
  so its halo must be token-backed instead of embedded RGBA in the renderer.
- `--topology-focus-hull-*`: selected focus/drag cluster hull treatment. The
  quiet focus outline and active drag hull must be token-backed so the map reads
  as a relationship boundary, not a second panel or an ungoverned glow.
- `--topology-card-drag-*`: drag, active drag, and settle feedback for map
  cards. Drag motion is an interaction state in the topology grammar, so the
  wash/glow tokens must stay separate from generic selected-card elevation.
- `--topology-relation-quality-*-dot` /
  `--topology-relation-quality-*-glow`: relation quality dots inside map labels.
  Strong, supported, weak, and review states must be visible as semantic graph
  marks rather than Tailwind color classes.
- `--topology-relation-gate-*-surface` /
  `--topology-relation-gate-*-border` /
  `--topology-relation-gate-*-text`: relation label gate chips for MCP/CLI,
  preflight, and review flows. Gate color is agent handoff state, not
  decorative status color.
- `--topology-path-endpoint-surface` /
  `--topology-path-endpoint-border` /
  `--topology-path-endpoint-text`: Path mode A/B endpoint badges on map cards.
  They mark source and target anchors for path verification, so they must stay
  token-backed on both desktop and compact WebView layouts.
- `--topology-relation-evidence-chip-surface` /
  `--topology-relation-evidence-chip-border` /
  `--topology-relation-evidence-chip-text`: compact evidence glyph inside a
  map relation label (`S#`, `A`, `R`). It must read as a proof-state chip, not
  loose helper text, so source-backed/authored/review status remains visible
  while scanning relations.
- `--topology-edge-tooltip-surface` / `--topology-edge-tooltip-border` /
  `--topology-edge-tooltip-shadow`: hover relation tooltip treatment. It must
  stay a compact relation fact with `source -> target`, relation type, and
  evidence state; longer MCP/CLI handoff grammar belongs in the selected
  relation inspector.
- `--topology-node-popover-relation-list-min-height`: selected node inspector
  relation-list reading budget. On phone expanded detail it must show at least
  one complete relation row before scrolling, so a user can read the first
  fact/evidence/gate/action handoff without hunting inside the scroll region.
- `--topology-node-popover-relation-section-min-height`: selected node
  inspector section budget that keeps the relation lenses, the first full row,
  and the fixed footer from competing for the same vertical layer.
- `--topology-node-popover-action-focus-ring` /
  `--topology-node-popover-context-surface` /
  `--topology-node-popover-context-border`: selected node inspector support
  rail accents. Compact MCP/CLI actions, footer actions, and map-visible
  relation summaries must use node-popover tokens so the support rail stays
  visually related to the active focus state without becoming another primary
  relation inspector.
- `--topology-bottom-tab-surface` / `--topology-bottom-tab-border`: mobile
  topology navigation surface. It must be opaque enough that map cards and
  relation labels cannot bleed through tab icons or labels.
- `--topology-analysis-panel-compact-scroll-end-reserve`: compact analysis
  panel end padding. It keeps overview/focus/path proof content scrollable
  above the fixed mobile bottom tab instead of letting support evidence hide
  under primary navigation.
- `--topology-analysis-mode-rail-surface` /
  `--topology-analysis-mode-active-surface` /
  `--topology-analysis-mode-hover-surface`: Relief analysis mode rail. The
  Overview/Focus/Path/Health tabs stay icon-only and tooltip-labeled, but their
  active/hover feedback must be token-backed so mode switching reads consistently
  across compact and desktop support panels.
- `--topology-utility-lane-surface` / `--topology-utility-lane-border` /
  `--topology-utility-lane-shadow`: top utility chrome for search, auto
  arrange, docs, create, and review actions. These controls are support layer,
  so they use a quieter shared surface than selected-node or relation proof
  inspectors.
- `--topology-utility-lane-accent-surface` /
  `--topology-utility-lane-accent-border`: utility-lane accent actions such as
  create or review. They may signal actionability but must stay in the same
  compact lane geometry as non-primary utility controls.
- `--topology-utility-lane-focus-ring` /
  `--topology-utility-lane-count-surface` /
  `--topology-utility-lane-count-text`: support-action keyboard focus and
  compact count badge accents. Utility chrome is not the primary graph fact, but
  it must remain keyboard-readable and token-backed in compact WebView layouts.
- `--topology-blocking-backdrop-surface` /
  `--topology-blocking-map-opacity` / `--topology-blocking-map-filter`: blocking
  edit layer contract. When Add Concept or another graph mutation composer is
  open, the map remains visible as context but becomes visibly demoted and
  pointer-suppressed instead of reading as an active graph surface.
- `--topology-blocking-composer-top` /
  `--topology-blocking-composer-width` /
  `--topology-blocking-composer-max-height`: blocking composer geometry. The
  composer owns attention at 14-inch fullscreen and compact WebView sizes
  without drifting into the top utility lane or mobile bottom reserve.
- `--topology-blocking-composer-surface` /
  `--topology-blocking-composer-border` /
  `--topology-blocking-composer-shadow`: blocking composer visual contract. The
  form must read as the sole active write surface over the dimmed topology map,
  using token-backed elevation rather than ad hoc glow or hard-coded colors.
- `--topology-path-route-surface` / `--topology-path-route-border` /
  `--topology-path-route-chip-surface` /
  `--topology-path-route-chip-border`: path result route rail. When both source
  and target endpoints are selected, the analysis rail must expose the current
  source-to-target route before the proof disclosure so users and agents can
  read the active graph question without opening secondary evidence. The same
  tokens also govern the proof disclosure route recap and source/target
  ontology or Builder exits, so route evidence stays visually tied to the
  selected path instead of generic panel chrome.
- `--topology-path-proof-step-surface` /
  `--topology-path-proof-step-border` /
  `--topology-path-proof-summary-surface` /
  `--topology-path-proof-summary-border` /
  `--topology-path-proof-summary-hover-surface` /
  `--topology-path-proof-summary-hover-border` /
  `--topology-path-proof-ready-surface` /
  `--topology-path-proof-ready-border` /
  `--topology-path-proof-ready-text` /
  `--topology-path-proof-required-surface` /
  `--topology-path-proof-required-border` /
  `--topology-path-proof-required-text` /
  `--topology-path-proof-after-write-surface` /
  `--topology-path-proof-after-write-border` /
  `--topology-path-proof-after-write-text`: path proof disclosure, checklist
  rows, and status chips. The collapsed disclosure must read as an available
  proof control, not empty panel text, while ready / required / after-write
  evidence stays in the same agent handoff language as the primary path action.
- `--topology-path-candidate-visibility-surface` /
  `--topology-path-candidate-visibility-border`: path candidate coverage strip.
  It explains how many map cards remain visible after panel-clearance hiding,
  so the user can trust whether the current source/target selection is being
  made from the full visible candidate set or a collision-managed subset.
- `--topology-path-primary-evidence-surface` /
  `--topology-path-primary-evidence-border` /
  `--topology-path-primary-evidence-hover-surface` /
  `--topology-path-primary-evidence-hover-border`: path result primary handoff
  action. When a source and target are selected, `Copy path evidence` must read
  as the first actionable proof step inside the agent handoff rail, before MCP
  and CLI fallback chips and before the secondary proof disclosure.
- `--topology-path-handoff-mcp-surface` /
  `--topology-path-handoff-mcp-border` /
  `--topology-path-handoff-mcp-text` /
  `--topology-path-handoff-cli-surface` /
  `--topology-path-handoff-cli-border`: path handoff fallback chips. The MCP
  chip remains the stronger command target, while the CLI fallback stays visible
  but quieter in the same compact rail. The same family covers the disclosed
  path checks rail (`path`, `relation_check`, `explain_relation`, `all_paths`
  plan, and `all_paths` run) so graph-evidence copy tools read as one sequence
  rather than unrelated compact buttons.
- `--topology-overview-signal-grid-surface` /
  `--topology-overview-signal-grid-border` /
  `--topology-overview-notice-surface` /
  `--topology-overview-notice-border`: overview first-read signal stack. These
  tokens keep relation progress, provenance, readiness, and the level-of-detail
  notice in one compact reading surface without hard-coded theme exceptions.
- `--topology-overview-signal-neutral-surface` /
  `--topology-overview-signal-neutral-border` /
  `--topology-overview-signal-indigo-surface` /
  `--topology-overview-signal-indigo-border` /
  `--topology-overview-signal-cyan-surface` /
  `--topology-overview-signal-cyan-border`: overview metric/provenance signal
  card tones. Neutral is for quantitative progress, indigo for ontology/agent
  command context, and cyan for supportive semantic facts.
- `--topology-overview-handoff-divider` /
  `--topology-overview-handoff-primary-surface` /
  `--topology-overview-handoff-primary-border` /
  `--topology-overview-handoff-secondary-surface` /
  `--topology-overview-handoff-secondary-border`: overview agent handoff rail.
  The graph brief remains the primary action; reanalysis and sync checks stay
  quieter inside the disclosure while sharing the same responsive token
  contract.
- `--topology-overview-quality-surface` /
  `--topology-overview-quality-border` /
  `--topology-overview-readiness-surface` /
  `--topology-overview-readiness-border`: overview proof cards for relation
  quality and agent readiness. They are scan facts, not nested cards, and must
  keep the first-read stack visually flat.
- `--topology-overview-proof-cell-divider` /
  `--topology-overview-proof-strong-text` /
  `--topology-overview-proof-supported-text` /
  `--topology-overview-proof-warning-text` /
  `--topology-overview-proof-review-text`: shared proof-cell divider and
  semantic text tones used by relation quality and readiness chips.
- `--topology-health-repair-primary-surface` /
  `--topology-health-repair-primary-border` /
  `--topology-health-repair-primary-hover-surface` /
  `--topology-health-repair-secondary-surface` /
  `--topology-health-repair-secondary-border` /
  `--topology-health-repair-secondary-hover-surface`: health repair action
  hierarchy. Builder repair is the primary action; MCP and ontology handoff
  remain compact secondary actions without inventing one-off button colors.
- `--topology-overview-readiness-meter-surface` /
  `--topology-overview-readiness-meter-border` /
  `--topology-overview-readiness-ready-meter` /
  `--topology-overview-readiness-preflight-meter` /
  `--topology-overview-readiness-review-meter`: readiness meter track and
  segment fills. These tokens keep the handoff-ready/preflight/review balance
  mode-aware without hard-coded gradient exceptions in the component.
- `--topology-minimap-surface` / `--topology-minimap-border` /
  `--topology-minimap-shadow`: right-side minimap support chrome. It is a
  navigation aid, not a selected fact surface, so it stays quieter than node
  inspectors and exposes
  `data-minimap-camera-sync-contract="raf-coalesced-camera-updates"` to prove
  high-frequency camera events are folded into frame-bounded renders.
  Drag/click navigation must also expose
  `data-minimap-pan-search-contract="precomputed-navigation-targets"` so pointer
  interaction reads a stable target array instead of re-entering the graph
  structure on every move.
- `--topology-floating-panel-surface` / `--topology-floating-panel-border` /
  `--topology-floating-panel-shadow`: expanded map-control sheet. It must read
  as one support surface with internal divider rows, not a stack of separate
  cards competing with the analysis panel or selected-node inspector.
- `--topology-command-step-surface` / `--topology-command-step-border`:
  selected-focus review order rail. Use one flat numbered rail with divider
  rows, not separate nested cards, so the support panel stays visually lighter
  than the map and selected-node inspector.
- `--topology-command-secondary-surface` /
  `--topology-command-secondary-border` /
  `--topology-command-secondary-hover-border`: selected-focus secondary exits
  and proof-copy actions. Ontology, Builder, MCP, impact, sync-gate, and
  strengthen-command handoffs must stay secondary to the focus brief primary
  action while remaining visible on compact widths.

Selected node expanded detail uses
`data-body-scroll-contract="content-scrolls-above-fixed-footer"` and
`data-footer-position-contract="anchored-bottom-visible"` on phone-sized
surfaces. The body may scroll, but the MCP/CLI action rail must remain inside
the visible popover frame while the relation list still exposes one complete
fact/evidence/gate/action row. Phone density markers may hide explanatory copy
before the first row, but must not hide the relation quality/readiness chips or
row-level handoff facts.

Selected node relation rows use
`data-row-surface-contract="flat-divider-rail"` on the list,
`data-row-surface-contract="flat-divider-row"` on each clickable relation, and
`data-relation-payload-layout="flat-inline-payload-rail"` on the payload route.
This keeps relation facts machine-readable and tappable without repeating
card-like surfaces inside the inspector.

On phone-width selected node detail, explanatory copy before the relation list
must yield to the first readable relation row. Keep the primary meaning line,
but hide technical summary/explainer/map-context copy with phone density
markers such as `data-phone-density-contract="hide-summary-before-readable-row"`
and `data-phone-density-contract="hide-explainer-before-readable-row"`.

Do not introduce a new panel width by writing a one-off `clamp(...)` in JSX.
First name the product reason, add or reuse a `--topology-*` token, and update
the WebView/test marker that proves the token is active.

### Relief/Topology motion tokens

Motion is product feedback. Use these tokens for click focus, camera movement,
panel entry, drag settle, and focus confirmation before adding bespoke easing:

- `--topology-motion-focus-duration`: short focus confirmation.
- `--topology-motion-panel-duration`: panel/support chrome entry.
- `--topology-motion-camera-duration`: camera pan/zoom continuity.
- `--topology-motion-drag-settle-duration`: post-drag settle.
- `--topology-motion-ease-standard`: default topology state transition.
- `--topology-motion-ease-out`: landing/settle transition.

New motion must name what it explains: selection, camera relocation, drag
movement, path construction, composer blocking, or command feedback. Motion
that only makes the screen feel busy fails the design system.

### Tokenization Contract For Relief/Topology

Relief/Topology is not allowed to rely on "looks better" CSS. A visual value is
valid only when it is a named workbench decision, an ontology-reading decision,
or a verified interaction decision.

Use named `--topology-*` tokens or add a documented token before changing:

- panel width, reserved map space, padding, radius, border, surface, shadow, and
  z-order intent;
- relation label width, selected relation card density, chip rhythm, footer
  height, disclosure thresholds, and proof row layout;
- dim/scrim treatment for a blocking composer, modal, destructive confirm, or
  write surface;
- camera, focus, panel, drag, path, composer, and reduced-motion durations or
  easing;
- MCP/CLI handoff markers that prove the selected fact, evidence, quality, and
  next action stay visible.

Relation-label handoff state is aggregated on the skeleton-cards root with
`data-relation-label-handoff-contract="label-level-mcp-cli-fallback"`. When a
map label is selected, the root must also expose the selected label's gate,
primary MCP action, CLI fallback command, fact route, quality, and evidence so
installed-app WebView evidence can prove the label is an actionable ontology
fact, not just a decorative badge.

Relation-label geometry is also a frame-level contract. The skeleton-cards root
must expose `data-relation-label-geometry-contract="frame-positioned-hit-targets"`
with after-render expected/ready/pending counts, so a visible scan label is
proved to have real viewport-clamped hit-target geometry before the user opens a
relation card.

Each new topology token needs:

- **product reason**: the user problem it reduces, such as overlap, unclear
  current action, unreadable relation evidence, or untrustworthy handoff;
- **state/layer**: map, support panel, focus/path, transient, blocking
  composer, or utility chrome;
- **responsive fallback**: compact, 14-inch fullscreen, 1920x1080, and
  2560x1440 behavior;
- **WebView/test marker**: deterministic evidence that the token is active and
  the relevant overlap/transient count remains acceptable.

Treat W3C/DTCG-style design tokens as the principle: design decisions should be
portable, named, inspectable, and testable across tools. This repo does not
copy third-party component skins, palettes, layouts, screenshots, assets, or
animation signatures.

## Category differentiation strategy

Differentiate by **border style**, not color — the only color (indigo) is reserved for hub nodes:

| Category           | Marker                                    |
| ------------------ | ----------------------------------------- |
| In progress        | Indigo underline                          |
| Planned            | Dashed border                             |
| Hub (IAM/Reactor)  | Indigo background and border (only color) |

## Product Surface Hierarchy

Operational pages should expose intent before visual flourish:

1. **Primary task** — what the user can do on this screen now.
2. **Graph evidence** — node count, relation count, warnings, health, or query
   packet readiness.
3. **Next graph action** — Builder for writes, Insights for graph DB-style
   queries, Topology for spatial/path inspection.

Avoid making large explanatory panels the first thing users read. Prefer compact
action strips with labels that name the mode (`Browse`, `Write`, `Query`) and a
short reason to click.

Tree surfaces should explain their boundary instead of pretending to be the
whole ontology. Use a single-line role/status strip, not a row of cards, to show
that the tree is the hierarchy index, relation counts come from frontmatter
refs, document nodes remain evidence outside the concept tree, and projection
notes are available on demand. Node-detail handoffs should always keep the three
workbench exits visible: Topology for visual focus, Builder for
frontmatter-backed edits, and Insights for graph DB-style validation. The
selected-node panel should repeat that as a
small Browse / Write / Query rail before longer review content, so choosing a
tree node immediately offers visual focus, builder focus, and node proof without
requiring the user to parse the whole collaborator brief.
When a tree row is selected, repeat the active canonical slug near the
Browse/Write/Query summary; the tree is choosing the graph handle the next
write and query will keep, not just highlighting a row. Tree rows themselves
should also name the graph handle they select: the row button label should
include the slug handoff, and the selected row should show a compact handle
chip so keyboard focus, the detail panel, Builder, and Insights are visibly
using the same concept id.
When no node is selected yet, the tree area should still expose a small
selection hint that names the same Browse / Write / Query outcome. This makes
row selection feel like the entrance to the workbench loop, not just a file-tree
click.
The `/ontology` Browse / Write / Query cards should live behind the work overview
disclosure and carry compact proof chips (`tree projection`, `frontmatter write`,
`dogfood:graph-db`) so users can inspect the runtime contract without making the
cards permanent chrome. Treat them as an ordered workbench loop: show `01` /
`02` / `03` execution markers and one short loop-action line per card so Browse
reads as selecting the slug, Write as editing that same slug, and Query as
proving the graph after the change.

Tree projection warnings should be named as projection notes, not generic data
errors. The tree can only show one readable hierarchy, while the same
frontmatter graph may contain valid multi-parent or cyclic semantic relations.
When projection notes exist, the card should expand into a concrete warning
list and hand off to Insights for graph scans or Builder for relation review.
The graph DB proof rail on `/ontology` is a compact execution strip, not a
second hero card. Keep the single-line hierarchy status above it so the browse
surface first explains why the hierarchy exists and where its boundary is; then
show the MCP/CLI pack counts and representative query intents as proof that the
same markdown graph is queryable. The rail should also expose
the graph DB runtime gate plus the shared post-change sync gate, so browse can
prove the graph now and close a write without making the user find a deeper
panel first. The runtime gate copy should name the replay shape directly:
setup self-check, `health --json`, focused `blast_radius`, scan follow-ups,
public relation-name parity (`relation_name_parity`), `pattern_walk` /
`project_map` containment replay, bounded `all_paths` evidence, and
`relation_check`. Keep local frontmatter compile proof below the tree; it is
source evidence, not the primary browse entry.

Builder write surfaces should keep the canvas as the default first task. The
large page title and `Source` / `Draft` / `Guard` / `Proof` rail should not
always consume the first viewport. Keep a compact `Write status` disclosure
near the canvas controls; opening it reveals the ordered cells that distinguish
local writable vaults from sample read-only data, unsaved canvas work from
persisted graph data, preview/preflight checks from direct frontmatter writes,
and the MCP/CLI proof packets that close a graph mutation after it lands. The
`Guard` cell should expose a copyable relation guard packet with path planning,
relation_check, explain_relation, and post-change sync instructions; this keeps
preflight usable before the relation modal is open. The `Proof` cell should
hand off to the query cockpit so a builder write naturally flows into graph
DB-style verification instead of ending as a canvas-only action. The copied
proof packet should start with the same setup self-check, graph DB pack, and
`pnpm dogfood:graph-db` runtime replay exposed elsewhere in the workbench. The
replay also needs to name structural containment checks (`pattern_walk` /
`project_map`) so Builder proof is visibly stronger than a path-only guard.
When expanded, each cell should expose a compact proof chip (`local markdown`,
`canvas draft`, `relation guard`, `graph db + health`) and the visible execution
order; when collapsed, the canvas remains visually dominant.
The canvas entry rail should then pick up that same loop at the graph level:
name the rail as saved node entrypoints, show the node/ref counts, and add
a compact `pick focus node` chip plus hover hint that users should choose a
saved node before drawing so the details panel and proof handoffs keep the same
slug. When a saved node is focused, repeat that active slug in the rail and
visually mark the matching node button; the builder should always make the
current write/proof handle explicit before a relation is drawn. The rail is a
real operation control, not decoration: expose it as a labelled region, give
each saved node a direct focus label, and make the active focus slug readable
to keyboard and assistive-technology users.

Query surfaces should expose the executable query pack before deeper charts.
Use a compact cockpit with readiness, pack size, MCP call count, CLI fallback
count, representative `MATCH ...` intents, first-operation badges, per-intent
payload/fallback counts, scan/path result contracts, and the self-check plus
health gate. The setup self-check and `dogfood:graph-db` runtime gate should be
copyable from the first viewport so the query surface is executable, not just
descriptive.
Deeper panels can explain contracts, but the first viewport should make it
clear that the local markdown graph can be scanned like a small graph database
without treating raw rows or partial paths as proof.

Source/setup surfaces should expose the vault execution contract before setup
actions. Use compact `Files` / `Graph` / `Agent` cells to show that local
markdown remains the source of truth, frontmatter compiles into graph/query
surfaces, and MCP agents read the same vault. Action cards can follow, but the
first native-app entry must make the ontology workbench contract clearer than
the document-editor mechanics. The `Agent` cell should expose a copyable graph
DB runtime gate, so Source Vault can prove the same read-first agent loop
without sending the user to a deeper panel first. Its visible replay markers
should name `relation_name_parity` and `pattern_walk` / `project_map`, so the
source route reads as the start of graph verification rather than a document
reader with an agent button.
The global entry label and page header for `/docs` should say `Source` /
`Source Vault`, not `Docs`, because that route is the local markdown source and
agent setup surface for the graph. First-viewport counts and vault badges should
say `source records` / `records`, not `docs`. Keep `document` language for
individual markdown files and evidence rows, but avoid making the route identity
read like a documentation portal. Palette groups, search sections, empty-state
prompts, and tree navigation labels should say `Source records` / `Source tree`
when they name the surface rather than one specific markdown file.

## Topology node focus & scale (ego popover)

Full spec + cited references: [`TOPOLOGY-FOCUS-AND-SCALE.md`](./TOPOLOGY-FOCUS-AND-SCALE.md).
The graph view obeys the infovis mantra *overview first, zoom and filter, then
details-on-demand* — not the inverse (everything-at-once + fullscreen-on-click).

- **Click = ego focus + compact popover, not a fullscreen modal.** Clicking a
  node keeps the node and its direct neighbors (its `ego` subgraph) at full
  opacity and dims/hides the rest via Sigma `nodeReducer` / `edgeReducer` (the
  underlying graphology instance is not mutated). A content-sized popover
  anchors near the node and lists the connected nodes (each a click target for
  an incremental ego walk). The large `NodeDetailPanel` becomes an opt-in
  `전체 상세 →` drill, not the click default.
- **Card count chips are topology marks.** `--topology-card-count-surface` /
  `--topology-card-count-border` / `--topology-card-count-text` make each
  visible skeleton card's count read as node scale, not incidental metadata.
  Keep the chip compact and token-backed so card width remains stable while
  important anchors expose why they matter on the map.
- **Default view is an overview, not the full graph.** Show `project` + `domain`
  + hub nodes at level 0; reveal a domain's members on demand (semantic zoom).
  Never drop the full 2–3k-node hairball on the user uninvited.
- **Plain language over graph jargon.** `영향받음 N` → "이 노드를 쓰는 곳 N";
  `의존 N` → "이 노드가 기대는 곳 N". No duplicated labels (`개념 정보` ×3).
- **Scale path (≈2–3k → 10k+).** Sigma/WebGL renders ~10k nodes; the costs are
  labels, edges, and live layout. Mitigate in order: precompute + cache the
  ForceAtlas2 layout, level-of-detail labels (`hideLabelsOnMove` /
  `hideEdgesOnMove`), keep representative-edge culling, then domain clustering
  above ~5k.
- **WebGL palette tokens.** Sigma graph marks do not consume CSS custom
  properties directly; `src/widgets/topology-map-sigma/lib/topology-palette.ts`
  is the map-layer token source. Dark overview edges must stay quiet enough for
  dense vaults, but still visible as topology context before focus/path
  reducers promote selected relations. Treat base / containment / dependency /
  dim edges as semantic layers, not incidental RGBA literals.

This serves the new "topology" row in the cited-lineage table above.

## Anti-AI Design Criteria

Anti-AI design does not mean colorless UI. It means every visual decision has a
job that a local-first ontology workbench needs, and nothing is added just to
look generated, glossy, or broadly SaaS-like.

Apply these checks before shipping ontology surfaces:

- **Color is a keyed data mark, not atmosphere.** Kind color may identify
  `project` / `domain` / `capability` / `element` / `unknown`, but the surface
  must also show a label, icon, size, position, or legend. This follows WCAG
  2.2 SC 1.4.1 and Apple HIG color guidance: do not rely on color alone.
- **Color area stays proportional to evidence value.** Graph marks can use
  high-contrast fills because they are small data points; panels and cards use
  neutral surfaces, compact swatches / markers, and low-alpha borders. Avoid
  full-height colored rails inside detail cards; they read as decorative
  generated-callout chrome before they explain the data.
- **Qualitative, not theatrical.** Kind colors are nominal categories, so they
  use a quiet qualitative palette in the ColorBrewer sense. Avoid neon yellow,
  magenta, or over-saturated "AI dashboard" tones when label/icon/shape can do
  the separation work.
- **No generated-gloss signals.** Decorative gradients, glass blur, glow rings,
  aurora backgrounds, oversized rounded cards, and scale-hover motion are
  regressions unless a specific native-system state requires them.
- **Craft is verified in small contracts.** The design drift guard must catch
  forbidden patterns, focused tests must lock role labels and tone attributes,
  and browser/native verification must prove the UI reads as a workbench rather
  than a decorative demo.
- **No floating-box soup.** A screen with several unrelated cards, popovers,
  prompts, minimaps, HUD buttons, and inspectors visible at the same visual
  weight is not "rich"; it is an attention failure. One surface owns the
  current action, support surfaces stay visibly weaker, and blocking surfaces
  dim or suppress the rest.
- **No stacked transient UI.** Popovers, context menus, hover previews, and
  selected cards may not cascade as unrelated layers. Opening a new transient
  surface closes the previous unrelated one; opening a composer/modal demotes
  or closes transient surfaces and blocks parent-map interaction.
- **No tokenless positioning.** Panel width, radius, padding, shadow, elevation,
  z-order intent, and topology motion must use named tokens or marker-backed
  contracts. One-off `clamp(...)`, shadow, or easing values in JSX are treated
  as design debt unless the same change adds a token and verifier.
- **No modal without modality.** A write composer, destructive confirm, or
  decision dialog must visibly separate itself from the map through a dim,
  scrim, or blocked interaction state. If the background still appears equally
  actionable, the modal/composer fails.
- **No elevation noise.** More shadow does not mean more hierarchy. Elevation
  must describe map/support/focus/transient/blocking layer order and be
  consistent across dark/light themes.

Reference anchors:

- Apple HIG Color: https://developer.apple.com/design/human-interface-guidelines/color
- Apple HIG Modality: https://developer.apple.com/design/human-interface-guidelines/modality
- Apple HIG Sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
- Apple HIG Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Fluent 2 Layout: https://fluent2.microsoft.design/layout
- Fluent 2 Design Tokens: https://fluent2.microsoft.design/design-tokens
- Material Design Dialogs: https://m2.material.io/components/dialogs
- WCAG 2.2 SC 1.4.1 / 1.4.11: https://www.w3.org/TR/WCAG22/
- W3C Understanding SC 1.4.11: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast
- ColorBrewer scheme types: https://colorbrewer2.org/learnmore/schemes_full.html
- Linear, "Why is quality so rare?": https://linear.app/now/why-is-quality-so-rare

## Absolute rules (Don'ts)

- ❌ Purple → pink gradients
- ❌ Glassmorphism (`backdrop-blur`)
- ❌ Glow pulse / neon effects
- ❌ Glow-like `boxShadow: \`0 0 ...\`` rings on ontology operation surfaces
- ❌ Animated gradient backgrounds / aurora
- ❌ Scale-based hover effects
- ❌ More than one color system
- ❌ Floating-box soup: unrelated panels/popovers/HUD/minimap/cards at equal
  visual weight
- ❌ Stacked popovers or popover-over-modal without closing/dimming the previous
  surface
- ❌ Blocking composer/modal without dim, scrim, or suppressed parent
  interaction
- ❌ One-off topology `clamp(...)`, shadow, radius, z-order, easing, or duration
  without a `--topology-*` token and verifier marker
- ❌ Overlap tolerated because the surface "mostly still works"; overlap count
  must be `0` for fixed/card surfaces in the tested state

## Motion principles

- Initial load: `opacity 0 → 1` + `translateY 8px → 0` (spring)
- Hover: border opacity rises, connected edges brighten — no scale or glow
- Drawer: right-side `x: 100% → 0` spring
- Filter toggle: deselected categories fade to `opacity 0.15`
- Background: fully static
- Respect `prefers-reduced-motion`

## Page header — English caption + Korean h1

The header on each operations page (currently `/ontology/edit` and `/ontology/insights`) follows a **two-line pattern**. The user-facing Korean title is the primary heading, and the English category caption serves as a micro identifier that yields one step in the visual hierarchy.

### Pattern

```
[English category caption — 9~10px / mono / uppercase / tracking 0.14em / quaternary color]
[Korean h1 — text-2xl / signature weight / primary color]
[Subtitle — Korean / sm / secondary color (optional)]
```

Example: `/ontology` page

```tsx
<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
  Ontology
</p>
<h1 className="text-2xl font-[var(--font-weight-signature)]">
  온톨로지 트리
</h1>
<p className="text-sm leading-7 text-[color:var(--color-text-secondary)]">
  승인된 노드와 관계를 …
</p>
```

### Intent

- **English caption** — A category-area identifier for the page. The mono + uppercase + spacing combo enables fast visual recognition of "where you are," but stays weaker than the main heading so the Korean h1 reads first.
- **Korean h1** — The name users actually call it. Korean is the primary heading, so all body copy / descriptions / CTAs maintain a consistent Korean tone.
- **Two-line separation** — Mixing English and Korean on a single line (e.g. "온톨로지 Ontology") is forbidden. Each line stays in a single language with a single tone.

### Legitimate English caption examples

- Page categories: `Ontology`, `Workspace`, `Manual node`, `Get started`.
- System metadata: `ID 추천`, `Beta`, etc. — only intentional English identifiers. Sentence-style English is forbidden (translate to Korean).

### Consistency rules

- Caption font size stays in the `9px ~ 10px` range. Tracking ranges from `0.10em ~ 0.18em`.
- Within a single page, keep caption tokens consistent (mono / uppercase / tracking / color). System tokens will eventually be unified under a CSS var like `--font-caption-mono`.
- Use the English caption only once per page (top header). Don't repeat English category labels in the body — avoid duplicating the visual hierarchy.

### Surfaces where this applies (current)

`/ontology/edit`, `/ontology/insights` — all follow the same pattern.

The public surfaces `/`, `/topology`, `/docs`, `/projects`, `/project/[slug]` use the standalone Korean h1 pattern (without an English eyebrow caption) — these are the browse surfaces, not the operations surfaces.

## Changelog

- 2026-06-08: Added topology node-focus & scale pattern (ego popover, overview-first, plain-language counts, LOD perf path); see [`TOPOLOGY-FOCUS-AND-SCALE.md`](./TOPOLOGY-FOCUS-AND-SCALE.md)
- 2026-04-13: Removed the consulting category
- 2026-04-12: Initial draft (Phase 0)
