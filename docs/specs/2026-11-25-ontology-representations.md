---
title: How the map represents the ontology
doc_type: spec
status: draft
area: map
date: 2026-11-25
decisions: []
---

# How the map represents the ontology

Which pictures of the ontology Atlas keeps, what each one is for, which new one is worth building,
and the first slice: the Hex board keeps every tile apart in every state and at every zoom. `CAP` is
`/private/tmp/claude-501/-Users-jinan-orca-workspaces-ontology-atlas-main/7e08f96f-b1d4-4fa8-ba0c-5384fe58c2ab/scratchpad/views`:
1512x900 headless stills of this worktree's static export (built 01:07 on 2026-11-25, before that
day's Flat selection edits) through the app runtime stub, on `docs/ontology` with Git evidence from
this repository, and on the 300-capability fixture (`tests/e2e/hex-board-vaults.ts:96`).

## Person and moment

A developer who delegates changes to coding agents opens the map at five moments
(`docs/PRODUCT-DIRECTION.md:24-27`, `:43-51`). A view exists to answer one of these questions; a
picture that answers none of them better than another view has no place.

| # | Moment | The question | Answered today by | Gap |
|---|---|---|---|---|
| M1 | First look at a codebase they did not write | What is here, how is it divided, where do I start? | Flat at rest; Hex names every capability | No order to read in |
| M2 | About to change one part | If this moves, what moves with it, and how far? | Flat selection (direct); Neural (every hop) | In repair: `2026-11-25-map-selection-scene.md` |
| M3 | An agent just changed something | What did it touch, by meaning, and what of it does the map not know? | Nothing on the map | The largest gap |
| M4 | Explaining the system to someone | What is it made of, in what proportion? | 3D tree; Flat | The tree does not name what is selected |
| M5 | Deciding what to trust or re-read | Where is the recorded meaning stale, thin or missing? | Hex (stale rims) | No rank, no reason, nothing for "thin" |

**Observed or not.** Nothing observed exists for any of the five: no walkthrough or recording of a
person using a view was found. The moments come from the product thesis and the owner's words of
2026-11-25 through the lead: think from many angles about how the ontology should be represented;
improve Hex further; the Domain structure view is not needed; and two marks that touch cannot be
told apart, even when hovering enlarges one. Criterion 1 captures the moments before any build.

## Today

The picker offers Flat, Hex, Domain structure, 3D and Neural
(`src/widgets/search-hint/ui/View3dMenu.tsx:21`); the address carries `?view=`
(`src/views/home/model/route-state/url-state.ts:60`). The dogfood folder holds 97 concepts: 32
capabilities, 4 domains, 58 elements (`list_kinds`, 2026-11-25); Git judges 25 of the 32
capabilities stale (`CAP/hex-rest.json`).

- **Flat** names 4 domains and 17 of 32 capabilities at rest, with element dots and dependency
  lines between domains (`CAP/flat-rest.png`). Its selection scene scored 3 of 5 on four verdicts
  (`docs/specs/2026-11-25-map-selection-scene.md:33-37`).
- **Hex** draws one tile per capability, a domain as a region round its title tile, placement that
  never moves (`src/widgets/ontology-map/model/board/hex-board.ts:2-8`). At 1512 it opens at cell
  radius 56 with all 37 names drawn (`CAP/hex-rest.json`).
  - *Gold is the ground.* 25 of 32 rims are amber, one tone, so the exception is the current tile
    (`CAP/hex-rest.png`). The file that moved is printed only under the Stale only chip
    (`CAP/hex-stale-only.png`).
  - *States leave their cell.* Faces stand 8 px apart from radius 44, 6 px from 28 and 3 px below
    (`hex-board.ts:472-474`); a hovered face grows 2 px under a 14 px blur and a selected one 4 px
    under a 20 px blur (`src/widgets/ontology-map/board/board-paint.ts:215-218`), over the six
    neighbours' rims (`CAP/hex-selected-mcp.png`).
  - *Direction is not legible.* Depends-on and used-by lines take two inks (`board-paint.ts:224`)
    that read as one pale violet on the still, and the key's two arrows look alike.
  - *The panel cuts tiles.* With the detail panel open, three tiles of the right column are cut at
    x 1128 (`CAP/hex-selected-mcp.png`); a domain selection fits (`CAP/hex-selected-domain.png`).
  - *The hover plate covers the board.* It lies over the project tile (`CAP/hex-hover-vgq.png`).
  - *The far band is a honeycomb.* At 300 capabilities the fit is radius 8 with tiles 13 px centre
    to centre: 319 near-identical cells (`CAP/hex-300.json`, `CAP/hex-300-rest.png`). At the dogfood
    folder's far zoom the nameplates leave their regions and one covers tiles
    (`CAP/hex-zoom-pips.png`). The pips band (radius 28 to 44) was not captured: unknown.
  - *Elements are told twice,* by face brightness (`hex-board.ts:114-120`) and by dots; the key is
    two rows of 11 px under three chips (`messages/en/topology.json:17-25`). Capability names draw
    at 11.5 px (`hex-board.ts:40`).
  - *Relief hides words.* Prisms cover two domain tiles' count lines (`CAP/hex-relief.png`); heights
    for 0 to 9 dependents differ by a few pixels, so the printed number carries the reading.
  - *A line between domains ends on a capability's corner* (`CAP/hex-rest.png`).
  - Zero capabilities: not read, unknown.
- **3D** is one tree: project trunk, domain bough, capability branch end, element leaf, at most
  1,500 marks a frame (`src/widgets/ontology-map/model/tree-view/tree-detail.ts:14`). Domain names
  read first (`CAP/tree-rest.png`). The selected capability carries no name on the canvas
  (`CAP/tree-selected.png`). At 300 capabilities marks pile at branch ends and domain names lie on
  marks (`CAP/tree-300.png`).
- **Neural** draws cells in domain clusters and dependency tracts; a selection spreads to every
  dependent hop by hop (`src/widgets/ontology-map/model/dome-view/neural/neural-impact.ts:3-12`,
  `docs/DESIGN-SYSTEM.md:269`). At rest amber cells (74 stale, by its key) and crossing tracts fill
  the picture (`CAP/neural-rest.png`).
- **Domain structure** is a DOM browser of recorded membership (`contains` and `belongs_to`,
  `src/widgets/ontology-map/structure/structure-index.ts:12`). It alone says that a concept is also
  shown under another parent (`structure/DomainStructureMap.tsx:145`; eight of the nine element
  cards in view on `CAP/structure-open.png`) and lists concepts no path from the project reaches
  (`structure-index.ts:33`, `DomainStructureMap.tsx:152`). The concept list keeps the first of
  several parents (`src/widgets/topology-index-panel/lib/selection-path.ts:5`). Whether the detail
  panel names every parent was not read: unknown.

**Closest marks, at rest on the dogfood folder at 1512** (edge to edge, from each view's own mirror
of its marks):

| View | Least gap | Source |
|---|---|---|
| Flat | 12 px at the overview on both sample folders; a selected or hovered mark grows into its neighbour | The lead's measurement, 2026-11-25; not re-measured here |
| Hex | 8 px between faces; hover and selection paint past it | `hex-board.ts:472-474`, `board-paint.ts:215-218` |
| 3D | 2 pairs of capability marks overlap (by 9 px and 0.6 px); 4 pairs under 4 px | `CAP/tree-rest.json` |
| Neural | 6 pairs of cells overlap (by up to 11 px); 11 pairs under 4 px | `CAP/neural-probe.json` |

## Problem and alternatives

**The cause.** Views were added and removed one at a time, each judged as a picture: ten besides
Flat since 2026-08-18 (`pnpm decisions:find 3d`, `hex`, `structure`), and two of today's five carry
the same falsifier, "name a capability's domain and point at the stale ones"
(`docs/records/decisions/2026-09-25-map-hex-board-view-6de28f78-9886-47b8-a266-d4c3b2957758.md`,
`docs/records/decisions/2026-11-15-map-3d-becomes-a-tree-069e83f7-4370-472d-84f2-5c1b956ae634.md`).
No view is held to a question, so none can lose to another, and M3 has no picture at all.

**Ranked by what each returns to the person, against cost:**

| Rank | Problem | Returns | Cost |
|---|---|---|---|
| 1 | Marks that cannot be told apart (the owner's words; all four views) | Every later reading depends on it | M |
| 2 | Hex says "stale" 25 times in one tone, with no reason (M5) | The one question only Hex owns | M |
| 3 | No picture of a change (M3) | The product thesis' own moment | L |
| 4 | Neural and 3D below the bar | M2 across hops, M4 | M each |
| 5 | No reading order (M1) | The people learning agents, and those without them | M |

Rank 1 comes first because it is what the owner saw, and a board whose tiles blur cannot carry rank
2 or 3. Rank 3 is worth more than rank 2 but stands on a Hex that can be trusted, so it follows.

**Three ways to give back "the right picture for the question":** the *status quo* (five rows, each
polished as a picture) keeps the overlap and the M3 gap. *One view with lenses* (Flat only) loses
the board whose places never move, the only ground a change can be laid on and found again. *A view
per question* (nine or more rows) is the growth of modes the owner has rejected. **Chosen: four
views, one question each, and every new representation enters as a state of an existing view.**

## The views

Scores are the planner's reading of the stills (legibility / hierarchy / composition / consistency
/ craft), not an independent verdict; criterion 8 is the verdict.

| View | The question it owns | Earns its place | Today |
|---|---|---|---|
| **Flat** (default) | If this moves, what moves with it, and where do those live? (M2, M1) | Yes: the only view where position is the relation | Rest 4/4/4/3.5/4; selection 3 overall, in repair |
| **Hex** | Which recorded meaning can I no longer trust, and where is it? (M5; the ground for M3) | Yes, once it ranks and explains: every capability named in a place that never moves | Rest 4/3/3.5/3/3.5; selected 3/3/3/3/3; far band 2/3/2/2/2 |
| **3D** | What is the system made of, in what proportion? (M4) | Not yet: today it repeats Hex's question. It stays, as the owner's choice of 2026-11-15, with this one job | Rest 3.5/4/4/3.5/4; selected 2/3/3.5/3/3; at 300: 2.5 |
| **Neural** | How far does a change travel, hop by hop? (M2) | Yes: the only view that draws more than one hop | Rest 2.5/3/3/3/3.5; at 300: 2.5 |

So that each can win its own question: Hex draws no relation at rest except between domains (as
today); 3D and Neural are no longer asked for domain membership and stale counts, which Hex answers
from a still.

**Separation is a requirement of every view.** In every state (rest, hover, selected, lit) and at
every zoom, no two drawn marks, rims and glows included, come closer than 6 px edge to edge:

| View | How it is guaranteed |
|---|---|
| Flat | The room rule of `2026-11-25-map-selection-scene.md` (its criterion 7): a growing mark pushes its neighbours by the overlap |
| Hex | A state never changes a tile's size; rim, ring and glow stay inside the middle of the gutter; below radius 28 no single tile is drawn |
| 3D | Marks that would stand closer fold into the counted mark the tree already draws, and open under zoom; the pressed mark is the frontmost |
| Neural | Cells of one cluster keep the floor at the resting pose; in a turned pose the focus and its lit ends never overlap each other or a name |

## New representations

```
A change on the board      B time strip            C reach by hop          D matrix
 [ ][c][ ]   c code moved   |--o---o-o-----o--|    (x)>( )( )>( )>( )        A B C D
 [r][ ][b]   r record       the map as it was      hop 1    2     3       A . 3 . 1
 [ ][ ][ ]     rewritten    at the chosen commit   3 concepts, 5, 2       B . . 2 .
 [12 changed files not on the map]                                        C 1 . . .
E reading order            F transit lines         G area by code size     H agents at work
 (1)->(2)->(3)              ==o==o==o== sign in     +------+---+            [ ][a][ ]
   \->(4)   providers       --o--o----- checkout    | auth |pay|            [ab][ ][ ]  a, b: two
 step 2 of 9, its text      stations = capabilities +---+--+---+            rooms on one tile
```

| | Question | Why Atlas | Cost on today's renderers | Risk | Verdict |
|---|---|---|---|---|---|
| **A** | M3: what a change touched, by meaning, and what the map does not know of it | Only Atlas joins changed paths to recorded meaning | L on canvas 2D: three tile states and one counted plate; the match of `2026-11-23-review-agent-work-by-meaning.md:137-146` | A path match is partial; an unlit tile reads as "safe" | **Pursue: a state of Hex while a review is open** |
| **B** | When did this part go stale or get rewritten? | Meaning has a history in Git | L: a read of the folder at a commit | `?recent=` already lights the last days (`url-state.ts:50-54`) | Later, as the range of A |
| **C** | M2 across hops | Recorded dependencies | S in Neural: `countAt` exists (`neural-impact.ts:9`) | None new | Folded into Neural's slice; no new view |
| **D** | Which domain depends on which | The typed relation | M in DOM | 4 by 4 says nothing; 300 by 300 is a dot field | Rejected: Hex's lines between domains answer it |
| **E** | M1, M4: in what order do I read this? | The order comes from recorded dependencies | M in Flat: numbers on marks, one path, a stepper in the panel | Sparse dependencies give an arbitrary order; one more mode | **Probe only; build if it passes** |
| **F** | How does a request flow? | None today | XL: a router | The schema holds no ordered flow (`docs/ONTOLOGY-ATLAS-SPEC.md` §5); it would be invented | Rejected |
| **G** | How much code does each part hold? | The share on the map | M | Territories left on 2026-10-17 (record fa1f007c) and a code city was rejected on 2026-11-15 (record 069e83f7); unequal areas imply unmeasured importance | Rejected; the share stays the map's top chip (`2026-11-24-map-analysis-record.md`) |
| **H** | Which parts are agents on now; are two on one? | Rooms joined to capabilities | S after A | Belongs to Work status slice 5 | Later, as a second source of A |

**A, in Hex, because** a change needs ground that does not move: the reader finds the same tile
before and after, and equal tiles say nothing about importance. It shows three facts per tile (the
code under it moved, its record was rewritten, both) and one plate at the board's edge counting the
changed files the map does not hold. It is what the map draws while the review body of
`2026-11-23-review-agent-work-by-meaning.md:134-136` stands at its right inset. It builds only after
a sealed probe on ten real changes: readers with the board miss fewer effects than readers with the
diff and its summary, and hold no more wrong beliefs.

## Hex plan

**What Hex is for.** The board of the record: one named place per capability that never moves, and
on each place whether its recorded meaning still matches the code, why not, and since when.

| Slice | Change | Size | Fails when |
|---|---|---|---|
| **H1** (this spec) | Tiles keep apart in every state and zoom; below radius 28 a region is one shape; the panel cuts no lit tile; one separation measure for all views | M to L | Criteria 2 to 6 |
| H2 | Selection on the board: Flat's two direction inks on lines and key; hover facts in the tile's own face, no floating plate; a line between domains starts and ends on the domain tiles; no line under a name | M | A reader cannot say from a still which lit tiles the selection depends on |
| H3 | Stale has a reason and a rank at rest: the moved file and how long the code has been ahead on the tile, amber in three steps by that age, and a face each for "unknown" and "no code path" | M | A reader cannot name the three longest-stale capabilities from a still |
| H4 | One key in one row; elements told once (dots); names at 12.5 px where the cell allows; "Domain names only" leaves, since the far band now says it | S | The key wraps at 1280, or any name is under 11.5 px |
| H5 | Relief: prove or remove, by the falsifier of record 69cb6579 (relief against number-only stills) | S, then M | Readers rank dependents slower in relief; then the pose goes and the number stays as a corner figure |
| H6 | A: the change on the board | L | Its probe above |

### The first slice (H1)

1. **A state is ink, never size.** Hover: the rim takes the accent ink and the name its strong
   weight. Selected: a 2 px accent rim and an inner tint. Lit end: the rim in its line's ink. Any
   glow is clipped at the middle of the gutter. *Rejected:* pushing neighbours as Flat does (a
   tile's place is the promise of the view).
2. **Below radius 28 a region is one shape.** Each region draws as the outline of its cells with no
   inner walls, its plate (`plateSub`, `plateSubStale`) inside it when it fits and otherwise touching
   its edge; the project keeps its plate; lines between regions stay. Zooming past 28 opens the
   tiles on the existing band crossfade. *Rejected:* smaller tiles with wider gutters (still a field
   of identical cells, the kind of picture the owner turned down in the Library on 2026-11-21).
3. **The panel cuts no lit tile.** On a selection the board moves the least that brings the selected
   tile and the tiles its lines end on wholly into the free map; when they cannot all fit at the
   current zoom, the selected tile comes first and the rest by nearness. A click on a tile already
   clear moves nothing.
4. **One measure.** A probe reads each view's mark geometry in each state and zoom and reports the
   least gap; Hex and Flat must hold 6 px, 3D and Neural record today's figure as a ceiling until
   their own slices.

## What the Domain structure view leaves behind

Its removal is planned elsewhere. Three abilities exist only there and must land with the removal:

1. **"Also under N other concepts."** The detail panel's kind line names every parent of the
   selected concept, each a link.
2. **Concepts no path from the project reaches.** They stay reachable as top-level rows of the
   concept list (`src/widgets/topology-index-panel/lib/use-index-root-window.ts:19`), and Hex and 3D
   say how many concepts they do not draw.
3. **A reading of membership without a canvas.** The concept list is that reading; the removal
   checks that a keyboard walk reaches every concept the structure view reached.

Nothing else is absorbed: its cards and breadcrumb repeat the concept list.

## Flow

1. When the person opens Hex on a folder whose board fits at radius 28 or more, Atlas draws one tile
   per capability with at least 6 px between faces.
2. When the board fits only below radius 28, Atlas draws one shape per domain with its name and
   counts, and tiles appear as the person zooms in.
3. When the pointer rests on a tile, Atlas changes that tile's rim and name ink; no neighbour's
   pixel changes.
4. When the person selects a tile, Atlas marks it, lights its lines and moves the board only as far
   as rule 3 needs; the detail panel opens as today.
5. When the selection has more ends than fit beside the panel, Atlas keeps the selected tile whole
   and the panel lists every end; the board does not zoom out by itself.
6. When Git evidence is missing or unreadable, Atlas draws every state the same way with the unknown
   rim and says so in the key (`evidenceUnreadable`, `evidenceAppOnly`); no tile is drawn as current.
7. When the person presses Escape, Atlas clears the selection and returns the board to where the
   selection moved it from.

## States

| State | Web | macOS app |
|---|---|---|
| Empty (no capability) | The project tile alone with `projectMeta`; the concept list's add rows stay | Same |
| Loading | Tiles draw at once; key says `evidenceAppOnly` | Tiles draw at once with unknown rims; key says `evidenceReading`, then `evidenceMeasured` |
| Error | `failed`: Flat is shown instead | Same; unreadable history: `evidenceUnreadable`, board still drawn |
| Partial (no code path named) | `evidenceNoPaths` | `evidenceNoPaths` |
| Hover | Rim and name ink on one tile; the existing hover plate until H2 | Same |
| Selected, panel open | Selected tile and its ends clear of the panel; Escape returns | Same |
| Far band (radius under 28) | One shape per domain with `plateSub` | The same with `plateSubStale` |
| Largest measured vault | 300 capabilities at 1512: 18 shapes, 19 plates; 10,000 measured for pan only (record 69cb6579) | Same; not yet walked in the installed app |

## Copy

None — H1 adds and changes no word. It reuses `hexBoard.plateSub`, `plateSubStale`, `projectMeta`
and the five `evidence*` keys (`messages/en/topology.json:14-16`, `:25-29`). H3, H4 and H6 need new
words and write them into the catalogues with their own specs.

## Edge cases

- **Zero, one, largest:** zero capabilities draws the project tile; one draws one region of two
  tiles; 300 opens on 18 shapes; 10,000 keeps the pan figures of record 69cb6579.
- **First run:** the first-open assembly is unchanged; shapes arrive on the same clock as tiles.
- **Hangul input:** a two-line Korean name keeps its face (the dogfood board is the Korean case);
  search and the concept list are untouched.
- **Moved, renamed or unreadable folder:** the kept placement belongs to the folder; an unreadable
  one shows `failed` and Flat.
- **Two edits at once:** a capability added while a tile is selected takes its region's next free
  cell; no placed tile moves and the selection holds.
- **Offline:** nothing here uses the network.
- **Relief:** H1 applies at pitch 0. Relief keeps today's drawing until H5.

## Out of scope

- Removing Domain structure: another planner owns it; this spec states only what must land with it.
- Flat's selection scene: `2026-11-25-map-selection-scene.md`.
- The far band's stale share, new copy and the key: H3 and H4, so that H1 changes no word.
- A new picker row, renderer or library: every chosen representation is a state of Hex or Flat on
  canvas 2D (`AGENTS.md`, renderer sentence).
- Repairing 3D and Neural: they get the measure now and their own slices later.

## Acceptance criteria

Reference set: the dogfood folder, the 300-capability fixture and a 2,000-capability one from the
same generator, at 1280, 1512 and 1920 wide.

1. **The moments, observed first.** Given the installed app on the owner's folder, when one person
   walks M1 to M5 in each of the four kept views, then the recording and a five-second fresh-reader
   baseline on Hex stills (a named capability's domain; the stale ones; whether two neighbouring
   tiles are one or two) exist before the build. Installed-app walk and sealed probe, attached to
   the pull request.
2. **Hex keeps apart.** Given every tile at rest, hovered, selected, lit and under keyboard focus,
   at radius 28, 44, 56 and 96, then faces stand at least 6 px apart and no pixel of one tile's
   rim, ring or glow lies past the middle of its gutter, on every frame of the change.
   `tests/e2e/map/hex-board/map-hex-board.spec.ts`.
3. **No field of cells.** Given a board that fits only below radius 28, then no single capability
   tile is drawn, each domain is one closed outline, and each plate lies inside or touches its own
   shape and overlaps no other shape or plate; at 300 on 1512 there are 18 shapes and 19 plates.
   Same spec, the 300 case.
4. **The panel cuts nothing lit.** Given any selection with the detail panel open, then the selected
   tile lies wholly in the free map, as do all its line ends whenever their box fits there; given a
   click on a tile already clear, then the board moves 0 px. Same spec.
5. **Places and motion hold.** Then every tile's cell equals its cell before the slice
   (`src/widgets/ontology-map/model/board/hex-board.test.ts`); no size, position or opacity changes
   by more than one frame's share, and reduced motion lands on the first frame
   (`tests/e2e/map/hex-board/map-hex-frame-work.spec.ts`).
6. **Every view is measured.** Given the four kept views at rest, hovered, selected and lit, at the
   overview and at 1.6 and 2.4 times it, then the probe reports the least gap per view and state;
   Flat and Hex fail under 6 px; 3D fails above 2 overlapping pairs and Neural above 6 on the
   dogfood folder, until their slices set 6 px. A new gate, built through `/gate-probe`.
7. **Recovery proof.** Given the Hex board of the dogfood folder and of the 300 fixture, without the
   concept list, the detail panel or zoom, a fresh reader can orient (name the domain of a named
   capability), judge (point at the stale ones) and tell a hovered or selected tile from each
   neighbour, citing the tile. Fail when fewer than 9 of 10 stills are right, when fewer are right
   than on criterion 1's baseline, or when a reader takes two tiles for one.
8. **Independent verdict.** Given fresh stills of rest, hover, selection and far band from the
   installed app, a designer who has not seen the work scores every item 5 and lists what would
   exceed it; any item under 5 returns the slice.

## Risks

1. **A cleaner board that still answers nothing.** Territories was drawn with care and left (record
   fa1f007c). Answer: criterion 1's baseline, and H3 follows H1 at once; if H3's still does not let
   a reader name the three longest-stale capabilities, Hex goes to the owner as a removal question,
   not to more polish.
2. **States pile up on one view** (Stale only, Domain names only, Relief, then a review). Answer:
   one state at a time and each owns the key; H4 removes one chip and H5 may remove another before
   H6 adds one.
3. **The change on the board fails as the terminal brief did**, whose probe found no gain
   (`docs/records/decisions/2026-11-22-old-cli-deleted-no-terminal-brief-87de58d1-d9c5-41d3-a583-01ae0e4ca893.md`).
   Answer: no build before its sealed probe, and a lit tile always stands beside the count of
   changed files the map does not hold.

## Later

1. H2, selection on the board. Next when H1 is merged.
2. H3, stale with a reason and a rank. Next after H2; first if criterion 1 shows readers cannot use
   the amber.
3. Domain structure's three abilities, with its removal. Independent of Hex; next when that plan is
   ready.
4. H4, one key. Next when H3's words are known.
5. H6, the change on the board. Next when its probe passes and slice 4 of the review spec exists.
6. Neural: a resting picture inside the floor and the count per hop in the key. Next after H6.
7. 3D: the selected name, folding to the floor, and a probe of its one question against Flat and
   Hex; if it loses, the owner decides whether it stays.
8. H5, relief proved or removed. Next when a fresh-reader probe is being run anyway.
9. E, a reading order on Flat, as a probe with stills first. Next when a first-time reader is
   observed not knowing where to start.
10. B and H, a commit range and open rooms as sources of H6. Next when H6 is in use.

Not to do: a fifth view; a second renderer; a treemap, matrix or transit map; redrawing Flat in
another geometry; a field of repeated small marks at any zoom; a score for a concept or a view;
starting any of this before the Flat selection scene in flight is finished.

## Owner question

None. Decided here, each reversible by its named check: four views with one question each; Hex gets
the change lens; 3D keeps the owner's 2026-11-15 choice with one job and a later probe; relief is
proved or removed by its own record's falsifier.

## Revisions

- 2026-11-25: first draft.
- 2026-11-25: the lead added the owner's point that touching marks cannot be told apart; separation
  became a requirement of every kept view, with a row per view and criteria 2 and 6.
