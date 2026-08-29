# Architecture X-ray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the diagram from the document. `/architecture` becomes a horizontal layered graph of compact role boxes with real edges between them, and everything the bands used to carry inside themselves moves to a detail panel beside it.

**Architecture:** Left to right, one column per rank, the way workflow editors draw a flow. Boxes small enough that an edge has somewhere to attach. Detail lives beside the drawing, not inside it. Layout stays entirely derived from the profile plus the measured record: no drag, no saved coordinates, no new graph engine.

**Tech Stack:** React 19 / Next 16 static export · hand-rolled SVG over a CSS grid (7 nodes; see "No layout library") · `architecture-profile/v1` and `architectureRecord:v1` · Vitest + Playwright.

**Spec:** This plan is its own spec. What it argues from, in the order the evidence arrived:

- `docs/DECISIONS.md` 2026-08-26 — Architecture is a separate reviewed contract, and **a free-layout diagram generator was rejected**. This plan is not that: nothing is hand-placed and every position is computed.
- `docs/DECISIONS.md` 2026-08-28 (2) — the fresh-eyes walkthrough that measured a reader failing to answer "what may this role reach".
- **The reverted attempt, `4553e13c8`.** Traffic arcs were drawn onto the existing full-width bands and were unreadable: every arc left and arrived at the same x, so the set collapsed into a bundle of near-parallel wires against the right edge with detached dashed fragments beside it. The cause was structural. A 250px-tall full-width block gives an edge nothing to attach to, so no amount of thinning or dimming would have rescued it. **A document and a diagram cannot be the same artifact.**
- **Measured 2026-08-28, and this is the finding that shapes the whole plan:**

  | profile | policy | permitted edges | measured traffic |
  |---|---|---:|---:|
  | FSD, 7 roles | `lower-only` | **21** | 26 rows with counts |
  | Hexagonal, 4 roles | `explicit` | **6** | none recorded |

  Under `lower-only` the permitted set is "everything below", so all 21 edges are derivable from the column order, and drawing them restates the order twenty-one times while adding nothing. Under `explicit` the permitted set **is** the information and cannot be read off the order. The original one-connector-per-gap reduction was right about `lower-only`, and turning the picture sideways does not change that.
- Owner direction, 2026-08-28: the building X-ray; a note pinned to a place; inserting between the way n8n inserts a step; **workflows are mostly horizontal**; small boxes reading as a taxonomy; not stiff.
- References for the orientation: n8n's editor is left-to-right by construction, nodes taking input on the left and emitting on the right, and its documentation frames the convention as following a reading order. React Flow recommends Dagre for hierarchical layouts and ELK for complicated ones, and in both the graph direction (left-to-right or top-to-bottom) is a first-class setting. A layered DAG with an explicit direction is the standard answer for this exact shape.

## The rule that decides every edge

Three different things have been getting mixed together. Only the third, and sometimes the second, may become a stroke.

| | What it is | Derivable? | Drawn as |
|---|---|---|---|
| **Rank** | which role sits before which | — | column position, never a stroke |
| **Permitted edges** | what may reach what | **Yes** under `lower-only`, because it is the order; **no** under `explicit` | strokes **only** under `explicit` |
| **Measured traffic** | how many imports actually crossed | **Never** | strokes whenever a record exists |

The same screen therefore draws different strokes for different profiles, and that is correct rather than inconsistent. A stroke earns its place by carrying something the column order cannot. Every drawn edge must be able to answer "why is this line here", and under `lower-only` a permitted edge has no answer.

## Global Constraints

- **Nothing is hand-placed.** Every position is computed from the profile plus the record. No drag, no persisted coordinates, no second truth.
- **No layout library.** Seven nodes, with ranks already computed by `buildArchitectureLayout`. Dagre and ELK exist to solve rank assignment and crossing minimisation at a scale this does not have, and `AGENTS.md` requires a decision record before a new renderer. Reuse the ranks, order within a column, draw. Revisit only if a real profile passes roughly fifteen roles.
- **No traffic without a record.** The web cannot scan. Without a record there are no traffic strokes, and the surface says so as it already does.
- **Dark only, achromatic plus one indigo.** No new colour, no gradient, glow, glass, or scale hover. `.claude/rules/forbidden.md`.
- **Nothing outside an `h1` at or above 23px.** Gate: `tests/e2e/screen-hierarchy.spec.ts`.
- **Quaternary ink is not licensed on a clickable row's selected state**; use tertiary. `docs/DESIGN-SYSTEM.md`, quaternary ink surface license.
- **Every user-facing string in both `messages/en.json` and `messages/ko.json`.** Never hardcode. Contributor prose, this plan included, is English.
- **No em dash in Markdown that renders in the app.** Gate: `tests/contract/em-dash-ratchet.contract.test.ts`.
- **Motion values are tokens.** Literal times in JSX style objects fail `eslint.config.mjs`.
- Verify with `pnpm checks:changed -- --run`; do not hand-pick from its list.
- **Kill the dev server before `pnpm build`.** They share `.next`; a running dev server takes the build lock and corrupts the Turbopack cache. Measured twice on 2026-08-28.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/views/architecture/model/graph-layout.ts` | **New.** Pure: layout rows, policy and record become columns, box slots, and the edges that earned a stroke |
| `src/views/architecture/model/graph-layout.test.ts` | **New.** Column assignment, within-column order, and the edge-selection rule above |
| `src/views/architecture/ui/ArchitectureGraph.tsx` | **New.** The horizontal drawing: boxes in a CSS grid, edges in one SVG measured from them |
| `src/views/architecture/ui/ArchitectureRoleDetail.tsx` | **New.** The panel: everything the band carried inside itself |
| `src/views/architecture/ui/ArchitectureFlow.tsx` | Becomes the composition of graph plus detail; the band body moves out |
| `src/views/architecture/model/traffic-layout.ts` | Kept from the reverted attempt; supplies edge weights |
| `docs/DECISIONS.md` | One record, before Task 1, because this replaces an owner-selected shape |

---

## Task 0: Record the change of shape before writing any of it

**Files:** `docs/DECISIONS.md`

This is first, not last. The band stage was direction B of an owner-chosen four, and replacing it is not a slice. The record carries: the reverted attempt and why it failed structurally; the 21-versus-6 measurement and the rule it produces; that the horizontal orientation follows the workflow-editor convention rather than taste; and the dissent below.

**Preserved dissent, to be written into the record:** the band stage is dense and scannable, and a person scanning 88 source modules is better served by a list than by a graph. The answer this plan gives is that the graph and the list are different jobs, which is what the detail panel is for. If in use the panel turns out to be where everyone actually lives, the graph is decoration and this record was wrong.

**Falsifier:** a fresh-eyes walkthrough, same protocol as 2026-08-28, asked to name which boundary carries the most traffic and whether what they are looking at is a rule or a measurement. If the reader cannot answer, or answers "a rule", the drawing has failed the way the arcs did.

- [x] **Step 1: Write the record in `docs/DECISIONS.md`, in English, appended above the most recent entry**
- [x] **Step 2: Run `pnpm decisions:check` and `pnpm docs:language`**
- [x] **Step 3: Commit**

```bash
pnpm docs-vault:build
git add docs/DECISIONS.md public/docs-vault src/entities/docs-vault/data
git commit -m "docs: record the horizontal graph, and why arcs on bands failed"
```

---

## Task 1: The layout is arithmetic

**Files:**
- Create: `src/views/architecture/model/graph-layout.ts`
- Test: `src/views/architecture/model/graph-layout.test.ts`

**Interfaces:**
- Consumes: `ArchitectureLayout` from `@/entities/architecture-profile` (`rows`, `edges`, `policy`) and `ArchitectureRoleEdge` from `@/entities/architecture-record`.
- Produces:
  ```ts
  export interface GraphBox { id: string; column: number; slot: number; }
  export interface GraphEdge {
    from: string;
    to: string;
    kind: 'permitted' | 'traffic';
    count?: number;        // traffic only
    weight?: number;       // traffic only, 0..1 against the busiest crossing
    columnSpan: number;    // columns crossed, 1 for adjacent
  }
  export interface ArchitectureGraph {
    boxes: GraphBox[];
    edges: GraphEdge[];
    columns: number;
    /** Why these strokes and not others, for the legend to state. */
    edgeSource: 'permitted' | 'traffic' | 'both' | 'none';
  }
  export function buildArchitectureGraph(
    layout: ArchitectureLayout,
    traffic: readonly ArchitectureRoleEdge[],
  ): ArchitectureGraph;
  ```

**Rules, each with its reason:**
1. **Column is the layout's row index.** Ranks are already computed by longest path to a sink; rotating them is the whole horizontal change. Do not recompute them.
2. **Permitted edges become strokes only when `layout.policy === 'explicit'`.** Under `lower-only` they restate the column order; see the table above.
3. **Traffic edges become strokes whenever the record has any, under either policy**, because a count is never derivable.
4. **Same-role traffic is excluded from `edges` entirely.** It is not a crossing and has no two ends to connect. It belongs on the box as a count, which Task 2 renders.
5. **Slot is the position within a column,** ordered by the mean slot of the boxes it connects to in the previous column, ties broken by declaration order. That is one pass of the barycentre heuristic, the same idea Dagre's crossing step repeats; one pass is plenty for columns of one or two.
6. **Deterministic.** Same inputs, same output, always.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import { buildArchitectureLayout, parseArchitectureProfile } from '@/entities/architecture-profile';
import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { buildArchitectureGraph } from './graph-layout';

const fsd = () => buildArchitectureLayout(parseArchitectureProfile(FSD_PROFILE_FRONTMATTER as never));
const hex = () => buildArchitectureLayout(parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER as never));

describe('buildArchitectureGraph', () => {
  it('puts one column per rank, left to right', () => {
    const graph = buildArchitectureGraph(fsd(), []);
    expect(graph.columns).toBe(7);
    const columnOf = new Map(graph.boxes.map((box) => [box.id, box.column]));
    expect(columnOf.get('routing')).toBe(0);
    expect(columnOf.get('shared')).toBe(6);
  });

  it('draws no permitted edges under lower-only, because the columns already say it', () => {
    /* All 21 of them mean "everything to my right". Drawing them restates the order 21 times. */
    const graph = buildArchitectureGraph(fsd(), []);
    expect(graph.edges).toEqual([]);
    expect(graph.edgeSource).toBe('none');
  });

  it('draws every permitted edge under explicit, because the order cannot say it', () => {
    const graph = buildArchitectureGraph(hex(), []);
    expect(graph.edges).toHaveLength(6);
    expect(graph.edges.every((edge) => edge.kind === 'permitted')).toBe(true);
    expect(graph.edgeSource).toBe('permitted');
    const targets = graph.edges.filter((edge) => edge.from === 'adapter').map((edge) => edge.to);
    expect(targets.sort()).toEqual(['application', 'domain', 'port']);
  });

  it('draws measured traffic under lower-only, where nothing else could carry it', () => {
    const graph = buildArchitectureGraph(fsd(), [
      { fromRole: 'widgets', toRole: 'shared', count: 314 },
      { fromRole: 'routing', toRole: 'widgets', count: 1 },
    ]);
    expect(graph.edgeSource).toBe('traffic');
    expect(graph.edges.find((e) => e.from === 'widgets' && e.to === 'shared')?.weight).toBe(1);
    expect(graph.edges.find((e) => e.from === 'routing' && e.to === 'widgets')?.weight).toBeLessThan(0.01);
  });

  it('keeps same-role traffic out of the edges, because it has no two ends', () => {
    const graph = buildArchitectureGraph(fsd(), [{ fromRole: 'views', toRole: 'views', count: 223 }]);
    expect(graph.edges).toEqual([]);
  });

  it('counts columns crossed, so a long reach is drawn as a long reach', () => {
    const graph = buildArchitectureGraph(hex(), []);
    expect(graph.edges.find((e) => e.from === 'adapter' && e.to === 'domain')?.columnSpan).toBe(3);
  });

  it('is deterministic', () => {
    expect(buildArchitectureGraph(hex(), [])).toEqual(buildArchitectureGraph(hex(), []));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run src/views/architecture/model/graph-layout.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement, following the six rules above**
- [ ] **Step 4: Run the tests, expect PASS**
- [ ] **Step 5: Commit**

```bash
git add src/views/architecture/model/graph-layout.ts src/views/architecture/model/graph-layout.test.ts
git commit -m "feat: the architecture graph is columns, and only non-derivable edges"
```

---

## Task 2: The drawing

**Files:**
- Create: `src/views/architecture/ui/ArchitectureGraph.tsx`
- Test: `src/views/architecture/ui/ArchitectureWorkbench.test.tsx`

**Interfaces:** consumes `ArchitectureGraph` from Task 1 plus label and count formatters; produces `<ArchitectureGraph graph={...} selected={id | null} onSelect={(id) => void} ... />`.

**The box.** Compact: role icon, role name, and two counts (modules, concepts). One further line at most. This is the point of the rewrite, a box an edge can attach to. Target roughly 64px tall and 160px wide, so seven of them plus gaps fit a 1100px stage without horizontal scrolling.

**The edges.** One SVG behind the boxes, measured from their rendered rects through the same offset-chain walk the concept layer uses, and reading its container from **its own node's `parentElement`** rather than from a parent ref: React attaches a parent's ref in the same bottom-up commit pass that runs a child's layout effect, so the parent-ref shape reads null on first paint. An edge leaves the right side of its source box and enters the left side of its target. That is what makes a horizontal flow legible, and it is exactly what the reverted arcs lacked.

**Thickness applies only to traffic edges**, 1px to 4px across the measured range. Permitted edges are a uniform 1.5px with an arrowhead: a rule has no magnitude.

**Every edge states itself in words** in an `sr-only` list, and the legend names what the strokes mean for this profile, driven by `edgeSource`. The 2026-08-28 walkthrough found a rule that lived only in the accessibility tree; a number living only in a drawing is the same defect facing the other way.

- [ ] **Step 1: Write the failing test.** Assert: seven boxes render; under `explicit`, six strokes carry `data-edge-kind="permitted"`; under `lower-only` with a record the strokes carry `data-edge-kind="traffic"` and widgets-to-shared is thicker than routing-to-widgets; with no record, no SVG renders.
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run `pnpm exec vitest run src/views/architecture && pnpm exec tsc --noEmit && pnpm lint`**
- [ ] **Step 5: Commit**

---

## Task 3: The detail panel takes what the band was carrying

**Files:**
- Create: `src/views/architecture/ui/ArchitectureRoleDetail.tsx`
- Modify: `src/views/architecture/ui/ArchitectureFlow.tsx`

Everything currently inside a band moves here unchanged in content: the role sentence, the reach sentence, the globs, the source module cards with their preview and expansion, and the reviewed-concept section. Selecting a box fills the panel; with nothing selected it shows the profile-level summary the stage header carries today.

**This is where the density the bands were good at survives.** The graph answers what the shape is and where the traffic goes; the panel answers what is actually in this layer. Losing the second would trade one failure for another.

- [ ] **Step 1: Write the failing test.** Selecting a box shows that role's sentence, glob, module count and concept count; selecting another replaces them; selecting none shows the profile summary.
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Move the band body into the panel and delete the band shape**
- [ ] **Step 4: Run the architecture suite plus `pnpm exec tsc --noEmit` and `pnpm lint`**
- [ ] **Step 5: Commit**

---

## Task 4: Prove it on the installed app

- [ ] **Step 1: Build and install**

```bash
pkill -f "next dev" ; sleep 2
pnpm build && pnpm desktop:build:app:local && pnpm desktop:sign:adhoc
pnpm desktop:deploy:app -- --skip-build --route=/ko/architecture/ --hold-ms=6000
```

- [ ] **Step 2: Launch with this repository's vault and its record, and read the screenshot back**

```bash
node cli/src/index.mjs architecture . --vault docs/ontology --profile atlas-web --record
pnpm desktop:verify-app -- "/Applications/Ontology Atlas.app" --kill-existing \
  --webview-fixture-vault=docs/ontology --hold-ms=14000 --require-window \
  --require-owner-name="Ontology Atlas" --min-window-size=1360x840 \
  --require-webview-route=/ko/architecture/ --try-window-screenshot=.tmp/graph.png --leave-running
```

Seven boxes must sit in one horizontal run with no horizontal scrolling at 1512, and every stroke must visibly leave one box and enter another. **If a stroke is ambiguous about which boxes it joins, stop. That is the failure that killed the arcs.**

- [ ] **Step 3: Run the gates**

```bash
pnpm checks:changed -- --run
nohup pnpm dev -p 3121 >/dev/null 2>&1 &   # after the build, never during
PLAYWRIGHT_BASE_URL=http://localhost:3121 pnpm exec playwright test \
  tests/e2e/screen-hierarchy.spec.ts tests/e2e/responsive-overflow-audit.spec.ts --project=post-merge --workers=1
PLAYWRIGHT_BASE_URL=http://localhost:3121 pnpm exec playwright test \
  tests/e2e/contrast-ratchet.spec.ts tests/e2e/a11y-ratchet.spec.ts tests/e2e/a11y-open-surfaces.spec.ts --project=smoke --workers=1
```

- [ ] **Step 4: Update `docs/FEATURES.md` and `docs/ARCHITECTURE.md`, commit, push**

---

## Task 5: Walk it with fresh eyes, and let the answer decide

- [ ] **Step 1: Dispatch a walker** held to "has never heard of this pattern", forbidden from reading any repository file, given only the URL. Task sentence: **"Which boundary carries the most traffic, which carries the least, and is what you are looking at a rule or a measurement?"**
- [ ] **Step 2: Record the answer in `docs/DECISIONS.md`.** Cannot answer, or answers "a rule": the falsifier fired and the strokes come out the way the arcs did. Answers correctly: Phase 2 is licensed.

---

## Phase 2 and 3, unchanged in intent, blocked on Task 5

**Phase 2, a note pinned to a place.** `note_<role id>` in the profile, parsed by both surfaces under the cross-surface contract, rendered on the box's detail panel, written through the reviewed MCP path so it lands as a Git diff a person judges. Kept separate from `summary_<id>` because the two have different lifetimes: a summary is what the role is for, a note is what someone should know about it right now, and folding them makes one field nobody knows whether to trust.

**Phase 3, inserting between.** An MCP tool that edits `role_order`, adds `role_<id>` globs, and reports every `allow_*` rule the insertion forces a choice about, refusing to write until the caller states each one. **The tool must not choose**: silently rewriting allow rules would be inventing architecture. In the graph, the affordance is a control in the gap between two columns that copies the exact call, never a button that writes, for the same reason the source-check pill is a sentence and not a scan button.

---

## Self-review notes

**Coverage.** Horizontal orientation, compact boxes reading as a taxonomy, real edges between them, detail beside rather than inside, notes, insertion. The one owner request not addressed is 3D, deliberately: nothing measured so far needs a third axis, and depth with no fact to encode is decoration.

**What this plan throws away.** The band stage, which the owner chose from four directions on 2026-08-27 and which is one day old. Task 0 exists so that is a recorded decision with a preserved dissent rather than a quiet replacement.

**The riskiest assumption**, and Task 5 exists to kill it: that a compact box with an attached edge reads as a flow to someone who has never seen this screen. The reverted attempt is the evidence that assuming legibility is exactly how this goes wrong.
