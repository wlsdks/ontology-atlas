---
title: Map scope readout
doc_type: spec
status: draft
area: product
date: 2026-10-05
decisions: [fe968218-45dd-4e22-9fec-28a4db94c924]
---

# Map scope readout

## Person and moment

The owner uses Atlas with a coding agent and was inspecting lower map overlays.
They called the flat legend and the real-document click invitation unhelpful,
then asked the lead to decide with a product planner. Both supplied captures
show those overlays and a separate count/tier row:
`/Users/jinan/scratch/atlas-render-audit-20261005/real-vault-baseline.png` and
`/var/folders/c6/vccybz6x45s4csc77hq86dpc0000gn/T/orca-computer-use/4ef7ddec-03b8-44b4-97c1-e489c93240b6-screenshot.png`.
Learners and people without agents use the same exploration controls.

## Today

These are before-change observations at Git snapshot
`37491e5f18428a4c258120801b5028f832b5c5c1`, not completed-slice proof. Source
paths below refer to that snapshot if the implementation removes a file.

- `src/views/home/ui/TopologyCanvasSurface.tsx:453-490` mounts the legend,
  sample hint, count/tier row and frame meter; the corner yields to a reader.
- `src/views/home/ui/FlatDialLegend.tsx:20-51` explains directions, counts and
  rings, and conditionally reports omitted links and the stale indicator.
- `src/features/first-run-starter/ui/FirstRunReadout.tsx:42-62` limits the old
  row to settled first-run sample mode and chooses a dial total or drawn count.
- `src/features/first-run-starter/ui/SampleNodeHint.tsx:12-33` shows the click
  instruction and document-origin claim visible in both captures.
- `src/views/home/model/use-topology-graph-projection.ts:82-127` substitutes a
  generated graph for `?synth`; `src/views/home/lib/synth-vault.ts:248-252`
  supplies its generic domain labels. These are not actual ontology names.
- `samples/storefront/domains/*.md:4-6` supplies the captured nine named domains.
  The captured storefront contains 125 concepts; no naming repair is needed.
- `src/shared/ui/frame-meter.tsx:28-35` mounts measurement only when enabled.
- MCP full-read `capabilities/ontology-map` describes the existing exploration,
  readers and correction; its currentness is not confirmed. No vault write occurs.

`docs/PRODUCT-DIRECTION.md:24-35` prioritizes human judgment. Flat decision
`88b537fc-3831-4e9d-823f-0465c90a65a8:9` owns ring meaning and disclosure;
those encodings stay. Toast clearance still follows decision
`1bde932e-654f-40fd-8daf-d3a989f4ecb7:9`. No discovered decision requires these
ambient overlays. The brief reports orient/rollback-cheap/solo PO routing and
affected-state audit plus map-performance design proof. Post-change interactions
and larger real-vault results are unknown until the lead verifies them.

## Problem and alternatives

Rank: first restore attention without losing scope; second identify synthetic
data; later address relation teaching only if an observed exploration task fails.
Scope helps orientation on every read; the diagnostic marker avoids mistaking a
generated fixture for the captured storefront at small cost.

The inferred cause is several generic explanations competing with the current
question. People lose the ambient glossary, zoom invitation and link-budget
note. Local map labels, the existing guide and relation reader keep the ability
to investigate a specific relation.

| Option | Value and usability | Cost, feasibility and local-first fit | Choice |
|---|---|---|---|
| Keep the stack | Retains explanations; observed excess remains | No cost; local | Reject |
| No footer | Quietest map; loses scale and scope | Small, reversible, local | Reject |
| One scope line | Names whole map or an actual subset | Small; uses displayed graph, no storage | Select |
| Selection summary | Answers a specific question; duplicates the reader | Extra competing surface; local but larger | Reject |

First slice: one passive line with scope and concept counts. Remove the generic
legend, click hint, domain-count row, tier, link count and renderer metrics.

## Flow

1. When the person opens a settled real or bundled map, Atlas shows `scopeFull`
   with its map-graph count, including concepts represented in collapsed domains.
2. When the person applies an existing filter or scope that reduces actual graph
   membership, Atlas shows `scopePartial` only with two known counts. Pan, zoom,
   viewport culling and semantic disclosure alone never create a subset count.
3. When the person returns through the existing reset or breadcrumb, Atlas
   restores the whole-map line. No navigation control changes.
4. When the person selects a concept or opens a right dock, Atlas steps the
   normal line aside; the existing reader owns selection context.
5. When an agent names a nonexistent selection or count evidence is missing,
   Atlas makes no new completeness claim. An unknown narrowed scope has no
   scope line; existing recovery remains available.
6. When the person opens a valid synthetic diagnostic URL, Atlas replaces the
   normal line with `synthetic` using generated graph size and suppresses the
   unrelated storefront INDEX slot. Reloading without synth restores ordinary data.
7. When the person enables the frame meter, Atlas keeps the existing diagnostic;
   ordinary opens add no measurement loop.

## States

| State | Web | macOS app |
|---|---|---|
| Empty | Out of scope — existing empty-folder guide; line absent | Out of scope — same guide; line absent |
| Loading | Out of scope — existing loading surface; no provisional zero | Out of scope — same behavior |
| Error | Out of scope — existing folder error and retry | Out of scope — existing folder error and picker |
| Whole map | `firstRunStarter.readout.scopeFull`; explore existing map controls | Same key and next action |
| Partial, known counts | `firstRunStarter.readout.scopePartial`; existing reset or breadcrumb | Same key and next action |
| Partial, unknown count | Out of scope — line absent; existing scope control recovers | Out of scope — same behavior |
| Selection or right dock | Out of scope — normal line yields; read or close existing panel | Out of scope — same behavior |
| Synthetic diagnostic | `firstRunStarter.readout.synthetic`; reload without query to return | Same key when diagnostic query active; reload without it to return |
| Largest measured vault | `scopeFull` for the captured 125-concept storefront; larger real results unknown | Same key for supplied capture; larger real results unknown |
| Frame meter on | Existing `nav.settingsMenu.frameMeterFps` and `frameMeterWorst`; disable in settings | Same keys and next action |

## Copy

| Key | Where it appears | English |
|---|---|---|
| `firstRunStarter.readout.scopeFull` | Lower scope line; passive full-graph fact | `Whole map · {count, plural, one {# concept} other {# concepts}}` |
| `firstRunStarter.readout.scopePartial` | Lower scope line; passive verified-subset fact | `Current scope · {shown, number} / {total, number} concepts` |
| `firstRunStarter.readout.synthetic` | Synthetic diagnostic only; identifies generated data | `Performance test · {count, plural, one {# synthetic concept} other {# synthetic concepts}}` |

Exact English and Korean strings live in `messages/en/firstRunStarter.json` and
`messages/ko/firstRunStarter.json`. No provenance or meaning-acceptance claim,
new input, action or error message is introduced.

## Edge cases

- Empty: existing recovery owns the screen. Single: count one and English singular.
- Largest captured real corpus: 125 concepts. The owner's 3,000 fixture is
  synthetic; the 10,000 generator bound is not a measured real-vault result.
- First run: ordinary sample introduction stays; its generic click hint goes.
  The introduction is suppressed only on the synthetic diagnostic.
- Hangul: catalogue word order; no forced uppercase or Latin letter spacing.
  Search input and matching stay unchanged.
- Moved, renamed or unreadable folder: existing recovery; no previous-folder count
  while current data is unknown.
- Concurrent edits: both counts belong to the same current corpus and scope.
- Offline: counts derive locally without requests, storage grants or a server.

## Out of scope

- Ontology renaming or writes: fixture names are generated diagnostics.
- New teaching, selection summaries and scope controls: existing surfaces own them.
- Completeness, freshness or quality scores: counts prove none of these.
- Other view geometry, renderer changes and new performance instrumentation:
  this slice changes ambient information only.

## Acceptance criteria

1. Given the ordinary storefront, when it settles, then old legend, click hint
   and tier row are absent and only `scopeFull` appears with a graph-derived count.
   Check: affected-state capture and `TopologyScopeReadout.test.tsx` behavior coverage.
2. Given a full map, when it is panned or zoomed, then the count never follows
   painted marks. Check: focused readout test and routed map-performance capture.
3. Given a proved subset, when its scope changes or resets, then known membership
   produces `scopePartial` and reset restores full scope; unknown subset counts
   show no whole-map claim. Check: readout test and affected-state walkthrough.
4. Given selection or a right dock, when opened and closed, then the normal line
   yields and restores without covering controls or toast. Check: routed design
   audit of the shared bundle in the browser. Installed-app proof is required
   only if font rendering, scrolling or desktop chrome changes, as routed by
   `.claude/rules/testing.md`.
5. Given `synth=3000`, when settled, then `synthetic` names the generated corpus
   and the storefront header and document-origin claim are absent. Reloading
   without synth restores the ordinary sample. Check: before/after diagnostic
   captures and existing synth coverage; this is the recovery proof.
6. Given frame measurement off/on, when the map opens, then only the enabled
   measuring half mounts. Check: existing frame-meter coverage and settings walk.
7. Given English and Korean at 1512 by 900 CSS pixels, when visible, then the
   line stays legible and pointer-transparent. Check: routed design audit; native
   proof on the external monitor at 2560 and 1920 widths. Phone layout stays.
8. Given the finished diff, when `pnpm checks:changed -- --run` and requested
   follow-ups finish, then the lead records actual outcomes. Rendered and
   performance proof are separate from this planner's reads; do not pin prose.

## Risks

1. Painted marks masquerade as scope. Use membership only; test pan/zoom stability
   and unknown-count suppression.
2. A novice loses the ability to explain a relation. Walk the existing guide and
   selected-edge reader; add targeted teaching only if that task fails.
3. Synthetic data retains a sample-origin claim or the line collides with chrome.
   Probe synth/no-synth recovery and panel/toast clearance in the routed audit.

## Later

1. Targeted relation explanation if a walker cannot answer a concrete edge
   question through the existing reader.
2. Named scope context if people lose their place despite the breadcrumb and
   full/subset line.

## Owner question

None. The owner delegated this choice to the lead and product planner. Restore the
prior stack if the exploration probe shows a material loss; no storage or
ontology migration prevents recovery.
