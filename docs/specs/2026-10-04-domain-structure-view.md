---
title: Domain Structure View
doc_type: spec
status: current
area: map
date: 2026-10-04
decisions: [dc9455e4-f63c-432b-9e17-eb5e3ad32eb7]
---

# Domain Structure View

## Person and moment

The owner maintains a codebase with agents and opened Galaxy. Their 2026-10-04 capture shows small star targets, named domain
clouds, and crossing strands carrying bare numbers. They reported that its
composition felt strange and it was difficult to use, selected domain structure,
and explicitly requested complete Galaxy removal. The delivery report retains
the owner capture and the native baseline at 1512×806. No independent
comprehension trial has been performed.

The returned ability is **orient**: start from a named responsibility, open its
recorded capabilities, and reach an implementation concept and its document.
Learners and people without agents use the same reading path. Presentation does
not qualify the meaning an agent wrote.

## Today

These observations refer to baseline commit `bed2e983d`, before removal.
Retired paths below are historical evidence, not current implementation owners.

- `src/views/home/ui/TopologyMapRenderer.tsx:264-279` mounts a cosmos surface
  with placement, camera fit, and selection state.
- `messages/en/searchWidgets.json:222-236` lists Flat, Territories, Hex board,
  Galaxy, Strata, and Neural and describes Galaxy as a sky of stars.
- `src/views/home/model/url-state.ts:85-96` accepts `view=galaxy`;
  `src/shared/lib/appearance-preferences.ts:321-336` stores an on/off preference.
- Decisions `5811e07b-304f-412f-b47d-2a6cb4685091` and
  `4de4259c-7ff0-4489-a5ee-8e248936f826` selected domain galaxies and aggregate
  strands. Their dissent records unnamed contributing capabilities and missing
  exploration affordances. The owner now rejects this presentation.
- `src/widgets/ontology-map/ui/OntologyMap.tsx:55-90` defines four renderable
  kinds and typed edges. `src/views/home/lib/map-adapter.ts:98-107` sets the
  containment display kind but preserves original relation direction.
- `src/entities/knowledge-graph/model/types.ts:27-63` retains localized names,
  document availability, and typed facts. The convenience helper at
  `src/entities/knowledge-graph/lib/ontology-tree/insights.ts:213-233` keeps only
  the first parent; it does not establish that membership is a tree.
- [Specification §4–§5](../ONTOLOGY-ATLAS-SPEC.md#4-uid-slugs-uniqueness-and-containment)
  defines bounded project containment. Folders, imports, and dependencies do not
  establish membership.

## Problem and alternatives

Ranked losses: (1) find a named starting point, (2) reach its implementation
without hunting small targets, (3) compare domain dependencies. The first two
lead because they restore the entrance to evidence and correction. Retained
views and panels continue to expose recorded dependencies.

Spatial decoration competing with names and actions is the cause; rough motion
is one symptom. Removal loses Galaxy's spatial overview and aggregate strands,
without removing recorded relations or the other five modes.

| Option | Value and usability | Cost, feasibility, local-first fit | Decision |
|---|---|---|---|
| Keep Galaxy; improve labels/targets | Keeps overview; still needs spatial discovery | Camera/label tuning over local data | Lost: leaves the owner's navigation problem |
| Named structure workbench | Direct children and a reversible path expose names/documents | One DOM surface over local graph; must preserve DAG facts | Owner-selected |
| Dependency diagram | Strong for one relation path; weaker for product orientation | Edge-density/layout choices; remains local | Later if relation tracing is the next observed loss |

First slice: named `structure` mode in the existing topology destination, using
existing primitives, tokens, selection, and document panels. Remove active
Galaxy source and supporting code, migrate old choices, retain other modes, and
update current authorities. The lead records the DOM-view decision and
supersedes the two Galaxy decisions for this surface; frozen history remains.

## Flow

1. When the person chooses Domain structure, Atlas shows named project roots and
   their recorded children. Concepts without a project path remain reachable
   under Outside the recorded structure. Without project documents, every
   renderable concept remains accessible.
2. When the person presses a project/domain/container row, Atlas shows its direct
   children grouped by kind and adds that actual membership step to the
   breadcrumb. This browsing does not open a detail popover on every step.
3. When the person chooses Read for the active concept or a leaf, Atlas opens the
   existing detail/document workbench. Back or a breadcrumb returns to its scope
   without camera zoom. Keyboard focus uses the existing map-surface contract.
4. When a concept has several recorded parents, Atlas exposes the same identity
   under each with an additional-parent indicator. The selected route is one
   reading path; counts use unique direct children, not duplicated subtrees.
5. When search or an existing selected-concept deep link identifies a concept,
   Atlas reveals a deterministic valid ancestry path and shows shared membership.
   No new URL scope is required; browsing path is transient view state.
6. When an agent omitted membership or named a missing document, Atlas preserves
   discoverability and existing evidence/relations access. It marks missing
   documents and does not invent a parent, accept meaning, or write a repair.
7. When a child repeats an identity already in the breadcrumb, Atlas marks
   circular containment and offers Read instead of extending the path forever.
8. When navigation reverses rapidly, the latest input wins. The current parent
   joins its real child-kind groups with measured membership links; a finite
   stroke reveal and child entrance explain the change. Card delays use the
   existing 35ms stagger capped at 105ms; reduced motion settles immediately.
   Refresh trims broken steps to the last valid ancestor; folder switch resets
   transient path rather than retaining foreign identities.

Membership uses recorded `contains` parent→child and `belongs_to` child→parent.
Reverse `belongs_to` once even when its map edge already has kind `contains`.
Preserve direct project→capability, project/domain→element and same-kind children;
do not force missing levels. Never use `depends_on`, `implements`, `uses`,
`related_to`, `describes`, or `is_a` as membership. Deduplicate identities and
use visited identities for reachability. Closed orphan cycles remain accessible.
All concepts is a navigation scope, not a fabricated project or graph node.

This is a bounded list browser, not an automatically expanded recursive tree.
Documents and unknown kinds remain accessible through existing INDEX/document
access; the four-kind map adapter is not authority to erase their records.

## States

| State | Web | macOS app |
|---|---|---|
| Overview | `overview`, kind headings; open a root or orphan | Same keys/actions; existing folder context |
| Scoped children | `childCount`, `browse`, `inspect`, `back`; open/read/return | Same keys/actions; existing document/agent panels |
| Shared membership | `shared`; inspect one identity from either parent | Same key/action; no duplicate document |
| Empty | `empty`; existing folder/construction actions | Same key; existing native folder/construction actions |
| Leaf | `emptyChildren`, `inspect`; read recorded relations | Same keys/actions |
| Loading | `loading`; wait for existing reader | Same key; wait for native read |
| Error | `unreadable`, `reopenFolder`; existing reconnect control | Same keys; native chooser, no edits |
| Partial/orphan | `unassignedDescription`, `missingDocument`; inspect relations | Same keys/actions; no inferred repair |
| Cycle | `cycle`, `inspect`; read instead of repeating path | Same keys/actions |
| Filtered empty | `filteredEmpty`, `clearFilters`; clear existing filters | Same keys/actions |
| Largest measured vault | `conceptCount`; bounded list/scroll/search | Same keys/actions; measure capacity |
| Legacy choice | `title`; old stored choice/URL resolves to structure | Same key; preserve folder and selected document |
| Reduced motion | `title`, `breadcrumb`; immediate navigation | Same keys/actions; system preference |

Reuse existing loading, reconnect, filter, and error controls rather than create
new error-state machinery. Empty filtered scope does not claim an absent relation.
Preserve the folder, selected identity, and other modes' preferences. Distinguish
structural context from matched children, retaining an explicit clear-filter action.

## Copy

Namespace `mapStructure`; exact translations are in
`messages/{en,ko,ja,zh}/mapStructure.json`. Both surfaces share keys.

| Key | Location | English |
|---|---|---|
| `title` | Picker/heading | Domain structure |
| `description` | Introduction | Read the recorded structure, from domains to capabilities and implementation elements. |
| `breadcrumb` | Accessible name | Structure path |
| `overview` | Root breadcrumb | All concepts |
| `back` | Back action | Back to {name} |
| `browse` | Open action | Open {name} |
| `inspect` | Read action | Read {name} |
| `projects`, `domains`, `capabilities` | Kind headings | Projects; Domains; Capabilities |
| `elements`, `documents`, `other` | Kind headings when available | Implementation elements; Documents; Other concepts |
| `unassigned` | Orphan heading | Outside the recorded structure |
| `unassignedDescription` | Orphan explanation | These concepts have no recorded path from a project. Open one to inspect its document and relations. |
| `shared` | Additional parents | Also shown under {count, plural, one {# other parent} other {# other parents}} |
| `childCount` | Unique direct-child count | {count, plural, one {# direct child} other {# direct children}} |
| `conceptCount` | Unique concept count | {count, plural, one {# concept} other {# concepts}} |
| `empty` | Empty graph | No concepts in this folder yet. |
| `emptyChildren` | Leaf | No direct children are recorded for {name}. Read its document to inspect the recorded relations. |
| `filteredEmpty` | Filter result | No concepts match the current filters. Clear the filters to see the structure. |
| `clearFilters` | Recovery | Clear filters |
| `missingDocument` | Missing document | No document for this reference. Read its incoming relations to see where it was named. |
| `cycle` | Repeated identity | This concept is already in the path. Read its document to inspect the circular containment. |
| `loading` | Folder read | Reading this folder’s concepts… |
| `unreadable` | Read failure | The folder could not be read. Reopen it to restore access; no documents were changed. |
| `reopenFolder` | Recovery | Reopen folder |
| `previousPage`, `nextPage`, `page` | Bounded child list | Previous; Next; {current} / {total} |

## Edge cases

- Empty/first-run folders retain onboarding; one leaf can be read without a fake
  domain/capability chain. Other kinds remain available in existing INDEX.
- Existing display labels and search preserve canonical and localized names,
  including Hangul. Long names wrap and remain readable without hover. Browse
  and Read remain distinct keyboard targets.
- Supplied repository inventory: 101 nodes. Prior synthetic Galaxy 10k results
  do not validate DOM performance. Measure current and synthetic 10k input with
  bounded visible rows and no cascading per-row entrance delay.
- Moved/renamed/unreadable folders use existing reconnection. Concurrent deletion
  trims broken scope safely; valid identity steps and existing detail state stay.
- Toolbar and content share one measured frame; collapsed left/right margins
  are symmetric, and expanded INDEX keeps toolbar rows stable across view picks.
- Narrow widths use one readable column and wrapping/scrollable breadcrumb,
  without body overflow or targets behind INDEX/detail/agent panels.
- Missing levels, shared children, disconnected cycles and dangling references
  never trigger inferred membership or destructive cleanup.
- Offline uses the loaded local graph; no fetch, account, or backend is added.

## Out of scope

- Replacing Flat, Territories, Hex, Strata, or Neural: removal targets Galaxy.
- New kinds, inferred relations, writes, or meaning acceptance: presentation
  cannot authorize them.
- New dependency layout or aggregate-strand replacement: retain relation panels.
- Decorative haze, auto-pan, and indefinite animation: use finite transitions.
- Removing saved constellations: their task-context storage is independent.
- Deleting frozen historical records: update current authorities instead.

## Acceptance criteria

1. **Given** the owner-captured graph without source lookup, **when** opening a
   named domain, capability, and element, **then** the person can name that path
   and read its document without zoom hunting. Fail for hover-only names or wrong
   identity. Proof: rendered walkthrough and installed-app capture.
2. **Given** directional containment, direct children, shared identities, missing
   roots, and cycles, **when** browsing or following a selected deep link,
   **then** all renderable identities remain reachable using recorded membership
   only. Proof: projection fixtures and runtime journey; retain other-kind INDEX.
3. **Given** an agent's missing membership/document, **when** inspecting,
   **then** missing evidence stays visible and no record is silently written or
   accepted. Proof: partial-data fixture and recovery walkthrough.
4. **Given** keyboard input and INDEX/detail/agent panels at narrow/wide widths,
   **when** opening and returning, **then** names, focus, and actions remain
   reachable without body overflow. Proof: design audit, responsive sweep,
   keyboard E2E and native workbench capture.
5. **Given** filters or deletion during browsing, **when** scope empties/breaks,
   **then** clear filters or the last valid ancestor restores browsing without
   losing the folder. Proof: filter/refresh runtime fixtures.
6. **Given** normal/reduced motion and rapid reversals, **when** changing scope,
   **then** latest intent wins and reduced motion settles immediately. Proof:
   background OS recording at 60fps minimum with 120fps capture ceiling, source
   timestamps and retained sampling flags; no 120Hz-output claim.
7. **Given** old Galaxy URLs/preferences and retained choices, **when** opening,
   **then** old Galaxy resolves to structure and no active renderer, camera,
   probes, assets, tokens, catalogs, or obsolete tests survive except minimal
   migration strings and historical evidence. Proof: migration tests, native
   reopen, and targeted source inventory.
8. **Given** current and synthetic 10k inputs, **when** opening, scrolling,
   drilling, and returning, **then** bounded rows remain usable without recursive
   whole-graph DOM expansion. Proof: measured runtime report and all
   recommendations from `pnpm checks:changed -- --run`.

## Risks

1. A tidy tree hides meaning: probe reversed membership, shared children, direct
   levels, and cycles; never treat first-parent-only projection as truth.
2. Drill-only cards isolate inspection: retain Read actions, existing panels,
   explicit recovery, and keyboard/native narrow-width proof.
3. Large scopes become animated walls: bound rows, show direct children, use
   finite surface motion, and measure 10k interaction.

## Later

1. Named dependency tracing if readers cannot explain a selected concept's
   requirements through existing relation inspection.
2. Additional density controls if measured direct-child groups impede finding
   names despite bounded lists, search, and scrolling.

## Owner question

None — the owner selected domain structure and complete Galaxy removal. Routine
choices preserve recorded facts and remain reversible through retained views.
