---
title: Remove the Territories map view
doc_type: spec
status: current
area: map
date: 2026-10-17
decisions: [fa1f007c-ae28-4a8d-9156-db50f0bd2875]
---

# Remove the Territories map view

## Person and moment

Anyone on the map who presses the current-view chip meets the view picker. The
first such person already uses coding agents and opens the map to see which
capabilities stand on code that changed. The observed moment is the owner's
words, 2026-10-17, in Korean: "This Territories thing is odd; I don't think it's
needed?", naming the view by its Korean picker label. The lead agreed that it
overlaps Flat and Hex. Unknown: what was on the owner's screen, and whether
anyone else uses Territories (Atlas records no usage). No capture exists, so
acceptance criterion 1 makes one. Asked the same day whether the word meant
the picker row or the realm action, the owner answered, in Korean, "'Territories'
in the map view menu": the picker row. The person loses the one view that names
every capability at rest without zoom or expansion. They gain five rows, each a
different picture.

## Today

Source `9debd382c`. `pnpm po:route -- --evidence=observed --outcome=orient
--change=surface-inventory --boundary=…:unchanged` →
`review · door=one-way · risk=scope · record=yes · lenses=moment,evidence,smallest-slice`.

- **Picker.** `View3dMenu.tsx:36` (`src/widgets/search-hint/ui/`) offers
  `flat, territories, hex, structure, strata, coupling`. Its labels sit at
  `messages/{en,ko,ja,zh}/searchWidgets.json:213-228` (Territories at `:215` and
  `:223`), and the chip reads the same flags (`SearchHint.tsx:70-75`, `:219-224`).
  The Korean row label's word also names the realm action:
  `topology.realm.enterAction` ("View only this"), `ledger.heading` and
  `boundaryJump` (`messages/ko/topology.json:400-412`).
- **Address.** `url-state.ts:92` accepts `view=territories`; any unknown value
  parses to no view (`:95-98`), and `galaxy` opens Domain structure (`:96`). On
  arrival with no view, the stored pick is written (`use-map-view-sync.ts:35`),
  but Flat writes nothing. An unknown value therefore stays until the next route
  write rebuilds the address (`url-state.ts:578`). Answering another writer's
  address is the loop WebKit refuses (`use-map-view-sync.ts:20-25`). Route memory
  saves the query too (`src/shared/ui/routing/route-memory.tsx:27`, `:44`), so a
  person who last saw Territories returns to `?view=territories`.
- **Stored pick.** `atlas.appearance.territories` (`appearance-preferences.ts:274`,
  `src/shared/lib/preferences/`) is one of five flags that `writeMapView` writes
  together (`:372-394`); every pick also removes the retired Galaxy key (`:393`).
  The registry scopes it as global
  (`tests/contract/routes/scope-registry.contract.test.ts:118`).
- **Morph.** A pick arms it (`View3dMenu.tsx:73`). Ghost travel covers the
  overlay views `territories, hex` (`src/widgets/ontology-map/morph/layout-morph.ts:9`),
  and an unarmed change cuts (`:38`). Hex's targets are `map-marks.ts:247-251`
  and Territories' are `:252-261`.
- **What Hex took from Territories** (6de28f78 Prior): `use-map-evidence-states.ts`
  (`TopologyHexBoardSurface.tsx:9`, `:48`), which Flat and Strata read too
  (`TopologyMapRenderer.tsx:170-174`) though its comment says only Territories does
  (`:31`); its rule, `src/shared/lib/git/evidence-states.ts` over `evidence-verdict.mjs`,
  also serves the insights brief and `mcp/src/drift/evidence-drift.mjs`. The
  inspector has no Territories branch.
- **Territories-only code** (`wc -l`; first four under `src/widgets/ontology-map/`):
  `render/territories.ts` 567, `model/layout/territories-layout.ts` 701 + test 329,
  `morph/territories-marks.ts` 170, `ui/OntologyTerritoriesMap.tsx` 697,
  `src/views/home/ui/TopologyTerritoriesSurface.tsx` 125,
  `tests/e2e/map/map-territories-view.spec.ts` 220; 2,809 lines. It imports
  `tapered-arrow.ts` (also Strata's, `render/dome-view/strata-lod.ts:2`),
  `node-shapes.ts`, `labels.ts`, `free-area.ts`; none of them imports it back.
- **Tokens.** Eight `--map-territory-*` (`app/styles/base-map-tokens.css:101-113`),
  read only at `territories-marks.ts:32-39` and `TopologyTerritoriesSurface.tsx:80-97`;
  the ratchet allows 0 unused (`unused-token-ratchet.contract.test.ts:122`).
- **Hex at rest.** On the dogfood vault at 1512 it names every capability
  (`tests/e2e/map/hex-board/map-hex-board.spec.ts:197-198`) and counts each domain's
  capabilities and stale ones (`topology.hexBoard.domainMeta`, `domainStale`); at
  1040 it rests on dots (`:335`), at 300 capabilities on plates (`:408`). Flat
  shows capabilities "when they get screen room" (88b537fc).
- **Docs.** `docs/features/map/canvas.md:15-18`, `:165-206` and `docs/DESIGN-SYSTEM.md:90`
  name it; `README*.md`, `docs/FEATURES.md`, `ARCHITECTURE.md` and the vault do not.

## Problem and alternatives

Only one problem was named, so nothing ranks against it. Flat, Territories and
Hex all answer which domain holds which capability, and Hex was admitted on
Territories' own five-second-still falsifier (5c88c11e, 6de28f78). A reader
learning the picker therefore meets two rows for one question. Territories also
keeps 2,809 lines, eight tokens and seven e2e specs in step with every Flat or Hex
change. The cause is the overlap, not the label: a rename keeps both rows.

| Option | Value and usability | Cost and fit | Result |
|---|---|---|---|
| Status quo | Names at rest at any width | Six rows, a Korean word the app also uses elsewhere, upkeep | Lost: owner calls it unneeded |
| Hide behind a flag; `?view=territories` still works | Reversible without Git | All code stays; a view no picker reaches breaks the one-picker rule (2026-09-10) and `architecture.md`'s no-unused-code rule | Lost |
| Delete; a retired value counts as no view | Five rows; old links land on a working map | Old links lose the view; narrow windows lose names at rest | **Chosen** |
| Delete; a retired value opens Hex | Closest picture | Writes a Hex placement nobody asked for (`TopologyHexBoardSurface.tsx:52`); overrides the reader's pick | Lost |

**Legacy states.** A dead value must never change the reader's own choice, and
Flat is the default.

- *Stored Territories pick.* The flag is never read. The other four were written
  off with it, so Flat opens. The next pick removes the key, as it removes
  Galaxy's (`appearance-preferences.ts:393`).
- *`?view=territories` link, bookmark or remembered route.* It acts like every
  unknown value today (`view=cone`, `url-state.test.ts:70`): the stored pick opens,
  and another stored view gets the existing write, `view=<pick>`. With Flat stored,
  the address stays until the next route write drops `view` (`url-state.ts:578`).
  Arrival cleanup would be the slice's one new behavior, placed in the hook whose
  loop WebKit refuses, and would fix only the web address bar: Later 2.
- *Session open at upgrade.* A loaded page keeps its bundle, and the web lands
  as above on reload. The app swaps its bundle only on restart
  (`appUpdate.readyBody`), and the restart restores the remembered route.
- *Morph in flight.* A morph lives in one page, so none crosses an upgrade. An
  old-build tab that picks Territories turns the other flags off, and a new-build
  tab cuts to Flat, unarmed.

| Keep / delete | Files (paths shortened) |
|---|---|
| Delete | The seven Territories-only files; the eight tokens; `settle.ts:309-349` (`waitForTerritoriesStill`); `e2e-after-merge-map.mjs:271-280`; `post-merge-specs.ts:89`; `playwright-file-durations.json:819`; the Territories cases at `map-canvas-interaction-placement.spec.ts:105`, `:339`, `:388` and `map-overview-centre.spec.ts:282-311` (the Neural half stays) |
| Narrow | `appearance-preferences.ts`, `map-layout-morph-store.ts:1`, `layout-morph.ts:9-20`, `map-marks.ts:33`, `:230`, `:252-261`, `use-map-layout-morph.ts:7-9`, `TopologyMapRenderer.tsx:42`, `:69`, `:143`, `:178-198`, `:238-252`, `use-topology-preferences.tsx:3`, `:43-44`, `:67`, `SearchHint.tsx`, `View3dMenu.tsx`, `url-state.ts:92`, `use-map-view-sync.ts`, `ontology-map/index.ts:2`, `map-overview-centre.spec.ts:264` (a shared selector: drop only the `territories-map` alternative); registry `:118` stays, reworded like `:117` ("Retired view preference, never read; removed on the next pick"), and `:80`'s note names the four values |
| Retarget to Hex | `map-layout-morph.spec.ts:8`, `:217`, `:229`, `:284-285` (Strata→Hex replaces Strata→Territories), `:433-450`, `:474`, `:488-498`; `map-view-motion.spec.ts:50`; `map-sleep-frames.spec.ts:33`; `map-canvas-focus.spec.ts:78` (MC-17's list becomes `strata, coupling, hex`); `map-structure.spec.ts:51-52` (six radios and a visible territories row); `View3dMenu.test.tsx:89`; `map-marks.test.ts:46` (`territoryStats`); `layout-morph.test.ts:8`, `:40`, `:58-62`; `use-presence.test.tsx:33-40` (its placeholder view name becomes `hex`); the unit tests that name the view |
| Keep, fix comment | `use-map-evidence-states.ts:29-32` (also `evidence-result.mjs` → `evidence-verdict.mjs`), `evidence-states.ts:113`, `read-map-tokens.ts:39`, `settle.ts:358`, `dogfood-vault-files.ts:10` |
| Keep as is | `evidence-verdict.mjs`, `tapered-arrow.ts`, `node-shapes.ts`, `labels.ts`, `free-area.ts`, `MapLayoutMorphOverlay.tsx`, `hex-marks.ts`, the inspector; plain-English "territory" at `topology-edge-hit.ts:57`, `topology-edge-hit.test.ts:68`, `error-echo.ts:9`, `page-metadata.test.ts:32` |

**URL contract.** No route changes, so the route rule in `.claude/rules/git.md`
does not apply, and `docs/ARCHITECTURE.md`'s query table does not list
`/topology`'s `view`. The accepted values shrink to `hex, structure, strata,
coupling` (the `galaxy` alias stays). A `Removed` change fragment withdraws the
2026-09-24 promise that a `?view=territories` link opens the view.

**Decision fragment** (`pnpm record:new`, filed by the lead):

```md
## 2026-10-17 — Territories leaves the map picker; Hex keeps its morph

**Why**: owner, 2026-10-17 (in Korean): "This Territories thing is odd; I don't think it's needed?". On the dogfood vault Hex already names every capability at rest at 1512 with domain counts and stale rims (`map-hex-board.spec.ts:197`), and Flat names capabilities as they get room (88b537fc); three of six picker rows read domain to capability.
**Prior**: overturns 2026-09-24 5c88c11e. Narrows 2026-09-30 0d8a6f67 to picks into or out of Hex, and 2026-10-15 f4310914's "Territories and Hex" clause to Hex. Keeps what 6de28f78 took from 5c88c11e (one picker, the shared evidence rule, the flat map's inspector) and the 2026-09-10 one-picker rule.
**Decision**: the picker offers Flat, Hex board, Domain structure, Strata, Neural. `?view=territories` and a stored Territories pick count as no view, like any unknown value: the reader's last pick opens, else Flat. The stored key is never read and goes on the next pick. Territories' renderer, layout, marks, tokens, messages and tests are deleted.
**Dissent**: Territories alone named every capability at rest at any window size (fixed label scale, pan); Hiding it behind a flag lost: code no picker reaches. Below xl the loss is known: Hex opens on pips at 1040 (`map-hex-board.spec.ts:335-343`).
**Falsifier**: from a five-second still of Hex at 1512 on the dogfood vault, a reader cannot say which domain a named capability belongs to, or which capabilities are stale.
**Owner**: Stark
```

## Flow

1. When the person presses the view chip, Atlas lists Flat, Hex board, Domain
   structure, Strata and Neural, in that order, with the drawn view checked. The
   arrow keys move through those five.
2. When a person whose last view was Territories opens Atlas after the update,
   Atlas draws Flat and the chip reads `view3dChoice.flat`, with no notice or error.
3. When that open carries `?view=territories` and the stored pick is Flat, Atlas
   leaves the address as it is until the person's next action that writes it,
   such as a selection, which drops `view`. No history entry is added.
4. When such a link opens for a reader whose last pick was another view, Atlas
   draws that view, writes `view=<pick>`, and leaves the stored pick unchanged.
5. When the person picks Hex from Flat or Strata, or Flat from Hex, each concept
   travels as today; under reduced motion the pictures crossfade.
6. When Hex cannot draw, Atlas shows Flat with `topology.hexBoard.failed`. When
   the web has no Git to read, Hex says `topology.hexBoard.evidenceAppOnly`: the
   same "unknown" that Territories gave on the web (5c88c11e).
7. When an old-build tab picks Territories, a new-build tab cuts to Flat with no
   travel and no error.

## States

| State | Web | macOS app |
|---|---|---|
| Picker open | Five rows `searchWidgets.hint.view3dChoice.{flat,hex,structure,strata,coupling}`, each with its `view3dChoiceHint`; arrows, Enter or a press picks | Same keys and actions |
| Stored Territories, no `view` | Flat; chip `view3dChoice.flat`; the picker chooses another | Same, after the update's restart (`appUpdate.readyBody`) |
| `?view=territories`, stored Flat | Flat; the address keeps `view` until the next route write drops it; history length unchanged | Same; the address is not shown |
| `?view=territories`, stored other view | That view; `view=<pick>`; stored pick unchanged | Same |
| Flat↔Hex, Strata→Hex | Concepts travel; Hex legend and `topology.hexBoard.evidence*` note | Same; evidence measured from Git |
| Old-build tab during a deploy | Out of scope — a loaded page keeps its bundle until reload, then lands as above | Out of scope — the bundle changes only on restart |
| Empty (0–1 concept) | Flat's `topology.empty.*` state and its actions | Same |
| Loading | Hex `topology.hexBoard.evidenceReading`; Flat unchanged | Same |
| Error | Hex fails: Flat with `topology.hexBoard.failed` | Same |
| Partial | Hex `topology.hexBoard.evidenceAppOnly`: every state unknown | `topology.hexBoard.evidenceUnreadable` or `evidenceNoPaths` when Git cannot answer |
| Largest measured vault | Synth 2000 Flat↔Hex travel (0d8a6f67); into Flat past 6,500 concepts it crossfades (`layout-morph.ts:16`) | Same |

## Copy

None — no string is added or reworded. The removals land with the code in all
four locales, because deleting them first would make `View3dMenu.tsx:189`
render a missing key.

| Key | Where it appears | English (removed) |
|---|---|---|
| `searchWidgets.hint.view3dChoice.territories` | Picker row title | Territories |
| `searchWidgets.hint.view3dChoiceHint.territories` | Picker row hint | every capability named, gathered around its domain |
| `topology.territories.*` (16 keys, `topology.json:33-50`) | Territories canvas label, list, legend, evidence note | e.g. "Capabilities on the territories map" |

In `canvas.md`: "Five map views"; drop the Territories paragraph and the clauses
at `:15-18`. Hex's "same rule and Git walk as Territories" becomes "as the
analysis brief", and the morph names only the Hex board. `DESIGN-SYSTEM.md:90`
drops the Territories reader. The `Removed` change fragment reads: "The map's
Territories view is gone from the view picker. Hex board shows every capability
as a tile in its domain's region, with stale ones rimmed, and Flat names
capabilities as you zoom. A link or last-used view that named Territories opens
your own last view, or Flat."

## Edge cases

- **Counts.** With zero or one concept, a stored Territories pick shows Flat's
  empty state. The largest measured: synth 2000 travel and Flat's 6,500 ceiling,
  while Hex has none (`layout-morph.ts:13-20`). Dogfood: 4 domains, 32
  capabilities, 60 elements (`list_kinds`).
- **First run.** No stored pick: Flat, as today. **Hangul input.** None: nothing
  is typed; the ko capture covers the labels.
- **Moved, renamed or unreadable folder.** The pick is global (registry `:118`),
  so recovery is unchanged; Hex placement stays per folder.
- **Two edits at once.** Old-build and new-build tabs: Flow 7; two new-build tabs
  as today. **Offline.** Unaffected: the pick lives in local storage.
- **Odd values.** `view=Territories` and `view=territories,hex` are unknown, so
  they count as no view; a stored flag of any value is never read.

## Out of scope

- Rewriting `view=galaxy` to `view=structure`: it already opens the right view.
- A "Territories was removed" notice: the chip names what is drawn, and the view
  was 23 days old.
- Hex names at rest at 1040, or numbered region strokes: Later 1.
- The realm action or its Korean copy: a different feature (owner, 2026-10-17).
- A vault write: `capabilities/ontology-map` does not name Territories
  (`/ontology-sync` confirms). Frozen records and generated docs-vault data.

## Acceptance criteria

1. **Given** `9debd382c` and the new build as static export, in ko and en at
   1512, **when** the picker is open and Atlas lands from a stored Territories
   pick, **then** captures show six rows before, five after, and Flat on the chip.
   Check: `/ui-proof` captures in the PR; AC 8 is the installed-app proof.
2. **Given** the picker, **when** it opens, **then** it holds exactly
   `flat, hex, structure, strata, coupling` in order, with no
   `topology-view-3d-choice-territories`, and ArrowDown from Flat checks Hex.
   Check: `src/widgets/search-hint/ui/View3dMenu.test.tsx`.
3. **Given** `atlas.appearance.territories=on` with the other flags off, **when**
   `/ko/topology` opens, **then** `data-map-view="map"` is drawn, the chip names
   Flat, no `widgetError` shows, and after any pick the key is absent. Check:
   `appearance-preferences.test.ts`; setup (a) of a new case in
   `tests/e2e/map/map-canvas-focus.spec.ts`, "MC-18: a retired Territories pick or
   address opens a working map": stored `atlas.appearance.territories=on` with the
   other four flags off draws Flat, and the chip names Flat.
4. **Given** `/ko/topology?view=territories`, **when** it opens with no stored
   pick, **then** Flat is drawn with no error, `history.length` is unchanged, and
   after one selection the address has no `view`. With stored Hex, `view=hex` is
   written, Hex is drawn, and the `atlas.appearance.hex-board` flag stays `on`.
   Check: `url-state.test.ts` (`territories` parses to no view),
   `use-map-view-sync.test.ts`, and MC-18 setups (b) `?view=territories` with
   nothing stored and (c) stored Hex.
5. **Given** synth 300, **when** the person picks Flat→Hex, Hex→Flat,
   Strata→Hex and Flat→Hex in relief, **then** each pick carries every concept on
   the camera clock with no blank frame, and the stalled-mount and unarmed-cut
   cases pass on Hex. Check: `tests/e2e/map/frame-loop/map-layout-morph.spec.ts`,
   `map-view-motion.spec.ts`, `layout-morph.test.ts`.
6. **Given** the removal diff, **when** the checks run, **then** `pnpm knip`,
   `pnpm typecheck` and `pnpm messages:check` pass. The seven files, the eight
   tokens and the `territories` keys are gone in four locales; `unused-token-ratchet`
   stays at 0; and `git grep -li territor -- src app tests docs/features
   docs/DESIGN-SYSTEM.md messages ':!tests/contract/ratchet-raises'` lists exactly
   the four plain-English uses (`topology-edge-hit.ts`, `topology-edge-hit.test.ts`,
   `error-echo.ts`, `page-metadata.test.ts`) and the five that name the retired
   value on purpose (`appearance-preferences.ts` and its test, `url-state.test.ts`,
   `scope-registry.contract.test.ts`, `map-canvas-focus.spec.ts`); the inert
   ratchet-raise record is left unedited.
7. **Given** the dogfood evidence vault at 1512, **when** Hex opens, **then** it
   reads `data-hex-evidence="measured"`, names every capability, and counts stale
   ones as before. Check: `map-hex-board.spec.ts:163-225`, unchanged.
8. **Recovery proof.** Given the installed app updated from a build whose last
   view was Territories (stored pick and remembered route), with storage and
   address untouched, a person reopens Atlas, sees Flat on the chip, picks Hex in
   one press, and says which domain holds a named capability and whether it is
   stale, citing the tile's region and rim or the evidence note. Fail on an error,
   a blank map, a chip naming a view the picker lacks, or Hex arriving without
   travel. Check: an installed-app walk recorded in the PR.

## Risks

1. Observed, not probed: no view names every capability at rest at 1040. The PR
   states this loss to the owner in one line.
2. **Cutting shared code breaks Hex or Flat**: the evidence hook's comment says
   only Territories reads it (`use-map-evidence-states.ts:31`), and the overlay set
   shrinks to one view (`layout-morph.ts:9`). Design: the keep list, the corrected
   comment, and AC 5 and 7 run against Hex and Flat.

## Later

1. Hex names capabilities at rest at 1040: next if the owner misses names at rest
   on a narrow window.
2. Drop an unknown `view` from the address on arrival, for every unknown value:
   next if a person is misled by a web address that names a missing view.
3. A real `view3dChoiceHint.structure` in ko, ja and zh, which repeat the label
   (`messages/ko/searchWidgets.json:219`, `:227`): it becomes the next hint that
   adds nothing.
4. A one-time notice on landing from a Territories pick: only if someone asks
   where it went.
