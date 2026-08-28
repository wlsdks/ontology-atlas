# Architecture X-ray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/architecture` from a list of layers into an X-ray of the building: the traffic between layers is drawn, a person can pin a note to a place in it, and a role can be inserted between two roles by editing the reviewed contract.

**Architecture:** Every mark stays derived. Nobody drags a box. The traffic already exists as measured data — `conformance.observedRoleEdges` in the persisted record, 26 rows with counts, verified present on 2026-08-28 — and the surface currently throws it away. Phase 1 draws it and needs no contract change. Phase 2 adds one authored field so a note can hang on a place. Phase 3 edits the profile document, which is Markdown in Git, so an insertion is a diff a person reviews.

**Tech Stack:** React 19 / Next 16 static export · SVG for the traffic overlay (7 nodes, no engine, measurable by the repo's own rect gates) · `architecture-profile/v1` and `architectureRecord:v1` Markdown/JSON contracts · Vitest + Playwright.

**Spec:** This plan is its own spec. The evidence it argues from:
- `docs/DECISIONS.md` 2026-08-26 — Architecture is a separate reviewed contract; **a free-layout diagram generator was rejected**. A *derived* layout is not that rejected thing; a human dragging boxes is.
- `docs/DECISIONS.md` 2026-08-28 (2) — the walkthrough that measured a reader failing to answer "what may this role reach", and the preserved dissent that arrow-per-permitted-pair was already refused once in code.
- Measured 2026-08-28 on this repository: `widgets→shared 314`, `views→shared 260`, `views→views 223`, `routing→widgets 1`. 26 role-edge rows, `violationCount 0`, `typeOnlyEdgeCount 382`, `unmappedEdges 77`.
- Owner direction, 2026-08-28: "it is like showing a building's design in 2D or 3D, an X-ray"; notes pinned to a place; inserting between, the way n8n inserts a node between steps; flow first; not stiff.

## Global Constraints

- **Nothing is hand-placed.** Every position and every stroke is computed from the profile plus the measured record. No drag, no saved coordinates, no second truth.
- **No traffic without a record.** The web cannot scan. Where no record exists the stage keeps exactly today's picture and today's amber pill. A drawn edge always has a measurement behind it.
- **Dark only, achromatic plus one indigo.** No new colour. No gradient, glow, glassmorphism, or scale hover. See `.claude/rules/forbidden.md`.
- **Nothing outside an `h1` may render at or above 23px** (`--text-display`). Gate: `tests/e2e/screen-hierarchy.spec.ts`.
- **Quaternary ink is not licensed on a clickable row's selected state.** Use tertiary from rows that can be clicked (`docs/DESIGN-SYSTEM.md`, quaternary ink surface license).
- **Every user-facing string goes in both `messages/en.json` and `messages/ko.json`.** Never hardcode.
- **No em dash in Markdown that renders in the app.** Gate: `tests/contract/em-dash-ratchet.contract.test.ts`.
- **Decision records are English.** Gate: `pnpm docs:language` historical Hangul ratchet.
- **Motion values are tokens.** Literal times in JSX style objects fail the gate in `eslint.config.mjs`.
- **A schema change is a cross-surface contract change**: web parser, MCP parser, and `tests/fixtures/architecture-profile-cases.mjs` move together.
- Verify with `pnpm checks:changed -- --run`. Do not hand-pick from its list.
- **Kill the dev server before `pnpm build`.** They share `.next` and a running dev server both takes the build lock and corrupts the Turbopack cache. Measured twice on 2026-08-28.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/entities/architecture-record/model/architecture-record.ts` | Declare and validate `conformance.observedRoleEdges` in the record type (already persisted, currently undeclared) |
| `src/views/architecture/model/traffic-layout.ts` | **New.** Pure: role edges + row order → drawable arcs. No React, no DOM |
| `src/views/architecture/model/traffic-layout.test.ts` | **New.** The arithmetic, including the same-role and skip cases |
| `src/views/architecture/ui/ArchitectureTrafficLayer.tsx` | **New.** SVG overlay measured from the rendered band rects |
| `src/views/architecture/ui/ArchitectureFlow.tsx` | Host the overlay; pass the record's edges down |
| `src/views/architecture/ui/ArchitectureWorkbench.tsx` | Legend for the new marks; thread `record` into the flow |
| `src/entities/architecture-profile/model/architecture-profile.ts` | Phase 2: parse `note_<role id>` |
| `mcp/src/architecture-profile.mjs` | Phase 2: mirror it |
| `tests/fixtures/architecture-profile-cases.mjs` | Phase 2: one fixture carrying a note |
| `docs/DECISIONS.md` | One record per phase |

---

## Phase 1 — The traffic is drawn

### Task 1: The record type admits the traffic it already carries

**Files:**
- Modify: `src/entities/architecture-record/model/architecture-record.ts` (the `ArchitectureRecordConformance` interface, around line 26, and its validator)
- Test: `src/entities/architecture-record/model/architecture-record.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface ArchitectureRoleEdge {
    fromRole: string;
    toRole: string;
    count: number;
  }
  ```
  and `ArchitectureRecordConformance.observedRoleEdges?: ArchitectureRoleEdge[]`.

**Why optional:** records written before today parse without it, and the drawing simply has nothing to draw. Verified 2026-08-28: a record written by `atlas architecture --record` already contains 26 such rows, each also carrying an `evidence` array the drawing does not need. Parse the three fields and ignore the rest, so the record stays free to grow.

- [ ] **Step 1: Write the failing test**

```ts
it('reads the role edges a record already carries, and tolerates their absence', () => {
  const withEdges = parseArchitectureRecord({
    ...validRecordFixture(),
    brief: {
      ...validRecordFixture().brief,
      conformance: {
        ...validRecordFixture().brief.conformance,
        observedRoleEdges: [
          { fromRole: 'views', toRole: 'shared', count: 260, evidence: [{ from: 'a', to: 'b' }] },
          { fromRole: 'routing', toRole: 'widgets', count: 1 },
        ],
      },
    },
  });
  expect(withEdges.brief.conformance.observedRoleEdges).toEqual([
    { fromRole: 'views', toRole: 'shared', count: 260 },
    { fromRole: 'routing', toRole: 'widgets', count: 1 },
  ]);

  const withoutEdges = parseArchitectureRecord(validRecordFixture());
  expect(withoutEdges.brief.conformance.observedRoleEdges).toBeUndefined();
});

it('refuses a role edge whose count is not a count', () => {
  expect(() =>
    parseArchitectureRecord({
      ...validRecordFixture(),
      brief: {
        ...validRecordFixture().brief,
        conformance: {
          ...validRecordFixture().brief.conformance,
          observedRoleEdges: [{ fromRole: 'views', toRole: 'shared', count: -1 }],
        },
      },
    }),
  ).toThrow(/observedRoleEdges/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run src/entities/architecture-record`
Expected: FAIL, `observedRoleEdges` is `undefined` on the first case because nothing parses it.

- [ ] **Step 3: Parse it**

Add beside the existing `countOf` validations:

```ts
export interface ArchitectureRoleEdge {
  fromRole: string;
  toRole: string;
  count: number;
}

function roleEdgesOf(value: unknown, name: string): ArchitectureRoleEdge[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(`${name} must be an array.`);
  return value.map((row, index) => {
    const edge = asObject(row, `${name}[${index}]`);
    return {
      fromRole: nonBlank(edge.fromRole, `${name}[${index}].fromRole`),
      toRole: nonBlank(edge.toRole, `${name}[${index}].toRole`),
      count: countOf(edge.count, `${name}[${index}].count`),
    };
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/entities/architecture-record tests/contract/architecture-record.contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/architecture-record
git commit -m "feat: the record type admits the role traffic it already stores"
```

---

### Task 2: The arcs are arithmetic, not a drawing

**Files:**
- Create: `src/views/architecture/model/traffic-layout.ts`
- Test: `src/views/architecture/model/traffic-layout.test.ts`

**Interfaces:**
- Consumes: `ArchitectureRoleEdge` from Task 1; `rows: string[][]` from `buildArchitectureLayout` (`src/entities/architecture-profile`).
- Produces:
  ```ts
  export interface TrafficArc {
    from: string;          // role id
    to: string;            // role id
    count: number;
    rowSpan: number;       // rows crossed, 1 for adjacent
    weight: number;        // 0..1, count relative to the busiest crossing edge
    sameRole: boolean;     // from === to
  }
  export function buildTrafficArcs(
    edges: readonly ArchitectureRoleEdge[],
    rows: readonly (readonly string[])[],
  ): TrafficArc[];
  ```

**Rules this function encodes, each with its reason:**
1. **Same-role edges are kept but flagged, not ranked.** `views→views 223` and `widgets→widgets 240` are three of the top four counts and can never be a boundary crossing. Letting them set the scale would make every real crossing look thin. `weight` is computed over crossing edges only; a same-role arc gets `weight: 0`.
2. **`rowSpan` is rows crossed, from the layout's own row index.** The rows are ordered by longest-path reach depth, so every declared dependency points down; an arc's span is how many floors the traffic drops.
3. **An edge naming a role that is not in `rows` is dropped.** A record can outlive a profile edit.
4. **Deterministic order:** sort by `rowSpan` descending, then `count` descending, then `from`, then `to`, so the same data always draws the same picture and long arcs are painted under short ones.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildTrafficArcs } from './traffic-layout';

const ROWS = [['routing'], ['app'], ['views'], ['widgets'], ['features'], ['entities'], ['shared']];

describe('buildTrafficArcs', () => {
  it('weighs crossings against the busiest crossing, not against same-role traffic', () => {
    const arcs = buildTrafficArcs(
      [
        { fromRole: 'widgets', toRole: 'shared', count: 314 },
        { fromRole: 'routing', toRole: 'widgets', count: 1 },
        { fromRole: 'views', toRole: 'views', count: 223 },
      ],
      ROWS,
    );
    const byPair = new Map(arcs.map((a) => [`${a.from}>${a.to}`, a]));
    expect(byPair.get('widgets>shared')!.weight).toBe(1);
    expect(byPair.get('routing>widgets')!.weight).toBeCloseTo(1 / 314, 5);
    expect(byPair.get('views>views')!.sameRole).toBe(true);
    expect(byPair.get('views>views')!.weight).toBe(0);
  });

  it('counts rows crossed, so a skip reads as a longer drop', () => {
    const arcs = buildTrafficArcs(
      [
        { fromRole: 'routing', toRole: 'app', count: 1 },
        { fromRole: 'routing', toRole: 'shared', count: 45 },
      ],
      ROWS,
    );
    const byPair = new Map(arcs.map((a) => [`${a.from}>${a.to}`, a]));
    expect(byPair.get('routing>app')!.rowSpan).toBe(1);
    expect(byPair.get('routing>shared')!.rowSpan).toBe(6);
  });

  it('drops an edge naming a role the profile no longer has', () => {
    const arcs = buildTrafficArcs([{ fromRole: 'views', toRole: 'gone', count: 9 }], ROWS);
    expect(arcs).toEqual([]);
  });

  it('draws the same picture twice from the same data', () => {
    const edges = [
      { fromRole: 'views', toRole: 'shared', count: 260 },
      { fromRole: 'widgets', toRole: 'shared', count: 314 },
      { fromRole: 'routing', toRole: 'views', count: 20 },
    ];
    expect(buildTrafficArcs(edges, ROWS)).toEqual(buildTrafficArcs([...edges].reverse(), ROWS));
  });

  it('has nothing to draw without a record', () => {
    expect(buildTrafficArcs([], ROWS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run src/views/architecture/model/traffic-layout.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write it**

```ts
import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

export interface TrafficArc {
  from: string;
  to: string;
  count: number;
  rowSpan: number;
  weight: number;
  sameRole: boolean;
}

export function buildTrafficArcs(
  edges: readonly ArchitectureRoleEdge[],
  rows: readonly (readonly string[])[],
): TrafficArc[] {
  const rowOf = new Map<string, number>();
  rows.forEach((row, index) => row.forEach((id) => rowOf.set(id, index)));

  const placed = edges.filter(
    (edge) => rowOf.has(edge.fromRole) && rowOf.has(edge.toRole),
  );
  /* The scale comes from crossings only. Same-role traffic is the largest number on this
     repository and can never be a boundary crossing, so ranking by it would flatten every
     real crossing to a hairline. */
  const busiestCrossing = placed
    .filter((edge) => edge.fromRole !== edge.toRole)
    .reduce((most, edge) => Math.max(most, edge.count), 0);

  return placed
    .map((edge) => {
      const sameRole = edge.fromRole === edge.toRole;
      return {
        from: edge.fromRole,
        to: edge.toRole,
        count: edge.count,
        rowSpan: Math.abs((rowOf.get(edge.toRole) ?? 0) - (rowOf.get(edge.fromRole) ?? 0)),
        weight: sameRole || busiestCrossing === 0 ? 0 : edge.count / busiestCrossing,
        sameRole,
      };
    })
    .sort(
      (a, b) =>
        b.rowSpan - a.rowSpan ||
        b.count - a.count ||
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to),
    );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/views/architecture/model/traffic-layout.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/architecture/model/traffic-layout.ts src/views/architecture/model/traffic-layout.test.ts
git commit -m "feat: role traffic becomes arcs, weighed against crossings only"
```

---

### Task 3: The overlay draws the arcs from the rendered bands

**Files:**
- Create: `src/views/architecture/ui/ArchitectureTrafficLayer.tsx`
- Modify: `src/views/architecture/ui/ArchitectureFlow.tsx` (host the layer inside the stage, beside the existing `ConceptEdgeLayer` around line 912)

**Interfaces:**
- Consumes: `TrafficArc[]` from Task 2; the stage container ref `ArchitectureFlow` already holds (`stageRef`).
- Produces: a component
  ```tsx
  function ArchitectureTrafficLayer(props: {
    arcs: readonly TrafficArc[];
    containerRef: React.RefObject<HTMLDivElement | null>;
    refreshKey: string;
  }): JSX.Element | null;
  ```

**Read `ConceptEdgeLayer` in the same file first and copy its measurement idiom** — it already measures rendered cards through offset chains that ignore entrance transforms, and it already re-measures on a `refreshKey`. The traffic layer measures band elements instead: `[data-testid^="architecture-rung-"]`.

**Drawing rules, each with its reason:**
- **Arcs bow to the right of the spine**, so the existing downward connectors and the concept strokes keep the centre. An arc from row *i* to row *j* is a quadratic curve whose control point sits `24 + rowSpan * 18` px right of the band's right edge: a longer drop bows wider, which is what makes a skip visible as a skip.
- **Stroke width is `1 + weight * 3`**, so `widgets→shared` is 4px and `routing→widgets` is a hairline. Thickness is the coupling.
- **Same-role arcs are a short loop at the band's right edge**, drawn at 1px in the dashed style the legend already uses for `relates`. They are traffic, they are always allowed, and they must not read as a crossing.
- **`aria-hidden` on the svg.** The numbers reach assistive technology through the existing `sr-only` list, which Task 4 extends. A decorative duplicate would be noise.
- **No animation on mount.** The stage already spends its entrance budget on the band cascade; a second moving thing on the same frame is the "two elements spawned by one input" defect the design system names.

- [ ] **Step 1: Write the failing test**

```tsx
it('draws one stroke per measured crossing, thickest where the traffic is heaviest', () => {
  renderWorkbench({ recordsByProfile: { 'atlas-web': recordWithTraffic() } });
  const layer = screen.getByTestId('architecture-traffic');
  const strokes = [...layer.querySelectorAll('path[data-traffic-from]')];
  expect(strokes.length).toBeGreaterThan(0);
  const heaviest = strokes.find(
    (p) => p.getAttribute('data-traffic-from') === 'widgets' && p.getAttribute('data-traffic-to') === 'shared',
  )!;
  const lightest = strokes.find(
    (p) => p.getAttribute('data-traffic-from') === 'routing' && p.getAttribute('data-traffic-to') === 'widgets',
  )!;
  expect(parseFloat(heaviest.getAttribute('stroke-width')!)).toBeGreaterThan(
    parseFloat(lightest.getAttribute('stroke-width')!),
  );
});

it('draws nothing at all without a record', () => {
  renderWorkbench();
  expect(screen.queryByTestId('architecture-traffic')).toBeNull();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run src/views/architecture/ui/ArchitectureWorkbench.test.tsx`
Expected: FAIL, no `architecture-traffic` testid.

- [ ] **Step 3: Write the layer and mount it**

Follow `ConceptEdgeLayer`'s structure exactly: a `useLayoutEffect` that measures on `refreshKey`, state holding computed geometry, and an absolutely positioned `<svg aria-hidden className="pointer-events-none absolute inset-0">`. Give each path `data-traffic-from`, `data-traffic-to`, and `data-traffic-count`, so the gate can assert on facts rather than pixels.

In `ArchitectureFlow`, derive the arcs beside the existing `conceptEdges` memo and mount the layer next to `ConceptEdgeLayer`:

```tsx
const trafficArcs = useMemo(
  () => buildTrafficArcs(record?.brief.conformance.observedRoleEdges ?? [], layout.rows),
  [record, layout.rows],
);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/views/architecture && pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS, clean, clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/architecture
git commit -m "feat: the stage draws the traffic between layers, thickness for coupling"
```

---

### Task 4: The numbers are stated, not only drawn

**Files:**
- Modify: `src/views/architecture/ui/ArchitectureFlow.tsx` (the `sr-only` list around line 1060, and the legend around line 1000)
- Modify: `messages/en.json`, `messages/ko.json`
- Test: `src/views/architecture/ui/ArchitectureWorkbench.test.tsx`

**Why this task exists and is not optional:** the 2026-08-28 walkthrough's headline finding was a rule that lived only in the accessibility tree. Shipping the mirror image of that defect, a rule that lives only in the drawing, would be the same mistake pointed the other way. Every arc states its count in words, and the legend says what thickness means.

**New strings:**
- `trafficLegend` — en: `Line thickness is how many imports cross that boundary.` ko: `선의 굵기는 그 경계를 지나는 import 수입니다.`
- `trafficCount` — en: `{from} reaches {to} in {count, plural, one {# import} other {# imports}}` ko: `{from} 에서 {to} 로 가는 import {count}개`
- `trafficSameRole` — en: `{role} references itself in {count, plural, one {# import} other {# imports}}` ko: `{role} 안에서 서로 참조하는 import {count}개`

- [ ] **Step 1: Write the failing test**

```tsx
it('states every drawn crossing in words, and says what thickness means', () => {
  renderWorkbench({ recordsByProfile: { 'atlas-web': recordWithTraffic() } });
  expect(screen.getByText('Widgets reaches Shared foundation in 314 imports')).toBeInTheDocument();
  expect(screen.getByText('Views references itself in 223 imports')).toBeInTheDocument();
  expect(
    screen.getByText('Line thickness is how many imports cross that boundary.'),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run src/views/architecture/ui/ArchitectureWorkbench.test.tsx`
Expected: FAIL, text not found.

- [ ] **Step 3: Add the sentences**

Extend the existing `sr-only` `<ol>` with one `<li>` per arc, and add the legend row beside the two stroke rows already there. The legend rows only render when something is drawn, exactly as the existing stroke rows do.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/views/architecture && pnpm exec vitest run tests/contract/user-facing-vocabulary.contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/architecture messages
git commit -m "feat: every drawn crossing says its own number"
```

---

### Task 5: Prove it on the installed app, and record the decision

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/FEATURES.md`
- Run: the gates

- [ ] **Step 1: Rebuild and install**

```bash
pkill -f "next dev" ; sleep 2
pnpm build && pnpm desktop:build:app:local && pnpm desktop:sign:adhoc
pnpm desktop:deploy:app -- --skip-build --route=/ko/architecture/ --hold-ms=6000
```

- [ ] **Step 2: Launch with this repository's own vault and its record**

```bash
node cli/src/index.mjs architecture . --vault docs/ontology --profile atlas-web --record
pnpm desktop:verify-app -- "/Applications/Ontology Atlas.app" --kill-existing \
  --webview-fixture-vault=docs/ontology --hold-ms=14000 --require-window \
  --require-owner-name="Ontology Atlas" --min-window-size=1360x840 \
  --require-webview-route=/ko/architecture/ --try-window-screenshot=.tmp/xray.png --leave-running
```

Read `.tmp/xray.png` back. The `widgets→shared` arc must be visibly the thickest and `routing→widgets` visibly the thinnest.

- [ ] **Step 3: Run the gates**

```bash
pnpm checks:changed -- --run
nohup pnpm dev -p 3121 >/dev/null 2>&1 &  # after the build, never during
PLAYWRIGHT_BASE_URL=http://localhost:3121 pnpm exec playwright test \
  tests/e2e/screen-hierarchy.spec.ts tests/e2e/responsive-overflow-audit.spec.ts --project=post-merge --workers=1
PLAYWRIGHT_BASE_URL=http://localhost:3121 pnpm exec playwright test \
  tests/e2e/contrast-ratchet.spec.ts tests/e2e/a11y-ratchet.spec.ts tests/e2e/a11y-open-surfaces.spec.ts --project=smoke --workers=1
```

- [ ] **Step 4: Append the decision record**

English, with: the trigger (owner's X-ray direction); the observation (26 measured role-edge rows already persisted and discarded by the surface); the decision; the preserved dissent (arrow-per-permitted-pair was refused once, and this is not that: these are measured crossings with counts, not a restatement of the declared policy); and the falsifier — **if a reader mistakes a thick arc for a rule rather than a measurement, the drawing is lying about its own status and the thickness must go.**

- [ ] **Step 5: Commit and push**

```bash
git add docs src
git commit -m "docs: record the traffic X-ray decision and its falsifier"
git push
```

---

### Task 6: Walk it again with fresh eyes

**Files:** none. This is the measurement, not a change.

- [ ] **Step 1: Dispatch a fresh walker**

Same protocol as 2026-08-28: an agent held to "has never heard of this pattern", forbidden from reading any repository file, given only the URL. New task sentence: **"Which boundary in this system carries the most traffic, and which carries the least? And is that traffic a rule or a measurement?"**

- [ ] **Step 2: Record the answer in `docs/DECISIONS.md`**

If the walker reads thickness as a rule, the falsifier fired: remove thickness, keep the count labels, and stop. If it reads it as a measurement, Phase 2 is licensed.

---

## Phase 2 — A note can be pinned to a place

> **Do not start Phase 2 until Task 6 has been run and recorded.** Phase 1 is the thing that makes a note have somewhere to point.

### Task 7: A role carries a note, and the note is authored data

**Files:**
- Modify: `src/entities/architecture-profile/model/architecture-profile.ts`
- Modify: `mcp/src/architecture-profile.mjs`
- Modify: `tests/fixtures/architecture-profile-cases.mjs`
- Test: `tests/contract/architecture-profile.contract.test.ts`

**Interfaces:**
- Produces: `ArchitectureRole.note?: string`, parsed from `note_<role id>`.

**Why a second field beside `summary_<id>` rather than reusing it:** `summary` answers "what is this role for" and belongs to whoever reviewed the contract. A note answers "what should the next person know about this place right now" and is expected to churn. Folding them would make one field with two lifetimes, and the first thing anyone would ask is which half to trust.

Follow the `summary_<id>` implementation added on 2026-08-28 exactly: `note_<id>`, never `role_note_<id>`, because every `role_*` key is a path group. Reject a note naming a role that does not exist. Absent, not empty, where none was written. Both parsers, one fixture table, deep-equal contract.

- [ ] **Step 1: Write the failing contract test**

```ts
it.each([
  ['web', parseWebProfile],
  ['mcp', parseMcpProfile],
])('%s reads a role note, and silence where none was written', (_surface, parse) => {
  const profile = parse({ ...FSD_PROFILE_FRONTMATTER, note_views: 'Two views still import widgets directly; see PR 1286.' });
  const byId = new Map(profile.roles.map((role) => [role.id, role.note]));
  expect(byId.get('views')).toBe('Two views still import widgets directly; see PR 1286.');
  expect(byId.get('shared')).toBeUndefined();
});

it.each([
  ['web', parseWebProfile],
  ['mcp', parseMcpProfile],
])('%s refuses a note for a role that does not exist', (_surface, parse) => {
  expect(() => parse({ ...FSD_PROFILE_FRONTMATTER, note_nowhere: 'x' })).toThrow(/note_nowhere/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run tests/contract/architecture-profile.contract.test.ts`
Expected: FAIL, `note` is undefined on `views`.

- [ ] **Step 3: Parse it in both surfaces**

Mirror the `summary_` blocks in both files, including the "describes a role that does not exist" refusal.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/contract/architecture-profile.contract.test.ts && cd mcp && pnpm exec node --test src/architecture-profile.test.mjs`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
git add src/entities/architecture-profile mcp/src/architecture-profile.mjs tests
git commit -m "feat: a role carries a note, in both parsers"
```

---

### Task 8: The note is visible where it points, and says it is a note

**Files:**
- Modify: `src/views/architecture/ui/ArchitectureFlow.tsx`
- Modify: `messages/en.json`, `messages/ko.json`
- Test: `src/views/architecture/ui/ArchitectureWorkbench.test.tsx`

A note renders under the role's sentence, marked as a note rather than as contract prose, because the two have different lifetimes and a reader must be able to tell which one they are reading. Use the existing caption step and tertiary ink; no new colour, no callout box.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows a role note under its sentence, marked as a note', () => {
  renderWorkbench({ profiles: [profileWithNote()] });
  const note = screen.getByTestId('architecture-role-note-views');
  expect(note).toHaveTextContent('Two views still import widgets directly');
  expect(note).toHaveTextContent('Note');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run src/views/architecture/ui/ArchitectureWorkbench.test.tsx`
Expected: FAIL, no such testid.

- [ ] **Step 3: Render it**

Add the string `roleNoteLabel` (en `Note`, ko `메모`) to both catalogues and render it as a prefix.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/views/architecture && pnpm lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/architecture messages
git commit -m "feat: a role note renders where the role is"
```

---

### Task 9: Writing a note is a diff a person reviews

**Files:**
- Modify: `mcp/src/index.js` (extend the existing architecture write path, or add `set_role_note` beside it)
- Modify: `mcp/README.md`, `cli/README.md`
- Modify: `docs/DECISIONS.md`

The note is written through the same reviewed path everything else uses: an agent proposes, the file changes, Git shows the diff, a person judges. There is no in-app free-text store, because that would be the second truth the charter forbids.

- [ ] **Step 1: Write the failing test**

Follow the shape of the existing MCP write tests in `mcp/src/integration.test.mjs`: call the tool against a temp vault, then re-read the file and assert the frontmatter key landed and nothing else moved.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement, mirroring the existing `patch_concept` guard rails, including `expected_mtime`**
- [ ] **Step 4: Run `cd mcp && pnpm exec node --test src/integration.test.mjs`**
- [ ] **Step 5: Commit**

---

## Phase 3 — A role can be inserted between two roles

> **Do not start Phase 3 until Phase 2 has shipped and a note has actually been written by an agent at least once.** Insertion is the expensive one and it should be earned.

**What this is and is not.** In n8n you insert a step into a flow and the flow changes. Here the analogue is inserting a *role* between two roles, which means editing `role_order`, adding `role_<id>` globs, and moving the allow rules that pointed past the new floor. That is an edit to a reviewed contract in Markdown, reviewed as a diff. It is **not** the free-layout diagram generator rejected on 2026-08-26: nobody positions anything, and the drawing after the edit is still fully derived from the file.

### Task 10: Inserting a role is one reviewed edit, dry-run first

**Files:**
- Modify: `mcp/src/index.js`
- Test: `mcp/src/integration.test.mjs`

**Interfaces:**
- Produces: an MCP tool taking `{ profileSlug, roleId, paths, after, summary?, confirm? }` and returning, without `confirm`, the exact frontmatter diff it would write plus every allow rule that would have to move.

**The hard part, stated so nobody discovers it late:** under `explicit` policy, inserting a role between A and B does not just add a line. Every `allow_*` that named B from above now has a choice: keep reaching B directly, or go through the new role. **The tool must not choose.** It reports the affected rules and refuses to write until the caller states each one. A tool that silently rewrote allow rules would be inventing architecture, which is the one thing this product refuses to do.

- [ ] **Step 1: Write the failing test**

```js
test('insert_architecture_role reports the rules it cannot decide, and writes nothing', async () => {
  const result = await callTool('insert_architecture_role', {
    profileSlug: 'payments-core',
    roleId: 'gateway',
    paths: ['src/payments/gateway/**'],
    after: 'adapter',
  });
  assert.equal(result.wrote, false);
  assert.deepEqual(result.undecidedRules.map((r) => r.key).sort(), ['allow_adapter']);
  assert.match(result.reason, /states each affected rule/);
});
```

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement the dry run, then the confirmed write**
- [ ] **Step 4: Run the MCP integration tests**
- [ ] **Step 5: Commit**

### Task 11: The stage offers the insertion where the gap is

**Files:**
- Modify: `src/views/architecture/ui/ArchitectureFlow.tsx`
- Modify: `messages/en.json`, `messages/ko.json`

A control in the connector gap between two bands, appearing on hover and focus, that copies the exact `insert_architecture_role` call for the agent. **Not a button that writes**: the web cannot write the vault, and the installed app writes only through the reviewed path. This is the same honesty rule that made the source-check pill a sentence instead of a scan button.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the gates, including `tests/e2e/screen-hierarchy.spec.ts`**
- [ ] **Step 5: Commit**

---

## Self-review notes

**Coverage.** Owner asked for four things. Flow representation is Phase 1 (Tasks 1 to 6). X-ray, meaning "see what passes between floors", is the same phase: the arcs are the pipes and thickness is the load. Notes pinned to a place are Phase 2. Insertion between, the n8n move, is Phase 3. "Not stiff" is served by drawing rather than tabulating, and by the arcs bowing rather than forming a grid; it is not served by decoration, and no task adds any.

**What this plan deliberately does not do.** It does not replace the band stack with a canvas. The 2026-08-28 walkthrough measured a reader succeeding at role identity and failing only at a suppressed sentence, which is evidence against the canvas rewrite, not for it. Traffic is added *to* the shape that works.

**The riskiest assumption**, stated so Task 6 can kill it: that a thick line reads as *measured traffic* and not as *a rule*. If a reader takes it for a rule, the drawing lies about its own status, and thickness must be removed even though it is the prettiest part of this plan.
