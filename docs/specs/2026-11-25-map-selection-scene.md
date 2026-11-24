---
title: Flat map selection scene
doc_type: spec
status: draft
area: map
date: 2026-11-25
decisions: []
---

# Flat map selection scene

What the Flat map shows the moment a person selects a capability, by a click on the map or a pick
from the concept list or search. `CAP` below is the session scratchpad
`/private/tmp/claude-501/-Users-jinan-orca-workspaces-ontology-atlas-main/7e08f96f-b1d4-4fa8-ba0c-5384fe58c2ab/scratchpad`;
`CAP/round0` is main, `CAP/round3` the working tree of `map-focus-score`, five 1512x900 scenes each.

## Person and moment

A developer who delegates changes to a coding agent is about to change one capability, or has just
been told an agent changed it (`docs/PRODUCT-DIRECTION.md:24-27`). They select it to answer one
question before they act: **if this moves, what moves with it?** Within about five seconds they
must read, in this order:

1. which concept is selected (its name);
2. how much it reaches: how many concepts it depends on, how many depend on it;
3. which those are and where on the map they live;
4. what it is made of (its elements) and which domain it sits in.

Then they act: walk to one of those ends, open the detail, or let go. Why Atlas: the detail panel
already lists the same ends as text; only the map shows where they live and how far the change
reaches across domains.

**Observed or not.** Nothing observed exists for this moment: no walkthrough or recording of a
person reading this scene was found, and the question above is the lead's working concept for Flat,
not a quotation. The evidence is four design verdicts on stills (overall 3/5: legibility 4,
hierarchy 3, composition 2.5, consistency 2.5 to 3, craft 3) and the owner's bar of 4 on every
item, 5 preferred. Criterion 1 therefore captures the five-second read before any build.

## Today

All from `CAP/round3`, positions read off the stills, unless a file is cited. Scene names: vgq, mcp,
psb (Korean), om (Ontology map) and cqg (Construction qualification gate).

- **The name has three places in five scenes:** centred above the disc (vgq, psb); beside the disc
  (mcp, om), where it reads as one more row of the element column; above and right-aligned (cqg).
  The code tries up to eight places (`src/widgets/ontology-map/flat-graph/names/sides.ts:138-143`)
  and keeps "centred above" only when no title, disc, ring or lit line is there (`names/admit.ts:270-275`).
- **Lit lines cross words:** the warm line touches the second element's name and the dotted line
  runs through the project's title (vgq); the nine-line bundle runs over a neighbour's name (mcp).
- **Lines end without a name:** two lit lines end on an unnamed dim dot in the left cluster (vgq),
  against the falsifier of `docs/records/decisions/2026-10-15-flat-named-end-counts-7210d0c9-9a2b-4bf6-a654-09e2ee441c9c.md`.
  A line whose end is off the free map now carries a tag at the edge, "← name" or "name →"
  (`frame/exit-tags.ts:70`, `:144`; mcp, vgq, psb).
- **Nine lines merge:** each is a taper 3.4 px wide at 0.9 alpha
  (`app/styles/map-graph-tokens.css:104-105`); near the selection they read as one slab (`z_mcp.png`).
- **The domain still outweighs the selection:** its title is 19 px against the selected name's
  17 px (`map-graph-tokens.css:72`, `:85`), faded to 45 % with its census line gone
  (`frame/name-plan.ts:11`, `:30-31`); its disc is 16 px against 11 px (`:29`, `:82`) and draws
  with a lit rim beside the selection (`z_vgq.png`, `z_mcp.png`).
- **Framing follows the far ends:** a list or search pick asks for the middle of the free map
  (`ui/camera/use-topology-focus-navigation.ts:273`, `model/camera/flat-selection-camera.ts:86-89`),
  yet lands at about (938, 240) in vgq, 190 px from the detail panel, because the framed set must
  fit first and the camera cannot zoom out below the overview.
- **Elements stand in a column with one spoke each** (`flat-graph/open.ts:132-138`,
  `frame/plan-marks.ts:218`); the spokes read as a wedge when the column slides down (`z_vgq.png`).
  A dot may open to 8 px radius (`map-graph-tokens.css:95`), as wide as a small capability.
- **Chrome shows behind the detail panel:** tool tiles above its top edge and three slivers to its
  right at x 1480 to 1490 (all five stills); lit line pieces in the gap between the rail and the
  concept list (`z_gutter.png`). The DOM that fades them was not read: unknown.
- **Words:** English says "Depends on" and "Used by" in the count line, key and panel
  (`messages/en/mapDial.json:24-25`, `:32-33`, `messages/en/conceptReach.json:2-3`). Korean says
  "used by" with a short noun in the count line (`messages/ko/mapDial.json:33`) and a longer phrase
  in the key and panel (`messages/ko/mapDial.json:25`, `messages/ko/conceptReach.json:3`).
- **Measured size:** the dogfood folder holds 97 concepts (`list_kinds`, 2026-11-25). Its largest
  selection is `capabilities/mcp-tool-server` with 9 + 2 relation ends; the most elements is 8
  (`capabilities/repo-structure-analysis`), counted from `docs/ontology` frontmatter today.

## Problem and alternatives

**One cause, eight symptoms.** Nothing in the scene has precedence. The name looks for room the
lines left, the element column for room the lines and the name left, the camera for a view the far
ends allow, and every far end sits where the world layout put it. Each local fix moved one part and
handed its problem to the next, which is why four rounds did not move the scores.

**Ranked by what each returns to the five-second read, against cost:**

| Rank | Named problem (brief's number) | Returns | Cost |
|---|---|---|---|
| 1 | Name has no anchor (1) | The first read; every later rule measures from it | S |
| 2 | Lines through text, slab, unnamed or hidden ends (2, 7, 3) | The second and third read | L |
| 3 | Framing (5) | A whole, steady picture for list and search picks | M |
| 4 | Element form and weight (6) | The fourth read without a wedge | M |
| 5 | Domain outranks (4) | Hierarchy; mostly in the working tree | S |
| 6 | Chrome behind the panel (8) | Craft only | S |

The name comes first because it is cheapest and every other part needs its place fixed. Lines are
next because they carry the question the person came with.

**Status quo** (keep patching part by part): four rounds show its ceiling is 3. Rejected.

## Directions compared

Six ideas of what a selection is. Scores are my expectation for legibility / hierarchy /
composition / consistency / craft, not a verdict.

```
A in place          B gather                C sheet             D ports
      Name            used by   Name   needs   +-----------+        Name
       (O)--..-> x     o--\     (O)   /--o     | Name      |     <2 (O) 5>
      / :              o---\--  /|\ --/--o     | o-(O)-o o |      /   \
     x  elements       o---/   els   \--o      +-----------+   x lit   x lit
   ends where they     ends take seats         diagram over     no lines; ends
   live on the map     beside the selection    the dimmed map   lit in place
```

| | Selection is | Read in 5 s | The eight defects | Motion risk | Dozens of relations | Cost | Scores |
|---|---|---|---|---|---|---|---|
| **A. In place** | A light on the map as it stands | Name; lines to named ends where they live | Fixes 1, 4, 6, 8 by rule; 2, 3, 5, 7 only as far as the world layout allows | Low: inks and lines | Needs grouping or it is a slab | M to L | 5/4/3.5/4/4 |
| **B. Gather** | The neighbourhood rearranged to answer: used-by one side, depends-on the other, elements below | Best: a dependency diagram | Fixes all eight by construction | Highest: dozens of marks travel hundreds of px on a press and back; each walk reshuffles | Rows and "+N" | XL: second layout, moving press targets | 5/5/5/3.5/4 |
| **C. Sheet** | A diagram lifted over the dimmed map | As B | As B, on a copy | Medium: copies fly to seats | Good | L | 5/4/4/3/4 |
| **D. Ports** | A junction: counted exits on the ring by direction and domain, no long lines | Counts by direction; ends lit, unconnected | Fixes 2, 3, 5, 7; which end belongs to which exit is guesswork | Low | Best: bounded by domains | M | 4/5/5/4/4 |
| **E. Sentence** | Text at the node: "depends on ..., used by ..." | The panel, again | Fixes 2, 3, 7 by drawing nothing | Low | A paragraph on the canvas | S | 4/4/3/2/3 |
| **F. Routes** | A transit map: lines in lanes round every word | Each line traceable | Fixes 2, 7; not 1, 4, 5, 6 | Medium: routes must not flip in a pan | Lanes widen to ribbons | XL: obstacle router | 5/4/4/3/3 to 5 |

- **B scores highest on a still and is not chosen for a click.** It gives up the one thing only the
  map says, where the ends live, and repeats the panel as a picture. A press that moves a dozen
  marks is the terrain change on click the owner has rejected before, and walking from end to end
  reshuffles the view at each step. It is kept as the first Later slice behind an explicit gesture
  (double-click or Enter, which already mean "frame this"), and is the Owner question.
- **C** shows each concept twice and covers the neighbours the selection just lit, the reason the
  panel docks right (`docs/records/decisions/2026-10-15-map-panel-right-dock-b733ad46-4fc3-48ed-b3d7-9b03a61d34d6.md`).
- **E** lists the same names a third time (concept list, panel, canvas).
- **F** as a whole router costs most and reads foreign on an organic layout.

**Chosen: A, with three borrowed ideas.** From D, grouping and counted exits: lines to one far
domain run as one line with a count, and an end off the free map is a named tag at the edge. From
F, courses decided once and lanes: a line bends round the selection's own words and never lies on
another line. From E, one line of words: the count line's figures take their line's ink, so the
name block is the key to the picture.

## The scene

One order of precedence replaces the search for free room: **the selection's group, then lines,
then far names, then the camera.** "Group" means the selected disc and ring, its name block (name
and count line) and its element column.

1. **Name block: one place.** The block stands centred above the ring at one gap, in every scene
   and for every source, for capabilities and elements. What yields: a lit line takes a course
   round it; a neighbour's name takes another side; the domain's title takes the side of its disc
   clear of the block, or is not drawn (the panel's first line names the domain); a disc standing
   there is cleared by the frame's zoom-in, else pushed just past the block. The count line's two
   figures draw in their line inks, after the domain's name ("Meaning layer · Depends on 7 · Used
   by 1"). The domain becomes an address read in the block, not a landmark competing with it. *Rejected:* beside the disc (today's fallback: it reads as a
   neighbour's label); a caption pinned to the top of the free map (it leaves the mark).
   *Raises:* consistency, hierarchy, legibility.
2. **Hierarchy: three steps, by ink and type, never by a size change.** Step 1, the selection: the
   largest name on the canvas (`--map-graph-selected-name-px` 20, above the domain's 19), the
   strongest ink, the only glow. Step 2, what it reaches and what it is made of: lit, named, at
   their resting sizes. Step 3, its domain: the disc keeps its radius but gives up its fill, so it
   reads as a hairline outline of the same size at resting ink, with no lit rim and no glow; its
   title and census line go, because the name block now carries the domain's name. Other domains
   sink as today. Every change is a crossfade on the selection's clock (fill alpha, ink), so no
   radius changes. Weight follows ink area, not radius: a hollow outline of the domain's size
   carries a fraction of the selected filled disc's ink. *Rejected:* shrinking the domain disc (it broke the
   radius-rate contract, and size is how Flat says kind, `docs/DESIGN-SYSTEM.md:79`). *Raises:* hierarchy.
3. **Elements: a strung column, as counterweight.** The elements stand in a column beside the disc
   on the side away from the mass of its lit ends (the mean direction of its drawn ends, weighted
   by line width; the domain's side breaks a tie), chosen once per selection, the first row level
   with the disc and the rest running down, names outward. What the selection is made of fills the
   side its relations leave empty, so the group balances itself.
   One hairline leaves the ring, turns once and runs through the dots: no spoke per element. A dot
   is 4 px in radius, smaller than any capability disc; the whole row (dot and name, 22 px tall)
   takes the press. An element that also depends on the selection takes that direction's ink on
   its dot and name instead of a second line. More than seven split into two columns, as today.
   *Rejected:* spokes (the wedge); a column straight below the disc (in psb the domain disc is
   there). *Raises:* composition, craft.
4. **Lines: grouped, named at both ends, off the words.** In the selection's own domain each
   relation is one line. To another domain, the relations of one kind (depends on, used by,
   related, broader) run as one tapered line whose width says how many, with the count in that ink
   beside the far domain's name; inside that domain it splits into thin strands to each end that
   has a name. Every lit line ends at a named mark or at a tag; an end with no room for a name
   folds into its domain's count. A line that leaves the free map fades out and ends in a tag at
   that edge: the end's name, or the domain's name and count, with an arrow that means only
   "continues this way". Direction is said by ink alone. A line's course is chosen once, when the
   selection is made, and holds through pan and zoom; lines that run together run side by side.
   **The crown stays quiet:** no line leaves the ring through the 90° sector under the name block;
   a line to an end above departs from the ring's side and bows up, so nothing near the selection
   can cross its block, in any scene. **Lines pass under words, not plates:** where a lit line
   crosses another name, the line is knocked out along the glyphs' own outline widened by a few
   pixels (the cartographer's halo), instead of a rounded backing plate. A crossing reads as the
   line passing beneath the word.
   *Rejected:* one line per relation (the slab); no long lines (D). *Raises:* legibility,
   composition, craft.
5. **Framing: two intents.** *Arrive* (concept list, search, panel link, deep link, arrow key,
   double-click, Enter): the frame composes the relationship, not the node. The selection lands on
   the third of the free map opposite the mass of its ends, leaving lead room in the direction its
   lines run, as a photographer frames a subject facing the way it looks; with ends on all sides it
   lands in the middle. The point keeps the most named ends in view. *Stay* (a single click on the map): the map moves
   the least that brings the whole group inside the free map, and not at all when it already is.
   Both keep the group whole, clear of panels, key and tool row; the zoom-in rules and the return
   on letting go are unchanged. *Rejected:* fitting the far ends first (today: the selection lands
   at an edge); centring on every click (the map jumps under the pointer). *Raises:* composition.
6. **Edges and chrome.** A control the detail panel touches is hidden whole; none is cut by the
   panel's edge. No lit line draws outside the free map. *Raises:* craft.
7. **Motion.** Enter: ring and name block rise first (`--motion-fast`), lines draw outward and each
   far name rises as its line lands, the column strings out top to bottom; all landed within
   660 ms, the first-open budget (`docs/DESIGN-SYSTEM.md:260`). Switch: everything starts from the
   picture on screen; the old block fades as the new one rises. Leave: lines retract, the column
   strings back, the domain's ink returns, the camera returns as today. Reduced motion lands each
   state on its first frame. *Raises:* craft.
8. **Scale.** The lines arriving at the selection are bounded by its own domain's relations plus
   four per other domain, whatever the relation count.
9. **Room: no mark touches another, in any state.** At rest every pair of marks already keeps at
   least 12 px edge to edge at the overview (measured 2026-11-25 on both sample folders), but a
   growing mark has no limit outside an opened domain star: the selected disc grows toward its
   selected radius and adds a ring 6.5 px out, and hover adds 3 px, so a selection or a hover eats
   the gap and touches its neighbour (owner screenshot, 2026-11-25). Rule: a mark that grows makes
   its own room. Neighbours within its grown radius plus the rest gap ease outward along the line
   between centres, by exactly the overlap, on the growing mark's own clock, and ease back as it
   shrinks; their lines and names ride with them. Where pushing would cross a third mark, the
   growth stops at the room it has instead. *Rejected:* a wider resting layout (it spreads every
   map to fix two states); clamping growth everywhere (the selection must stay the largest mark).
   *Raises:* craft, legibility.

Records this amends, for the lead's decision record: `2026-11-13-flat-selection-one-frame-f11219c8`
(one frame for every source becomes two intents); `2026-11-16-flat-domain-opens-star-65cda06c` (a
selected capability's elements no longer open by room); `2026-10-15-flat-named-end-counts-7210d0c9`
is extended from domain to capability selections, with bare counts; `docs/DESIGN-SYSTEM.md:91`
(the selection's domain keeps resting ink) and `:73`.

## Flow

1. When the person clicks a capability on the map, Atlas lights it where it stands, raises its name
   block above it, strings out its elements, draws its lines, opens the detail panel, and moves the
   map only if part of the group would be covered.
2. When the person picks a capability in the concept list or search, Atlas travels to it so it
   lands in the middle third of the free map, then shows the same picture as step 1.
3. When an end lies under a panel or off the canvas, Atlas ends its line at the edge with a tag
   naming it; the panel's list still names every end.
4. When the capability has more relations than names fit, Atlas folds the unnamed ends into their
   domain's count, so no line ends without a name.
5. When a recorded relation names a concept the folder no longer holds (an agent wrote a
   dependency on a slug that does not exist), Atlas draws no line for it, and the count line's
   figures equal the ends drawn, tagged or counted. How the panel lists that row today is unknown.
6. When the person selects another concept while one is selected, Atlas moves from the picture on
   screen to the new one without passing through the resting map.
7. When the person presses Escape, closes the panel or clicks empty map, Atlas retracts the scene
   and returns the camera unless they moved it (`2026-11-13-flat-deselect-returns-untouched-view-a047a703`).

## States

| State | Web | macOS app |
|---|---|---|
| Empty: no relations, no elements | Name block with no count line (`mapDial.reachNeeds` and `mapDial.reachNeededBy` omit zeros); the domain steps back; the panel says what the concept is. Next: open detail or let go | Same picture. Next: the same |
| Loading: a pick while the first map is still assembling | The assembly finishes from where it is and the selection scene follows; no mark jumps. Next: wait under 1 s | Same; checked on the installed app, where a late frame must not skip values |
| Error: a relation to a concept the folder lacks | No line for it; the count line counts drawn ends only. Next: the panel row | Same |
| Partial: ends off the free map | Tags at the edge in the line's ink. Next: pan, or pick the end in the panel | Same |
| Switch: one selected, another chosen | Crossfade from the picture on screen. Next: keep walking | Same |
| Largest measured (97 concepts, 9 + 2 ends, 8 elements) | Own-domain lines plus one grouped line per other domain and kind arrive; every end named, tagged or counted; two columns of four elements. Next: walk to an end | Same; the map stops drawing once landed |

## Copy

None — no string is added or changed. The count line keeps `mapDial.reachNeeds` and
`mapDial.reachNeededBy`, led by the domain's own name and a middle dot; a tag is a concept's or
domain's own name, a figure and an arrow.

## Edge cases

- **Zero:** no count line, no lines, no column; the block still stands above.
- **One:** one line; one element stands level with the disc on a straight stub.
- **Largest measured:** as the States row. Beyond it, a 2,000-concept fixture with a 40-relation
  capability (criterion 7); a capability over 14 elements is unmeasured and listed under Later.
- **First run:** the web sample map shows the same scene; no folder is needed.
- **Hangul:** names are measured in the drawn font; a tag or block is never cut mid-syllable; the
  Korean count line sits under a 20 px name without widening the block.
- **Folder moved, renamed or unreadable while selected:** the scene leaves as in Flow step 7 when
  the concept goes; today's behaviour was not read: unknown.
- **Two edits at once:** a relation an agent adds while the concept is selected draws in from its
  source; existing lines keep their courses; the count line's figure crossfades.
- **Offline:** nothing here uses the network.

## Out of scope

- **Domain selection** (its opened star, its `→4 ←3` counts): a different scene with its own
  record; bringing it to this grammar is under Later.
- **The other map views** and the detail panel's content: unchanged.
- **Below 1280 px** the concept list already folds (`2026-10-24-narrow-map-selection-index-18ea6278`); no new rule.
- **Korean wording** of "used by" across count line, key and panel: a copy decision of its own.

## Acceptance criteria

Reference set: the five scenes at 1512x900 plus the same five reached by a map click, captured on
the installed app. Geometry is read through the `?e2e=1` probe.

1. **Five-second read (first, on `CAP/round3` as baseline, then on the build).** Given one still
   shown for five seconds to a reader who has not seen the map, when asked the selected concept's
   name, how many it depends on and are used by, two ends by name, and its domain, then all four
   are right in at least 9 of 10 stills, and more are right than on the baseline. Checked by a
   sealed fresh-reader probe; its answers are attached to the pull request.
2. **Name block.** Given any selected capability or element at 1280, 1512 and 1920 wide, then the
   block's centre is within 0.5 px of the disc's centre in x, its gap above the ring is the same in
   every scene, and no lit-line, disc or other name pixel lies in its box.
   `tests/e2e/map/flat-graph/map-flat-graph-selection-frame.spec.ts`.
3. **Hierarchy.** Then the selected name's size is the largest drawn, only the selection has a
   glow, and the domain disc's rim is no brighter than a lit end's rim, measured as mean luminance
   on the still. Same spec, plus `flat-graph.test.ts` for the token order.
4. **Element column.** Given a capability with 1, 7 and 8 elements, then one membership line leaves
   the ring, each dot draws at 4 px radius, each row answers a press anywhere on its dot or name,
   and no name is cut. Same spec.
5. **Lines.** Then every lit line ends at a named mark or a tag; at most one line per other domain
   and kind arrives at the selection; no lit line crosses a name without that name's backing; no
   two lit lines overlap for more than 12 px of run; no lit-line pixel lies outside the free map;
   and the count line's figures equal the ends drawn, tagged and counted. Same spec.
6. **Framing and chrome.** Given a list or search pick, then the selection's centre lies in the
   middle third of the free map and the group lies wholly inside it. Given a click on a mark whose
   group is already clear, then the map moves 0 px. No visible control is cut by the panel.
   Same spec and `map-flat-graph-deselect-refit.spec.ts`.
7. **Room.** Given every capability, element and domain selected, then hovered, at the overview
   and at 1.6x and 2.4x of it, on both sample folders and the 2,000-concept fixture, then no two
   drawn marks (rims and rings included) come closer than 6 px edge to edge on any frame, and no
   pushed mark moves by more than its overlap. Measured from the probe's mark geometry per frame.
8. **Motion and scale.** Given enter, switch and leave recorded per frame, then no size, position,
   opacity or zoom changes by more than one frame's share, no line changes side during a pan, and
   reduced motion is complete on the first frame (`map-flat-graph-motion.spec.ts`,
   `map-flat-graph-star-motion.spec.ts`). Given 2,000 concepts and a 40-relation capability, then
   criteria 2 and 5 hold and every frame stays in budget (`map-flat-graph-scale.spec.ts`). The
   recording is repeated on the installed app.
9. **Independent verdict.** Given the ten stills, a fresh designer scores every item at 4 or more
   and lists what would make each a 5.

## Build order

| Slice | Does | Criteria | Size |
|---|---|---|---|
| 0 | Baseline read probe on `CAP/round3`; geometry read-outs in the probe | 1 (baseline) | S, half a day |
| 1 | Name block anchor, count inks, hierarchy inks and the 20 px name | 2, 3 | S to M, 1 to 2 days |
| 2 | Grouped lines, named or tagged ends, courses round the group, lanes | 5 | L, 4 to 5 days |
| 3 | Strung element column and row press | 4 | M, 2 days |
| 4 | Arrive and stay framing; chrome and edges | 6 | M, 2 days |
| 4b | Room: growing marks push neighbours by their overlap | 7 | M, 2 days |
| 5 | Per-frame motion pass, scale fixture, installed-app walk | 8 | M, 2 days |
| 6 | Read probe and verdict on fresh stills; fix what they name | 1, 9 | S per round |

**The three places the first draft expected under 5, answered by a change of view.**

- *Composition* was lopsided because the frame centred the node. The frame now centres the
  relationship: lead room on arrive, and the element column as counterweight on the empty side.
  A click still composes around where the person pressed; the counterweight is what balances it.
- *Hierarchy* was lost to the domain disc's size. Weight is ink, not radius: the domain becomes a
  hollow outline and an address in the name block, so the only filled, glowing, titled mark of
  its size class is the selection.
- *Craft* showed plates wherever no course cleared a name. The crown rule removes every crossing
  near the selection, and the glyph knockout replaces the remaining plates.

Residual risk: a click on a mark at the free map's edge whose ends all lie toward that edge; the
group stays whole, but the picture is composed by the press. Expect 4.5 there, 5 elsewhere.

## Risks

1. **Courses round the block look bent, or flip in a pan.** Courses are chosen once per selection
   in map space; criterion 7 fails on any side change; a fixture with an end straight above the
   selection is drawn and looked at before slice 2 merges.
2. **Grouped lines hide which end is which.** Strands split to each named end inside the far
   domain, and criterion 1 asks for two ends by name; if readers miss them, the hover slice under
   Later moves up.
3. **Arriving in the middle third carries a search pick far from where the person was.** The return
   on letting go stands; the falsifier of `f11219c8`, "readers ask how to get back", is asked in the
   installed-app walk.

## Later

<!-- The ranked next slices, one line each: what it adds and what would make it next. -->

1. Gather on double-click or Enter (direction B): next if composition stays under 4 after slice 6,
   or readers in criterion 1 cannot name ends that lie off the free map.
2. Pointing at a panel row or a count figure lights only its line: next if risk 2 shows.
3. Pressing an edge tag selects that concept: next when walks show people panning to tagged ends.
4. Domain selection on this grammar (ink for direction, arrows only for "continues"): next after this scene passes.
5. One Korean wording for "used by" on this screen: next with any copy pass on the map.
6. A "+N" row past 14 elements: next when a real folder holds such a capability.

## Owner question

Answered 2026-11-25: the owner handed the decision to the lead. A click keeps every concept where it
stands (direction A); gathering stays Later 1.

## Revisions

<!-- One line per change, newest last: what changed and why. An owner decision after the draft is a revision. A reversal of the spec's core is a new spec that names this one in `supersedes`. -->

- 2026-11-25: first draft.
- 2026-11-25: added "Directions compared" before the chosen scene, on the owner's request to weigh
  different ideas of what selection is and not only fixes to the current scene.
- 2026-11-25: the owner asked for new thinking on the three items expected under 5. Composition now
  frames the relationship (lead room on arrive, the element column as counterweight); hierarchy
  moves weight by ink (hollow domain outline, the domain's name in the name block); craft gains the
  quiet crown and glyph knockout in place of plates. The owner question was handed to the lead.
- 2026-11-25: added scene rule 9 and criterion 7, "room": the owner showed two marks touching
  once one grew. Resting gaps measure at least 12 px; growth outside a domain star had no limit.
