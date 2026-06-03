---
status: DESIGN - ready for user review
created: 2026-06-03
owner: user (jinan) + Codex
pillar: 1 (AI agent partner) + 3 (human design surface)
relates:
  - docs/superpowers/specs/2026-05-31-staging-draft-canvas-design.md
  - docs/superpowers/specs/2026-05-31-atlas-vision-roadmap.md
  - docs/PRODUCT-DIRECTION.md
  - docs/FEATURES.md
---

# Builder v2 - Relation Repair Workbench

## Decision

Rebuild `/ontology/edit` as a **Relation Repair Workbench**, not a general graph
dashboard and not a freeform diagram editor.

The Builder's job is narrow:

1. Pick one persisted ontology concept as the working focus.
2. Show only the relation neighborhood needed to understand and repair that focus.
3. Stage proposed node/relation/frontmatter changes without touching the vault.
4. Review preflight, graph proof, and MCP/CLI handoff in a focused sheet.
5. Apply or discard the staged batch.

`/topology` remains the full-graph visual overview. `/ontology/insights` remains
the graph DB query cockpit. Builder v2 is the place where a human and an AI
agent safely change the ontology.

## Why This Is Needed

Runtime observation in the installed macOS app on 2026-06-03 showed that the
current Builder first viewport competes with itself:

- Four always-visible status cards (`Source`, `Draft`, `Guard`, `Graph DB Proof`)
  take the top of the screen before work begins.
- The graph anchor rail, node palette, minimap, and right inspector are all
  mounted at once.
- The canvas receives too little first-viewport attention, even on a full-screen
  14-inch MacBook Pro class window.
- Collapsing the inspector helps horizontal space, but the top status/proof
  chrome still dominates the work area.
- The sample vault already has 64 ontology nodes and 363 references; rendering
  all of them in Builder makes the page feel like a difficult graph viewer
  before the user has made one editing decision.

This is an information-architecture problem. It should not be solved by adding
more collapse buttons to the current surface.

## Ontology Grounding

Context Atlas should keep using the word **ontology** only where the product
really behaves like one.

The product mapping is:

- **Conceptualization**: the codebase is modeled as `project`, `domain`,
  `capability`, and `element` concepts. This follows Gruber's ontology framing:
  a specification of a shared conceptualization, made explicit enough for
  multiple agents to share.
- **Graph data model**: markdown frontmatter stores directed statements:
  subject node, relation key, object node. This maps to RDF's graph/triple
  spirit without claiming full RDF compatibility.
- **Classes / properties / individuals**: `kind` is the lightweight class axis;
  frontmatter relation keys are properties; each markdown file is an individual
  concept instance.
- **Concept scheme**: the vault is closer to a practical SKOS-like knowledge
  organization system than a theorem-proving OWL ontology. The UI should expose
  labels, hierarchy, related concepts, evidence, notes, and change history
  before it exposes formalism.

Builder v2 therefore should not teach ontology theory on screen. It should make
the **meaning model executable**: every proposed relation must have a typed key,
source, target, evidence, preflight result, and an agent-readable handoff.

References used for this grounding:

- Gruber, "A Translation Approach to Portable Ontology Specifications":
  https://tomgruber.org/writing/ontolingua-kaj-1993/
- W3C RDF 1.1 Concepts and Abstract Syntax:
  https://www.w3.org/TR/2014/REC-rdf11-concepts-20140225/
- W3C OWL 2 Web Ontology Language Overview:
  https://www.w3.org/TR/owl-overview/
- W3C SKOS Reference:
  https://www.w3.org/TR/skos-reference/

## Product Principles

### Canvas first

The first viewport starts with the work surface, not explanation cards. The
default view is:

- compact top toolbar
- focused canvas
- optional left command rail
- no right inspector until the user asks for details

### One focus concept

The Builder always has a working focus:

- if opened with `?node=...`, use that node
- otherwise use the most central project/domain anchor
- if there is no vault, show a local-vault setup state instead of the Builder

The canvas should render:

- focus node
- direct outgoing relations
- direct incoming relations
- staged changes
- optional one-hop expansion chosen by the user

It should not render the whole vault by default.

### Details on demand

Node document, backlinks, proof, graph DB packets, blast radius, and MCP handoff
move into a center sheet with tabs:

- `Document`
- `Relations`
- `Proof`
- `Agent Handoff`
- `History`

The sheet opens from node click, relation click, or the review button. It closes
back to the canvas without changing selection.

### Stage before write

Builder v2 adopts the staging design from
`2026-05-31-staging-draft-canvas-design.md` as the default model:

- edits go to a local staged-change store
- undo/redo manipulates staged operations
- autosave stores the draft locally, keyed by vault fingerprint
- `Apply` writes the batch to markdown after review
- `Discard` removes staged operations without touching the vault

No existing vault node rename, relation edit, chip edit, position drag, or delete
should silently write to disk from the canvas.

### Proof without clutter

Graph DB proof stays mandatory for write confidence, but it should be hidden
until it is useful:

- toolbar shows one compact status chip: `Graph proof: 14 checks`
- relation review sheet shows preflight and evidence
- proof packet copy lives inside the `Proof` tab
- post-change sync packet lives inside `Agent Handoff`

The proof system is preserved. The always-visible proof card is removed.

## Proposed Screen Structure

### Normal mode

```text
+---------------------------------------------------------------+
| Focus: MCP Server                2 staged     Apply  Discard  |
| [Search] [Add relation] [Add concept] [Proof OK] [Layout]     |
+-----+---------------------------------------------------------+
| Cmd |                                                         |
| rail|        Focused relation canvas                          |
|     |        - focus node                                     |
|     |        - direct incoming/outgoing nodes                  |
|     |        - staged relation previews                       |
|     |                                                         |
+-----+---------------------------------------------------------+
```

### Detail sheet

```text
+---------------------------------------------------------------+
| MCP Server                                      Close          |
| Document | Relations | Proof | Agent Handoff | History         |
+---------------------------------------------------------------+
| Focused content only. No full-vault dashboard.                 |
+---------------------------------------------------------------+
```

### Review sheet

```text
+---------------------------------------------------------------+
| Apply 3 staged changes                                         |
| 1 add relation: MCP Server -> AI Agent Partner (relates)        |
| 2 edit field: description                                      |
| 3 move node: canvasPosition                                    |
|                                                               |
| Preflight: safe_to_add / review_inverse / blocked              |
| Proof: node_profile + blast_radius + relation_check + health   |
| Agent handoff: MCP packet + CLI fallback + sync gate           |
|                                      Apply batch / Cancel      |
+---------------------------------------------------------------+
```

## Component Direction

Current large surfaces should be split by responsibility:

- `OntologyEditPage`: orchestration only; owns focus slug, staged store, and
  sheet state.
- `OntologyEditCanvas`: focused neighborhood rendering; no full-vault default.
- `OntologyInspector`: replaced by `BuilderDetailSheet`; not mounted by default.
- `RelationWriteConfirm`: becomes one tab/section in `BuilderReviewSheet`.
- `BuilderEntryAnchors`: becomes a command/search source, not a persistent rail.
- proof packet helpers stay as pure functions and move behind sheet actions.

This reduces the current default render pressure from "whole graph + all panels"
to "focused neighborhood + staged overlay".

## Performance Strategy

Builder v2 should feel native in the Tauri WebView:

- Render only focused subgraphs by default.
- Use full graph data for search, proof, and expansion, not for initial canvas
  nodes.
- Keep large proof strings out of React render until a copy action or sheet tab
  needs them.
- Virtualize any list of anchors/backlinks/history rows above 30 items.
- Persist positions only through staged apply; do not patch markdown on every
  drag.
- Run expensive graph derivations in memoized selectors keyed by manifest
  signature and focus slug.
- Keep transitions to `transition-colors` and opacity; no layout-shifting motion.

Target verification:

- opening `/ontology/edit` in the installed macOS app should show a readable
  focused canvas within the first viewport
- selecting a node should not mount a 360px permanent inspector
- 64-node sample vault should not render 64 visible Builder nodes by default
- copy packets should be generated lazily

## Agent Interaction

Builder v2 treats Claude Code / Codex as the primary operator:

- every staged batch can copy an agent handoff packet
- the packet names exact MCP calls and CLI fallbacks
- human-authored document edits appear as staged or changed nodes
- changed nodes are visually marked in the canvas and included in handoff
- after apply, the sync gate tells the agent what to re-read before planning

The UI should help the human see what changed; the packet should help the agent
act on it without scraping the screen.

## Non-Goals

- Do not build a generic mind-map editor.
- Do not show the whole graph by default in Builder.
- Do not replace `/topology` or `/ontology/insights`.
- Do not introduce backend collaboration.
- Do not claim RDF/OWL compliance unless the vault actually exports and
  validates those formats.
- Do not make proof cards permanently visible just because proof is important.

## Implementation Plan

1. Add focused Builder model selectors:
   `buildFocusedBuilderGraph(manifest, focusSlug, stagedChanges, depth)`.
2. Add `BuilderShell` layout:
   compact toolbar, command rail, canvas body, sheet host.
3. Move status cards into a compact toolbar summary and review sheet.
4. Replace default inspector with `BuilderDetailSheet`.
5. Wire staging store as the default mutation path.
6. Add review/apply/discard flow over staged changes.
7. Lazy-generate proof and agent packets inside sheet tabs.
8. Update docs/features and product direction once runtime verification passes.

## Acceptance Criteria

- macOS runtime first viewport is canvas-first at full-screen 14-inch width.
- Builder default renders a focused neighborhood, not the whole 64-node dogfood
  graph.
- There is no always-visible 4-card proof/status strip.
- No right inspector is mounted until a node/relation/detail action opens it.
- Relation creation stages first and writes only after review/apply.
- Existing frontmatter edits stage first and can be discarded.
- Review sheet includes relation preflight, graph proof, and agent handoff tabs.
- Post-apply handoff includes MCP calls, CLI fallbacks, and sync gate.
- `pnpm design:ontology`, focused unit tests, Playwright Builder smoke, desktop
  smoke, and macOS app verification all pass before the change is considered
  built.
