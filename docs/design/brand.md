---
title: Brand — Ontology Atlas
doc_type: design
status: current
area: design-system
---

# Brand — Ontology Atlas

The [2026-11-12 identity decision](../records/decisions/2026-11-12-moru-compass-identity-acd9f35c-ae54-45ae-8f19-0a03ff732b12.md)
owns the compass/Moru split; committed raster sources own the pixels.

## Identity

The compass identifies Atlas in app/OS/browser icons, gateway chrome and README
lockups. **Moru** is the expressive pixel seal in character, welcome, pending and
verified-work slots. The rail remains brand-free; topology hexagons retain their
typed data role. The previous traveler is no longer shipping artwork.

Product promise: **Understand your system as AI agents change its code.**
Category: a local-first codebase ontology workbench. Asset shorthand:
**Understand your codebase.** The compass is an orientation metaphor, not a claim
of automatic understanding, complete impact analysis or safe code. See the
[current product thesis](../PRODUCT-DIRECTION.md#the-atlas-product-thesis).

## Moru

Moru has a low round stone-gray body, ivory cheeks/belly, paired navy eyes,
a small diamond nose, two short whiskers per cheek, indigo front flippers and
a curled forked left tail with an ivory notch. Preserve the selected silhouette.
Moru is a character, not an ontology kind, assistant persona or work detector.

The complete project pack is [assets/brand/moru](../../assets/brand/moru/):
69 authored motions (50 with 24 poses and 19 with 32), 16 explicitly labelled composed sequences and
16 static poses. Sizes/formats never count as additional designs.
Open [preview.html](../../assets/brand/moru/preview.html) locally to play, pause,
scrub frames, inspect 64/128px exports, and download individual assets.
The preview works from a local file or a static server without external requests.

The latest gestures add a somersault, toy-fishing, laptop coding, curious thinking
and quiet pondering, followed by hearts, a giggle, a puzzled frown and a tiny
temper, a flipper groove and two floating-ontology scenes. Thoughtful expressions,
hearts, laughter and the flipper groove join the finite petting
reactions. The larger scenes (including the illustrative ontology), frown and temper stay in the catalogue and README
samples; an application error does not make Moru angry at the person.

Eight further gestures add a soft bow, hat greeting, fish trick, blanket peekaboo,
rosy temper, flipper five, folder peek and bubble chase. The bow, flipper five and
hat greeting join petting; the fish trick is reserved for the download welcome.
Peekaboo and rosy temper remain catalogue scenes. A small pixel
speech bubble responds with a heart, note or sparkle. One note accompanies a
return hop in each longer three-phrase sequence; waiting has no bubble. These original SVG
ornaments stay within the actor bounds, ignore pointer input and share its pause,
visibility and reduced-motion behavior. A still response uses a still bubble.

Eleven gestures for the Work status rooms add typing at a laptop that rises in
front of Moru, reading the room monitor, nodding off, a heads-up for a waiting
session, a sigh, a crate heaved onto the head and patted down through the
floor, a belt lever, a
merge cheer, a galumph along the floor in each direction and settling into a new
room. They are
drawn in code from the neutral pose (see "Rebuild"), so the body, face and
outline are the catalogue's own pixels.

### Cast

| Character | Body / belly | Head piece |
|---|---|---|
| Moru (grey) | `#D6D3C9` / `#FFF1D7` | none |
| Horn | `#E8D1A7` / `#FFF1D6` | two short horns |
| Unicorn | `#DACDF1` / `#F8F0FF` | a striped horn and a pastel mane |
| Dragon | `#B1DDC5` / `#E4F8E4` | none yet |
| Rabbit | `#E8CEC2` / `#FEF0E6` | two upright ears with pink insides |
| Builder | `#D1CCC0` / `#F7EDD9` | a hard hat |

Each Work status room has one of these. A palette swaps only the body fill and
the belly tone, and a head piece drawn in them; the outline, the eyes, the indigo
flippers and tail and the shading stay, so the cast reads as one family. Each
tint has the original tone's luminance (the builder's body 7% less), so contrast
on the canvas and against the outline is the grey Moru's. The one added hue,
pink `#F2B3C6`, is the unicorn's mane and the rabbit's inner ears: character ink
that says which Moru it is, never a token or a status. A head piece is a typed
pixel map on the 64px grid that follows where each pose carries the head,
mirrored on a pose turned to the left, and stays behind a flipper or a prop over
the head; `pnpm brand:cast` doubles it onto the work grid and reduces it with the
catalogue's reducer. Rooms are cast oldest first: each takes the character a
hash of its branch name prefers, or the next one in the cast's order no older
room has, and a character repeats only once all are in use, the least used
first. A room joins the cast when it first shows a Moru; a newer room never
changes an older room's Moru, and the main checkout keeps the grey original. A
character is costume only: every character plays the same rows, so a pose means
what it means on the grey Moru, and it says nothing about which agent or model
is at work. The pieces are generic pastel costume shapes; none copies an
existing character's design or colouring. Body costumes, raised-flipper poses
and the dragon's pieces are not shipped. The scholar's blue-grey `#CAD4E3` waits
for its glasses and scarf: alone, under a room's light, it reads as the grey Moru.

Source sheets, generation prompts and discarded explorations remain in that pack.
`moru-source.json` records source cells and sequence constituents; `moru.json`
records every export, timing and contextual runtime mapping.
The catalogue includes folder opening, source reading, search, relation following,
comparison, proposal review, permission wait, uncertainty, stop, retry, save,
refresh, connection, reply arrival, empty search and returning from rest.
Silent singing, a fish friend, dancing and a miniature Moru chorus are optional
expressive artwork. The chorus keeps its own smaller scene framing. Catalogue
availability does not create an app state.

The refined nod preserves the rounded body through the whole gesture. Nod, hop,
folder peek and shy reaction use separate anticipation, movement, expression and
settle timing. Ambient play joins three different phrases with quiet holds of
different lengths. The starting phrase is chosen once per mounted companion;
resize and visibility changes preserve it. Petting starts gently, then draws a
full context-allowed repertoire in varied order, excluding the two most recent
responses across refills (waiting alternates its two gentle choices). The second
pet reveals a nose-star balance, pup peekaboo or heart gift; the welcome also
offers a sparkle sneeze. These four encounters use 32 poses, as does the redrawn
flipper groove. Folder entry has 14 responses; welcome has 18, including singing
and bubble chasing. Prop-led encounters use their own art without an extra
bubble. A pup peeks out once per long idle cycle, never during pending work.
Randomness
is local, has no persistent state and never supplies work or emotional status.

## Raster grids and palette

| Role | Canonical source | Use |
|---|---|---|
| Full Moru | `assets/brand/mascot/mascot-full-64.png` | Native 64px character |
| Compact | `mascot-compact-32.png` in that directory | Separately simplified 32px face |
| Micro | `mascot-micro-16.png` | Independently simplified 16px face |
| Presentation | `mascot-presentation-128.png` | Larger character compositions |
| Curious portrait | `assets/brand/moru/sprites/128/authored/moru-tilt.png` | Native 128px `tilt` cells on the missing page, the route error, the startup failure, a project the open folder lacks, and a harness, schedule file or Git status that could not be read; a tilted body has no readable face at 32px |
| Compass | `assets/brand/moru/icons/atlas-compass-1024.png` | Smoothly resampled app identity, 16–1024px |
| macOS template | `mascot-tray-template-{16,32}.png` | Black/clear compass mask; 2× is the same logical drawing |

Character enlargement uses integer nearest-neighbour scaling. The 32px and 16px
faces are separately authored; the compass does not use the character detail ladder.
OS density partners keep the same compass geometry.

Navy `#171923`, stone gray `#D6D3C9`, ivory `#FFF1D7`, indigo `#6D73D2`
and muted indigo `#50569C` are raster ink, not application tokens, status colors,
control fills or data colors. The exporter keeps dark achromatic eye shading
neutral without turning bright warm ivory into gray speckles. It registers
the largest connected skin region independently of tails, flippers and detached
props, so a tail briefly separating cannot shift or resize the body.
The rosy-temper clip alone opts into coral `#D96C75` and `#EE9A93`; these are
character ink, never error or control colors. New clips preserve their initial
body scale across the gesture. Raw source files remain unchanged.

Clips are cut, registered and cleaned on one 256px grid, then halved to 128px
and 64px. A source pixel at least half opaque is kept unless the clip declares
its own cutoff, because a thin stroke's soft edge is about that opaque. Cleaning
replaces a piece of one colour smaller than a quarter of a drawn pixel with the
colour around it. The source's ink fades through dark gray, which showed as
gray dashes around the silhouette on the dark canvas: within half a drawn pixel
the soft edge of the outline joins the outline, and the soft edge of a facial
mark dissolves into the fill around it. The lighter gray step of the same fade
(`99968f`) left a one-pixel sliver beside whiskers and under the belly, which at
64px was a whole drawn pixel; within the same reach of any ink it dissolves into
the fill, or clears where it lay outside the outline. Haze thicker than that
reach keeps its inner part, so a few slivers remain (`star-sneeze` beside the
left whiskers). Gray farther in is a drawn surface and stays gray.

Where ink is drawn on ivory the same fade passes through a blend that lands on
the stone body gray, which left gray crumbs between the whiskers and hairlines
along the flipper outline. A stone run thinner than half a drawn pixel that
touches ink and meets ivory by a side takes the ivory, even where it joins the
body; then a stone piece left under four drawn pixels that meets ivory by a
side and otherwise touches only ink does too, so two crumbs a hairline joined
go together. Stone beside indigo, blush, haze or the silhouette is left alone;
crumbs of that kind remain, most of them at the tail tip.

A mark drawn faint has an ink core thinner than a speck, so cleaning left the
whole stroke in the fade's dark gray: a smudge where a whisker should be
(`magic-fish`, `star-sneeze`, `pup-peek`, `bubble-chase`) or a gap where the
flipper outline meets the belly (`connect`). A dark-gray piece enclosed in the
drawing and no larger than a facial mark is that mark when it meets the ivory
of Moru's body by a side, directly or through the haze or stone its own edge
fades into within half a drawn pixel. One at least a drawn pixel long becomes
ink; a shorter one dissolves into the fill, and so does the haze beside
either. The body is the largest side-connected area of light fill, so a prop
with more ivory than the belly (the folder in `no-results`) keeps its gray, and
a belly a flipper splits in two is treated on each side that still joins the
body's fill; where the flippers cut all the ivory off (`peekaboo`) the pass
does nothing. Dark gray on the
silhouette, on the body fill away from the ivory, or larger than a mark stays.
In `connect` frame 13 the piece runs from the left whisker to the flipper
outline, so that whisker gains a short tail; where a faint whisker sat in a
wide stone smudge the smudge stays around the redrawn stroke (`magic-fish`
frame 19).

The still poses of 32px or more are cut on the same 256px grid, cleaned by the
same passes and reduced the same way, so a pose and a clip pose are drawn
alike; they keep the stricter opacity cutoff, because at the clips' cutoff a
detached shadow under `happy-hop` survives. The 16px face is cut at its own
size: its marks are one pixel each and the reduction has no room to redraw
them, so its one fade pixel on the head remains.

Each halving keeps one fixed pixel of every 2×2 block, so a run of pixels
halves in length and a filled square stays a filled rectangle within a pixel of
its true size wherever it sits on the grid. An upright or level ink stroke, or
piece of silhouette, half an exported pixel wide keeps one whole pixel; a
diagonal that thin can be lost at some grid positions, and a coloured detail
inside a fill is kept from one exported pixel. Facial marks (ink enclosed in a
fill, such as an eye, the nose or a whisker) are lifted out first and drawn
back at their own reduced size, centred where the body's sampling puts them, so
a mark's size never depends on where the frame sits on the grid; a size exactly
between two takes the smaller. Marks of one reduced size that share at least
three quarters of their pixels are one drawing made twice and are exported
identically. A mark takes the place within one pixel that covers and touches
the least other ink; where the face is too crowded for a clear place, it may
touch.

The source redraws the whole figure in every pose, so the outline, tail and
flippers of two poses differ by a pixel even where nothing moves. A clip that
declares `restingBody` in `moru-source.json` (today `blink`, the waiting mark)
keeps its first pose's body in every pose between the first and the last. Each
facial mark of a pose claims a mark of the first pose within one and a half
drawn pixels, nearest boxes first and then nearest centres, one each. A pose
whose marks all sit within half a drawn pixel of the marks they claim is the
first pose. Otherwise a claimed mark that is not the same drawing is redrawn
from the pose in the place it took; a pose mark that claims nothing is source
noise, and a first-pose mark that nothing claims stays. The export stops when a
pose leaves an eye unclaimed. The cheek boundary rests with the body, so a
closed eye sits a little further into the ivory than the source drew it.

Outline ink is 1.14:1 on the app canvas and reads only beside a fill, so ink
drawn away from every fill (a note, a fishing line, an emphasis tick) is
exported in indigo `#6D73D2`, and a detached piece smaller than four drawn
pixels is treated as source noise. The far tip of a stroke that is attached to a
fill stays outline ink when it is that small. A plainly blue source pixel stays
in the ink and indigo family instead of taking the nearer dark gray. Only skin
anchors the body, which keeps a grounded clip on one floor line; a clip that
leaves the ground declares `airborne`. A prop tip may put at most two exported
pixels on the cell edge, which are removed; more than that fails the export as
a clipped frame.

A clip that declares `drawn` was posed in code on the work grid from the
neutral pose, so the exporter cleans and reduces it but does not register it
again. `scripts/brand/moru-work-clips.mjs` holds each such clip as timed keys
and its eyes, raised flipper and props as typed pixel maps;
`author-moru-work-clips.mjs` cuts the cleaned neutral pose into a bare torso,
the facial marks and the two flippers, poses them through the keys and writes
one sheet per clip to `source/motion-v10/`. A part moves by two work pixels, a
whole pixel at 128px. A flipper off the floor becomes the round paw the
catalogue draws there, with its whole outline unless it rests on the belly's
lower edge, and a whisker it would half cover is left out. An effort narrows
the eyes and opens a small mouth. Beside scaling and leaning, a pose can spread
the belly against the head, carry the head further than the belly, and tip the
head toward its lean: a load or a slump spreads the belly on the floor, a pull
throws the head after the lever while the belly stays, and off the floor the
chest lifts. A hop is keyed pose by pose along a thrown arc. Between two poses
the centre of the body fill moves no further than the 90th percentile of the
catalogue's own steps: 5.3 exported pixels off the floor or bounding, and 1.4
on it, which the script holds a grounded body to. The body never shuffles
aside for a prop: a laptop, a crate or a lever stands in front of the near
flank, as the catalogue's laptop does, and rises from the floor line or a
slot. A piece of body fill a paw or a prop cuts off, smaller than four pixels
at 64px, takes the fill round it or the outline's ink. Every pose ends with any
body fill left open to the canvas given its outline, so no fill touches the
background. `galumph-left` squeezes the body,
passes through a pose facing the viewer with the tail behind, mirrors it about
a column left of its centre so the tail stays in the cell, and turns back in
its last poses; poses 5 to 18 are the travel and loop without the turns.
A drawing that comes within one 64px pixel of the cell edge stops the
script.

## Contextual motion

| Existing moment | Source gesture | Playback and still endpoint |
|---|---|---|
| Folder selection | Native 128px `wave`, `tilt`, `folder-open`, `folder-peek`, `soft-bow`, `blink`, `hop` | Offers a folder; bounded play with playback in the character context menu |
| Busy chooser | `blink`, `tilt` | Quiet stationary waiting while the busy chooser stays mounted; folder opening can replace it with the existing waiting view |
| Download invitation | `soft-bow`, `wave`, `tilt`, `blink`, `hop` | Welcome without the folder-selection prop |
| Petting the decorative companion | `shy`, `clap`, `dance`, `thinking`, `pondering`, `hearts`, `laugh`, `flipper-groove`, `soft-bow`, `flipper-five`, `hat-tip`; welcome also `magic-fish` | One finite reaction per press; no queued repeats or work claim |
| Real generic pending operation | `blink` / waiting row | Quiet loop while the operation is active and visible |
| Tool preparation/connection | `connect` / connect row | Same pending guards; status and Stop remain authoritative |
| Local Compile running | `source-read` / compile row | Same pending guards; no inferred completion |
| In-app agent turn at work (chat dock) | Work: `thinking`, `pondering`, `source-read`, `follow-link`, `search`, `compare`, `save`, `folder-open`, `laptop-code`; play: `flipper-groove`, `magic-fish`, `sing`, `hearts` / native 128px rows | The stage is a band above the composer, outside the scrolling transcript, so arriving answer text never moves it. Each kind of work the turn reports (no open call: thinking; an open read, search, write or command; answer text arriving within the last few seconds: typing) walks its own short list of work clips, and every third loop of one kind is play chosen from the turn id; a clip changes only when a loop ends, a new kind shows at once, and answer text plays the laptop scene alone. Loops run end to end without the waiting hold while the turn runs; hidden while a permission card waits, after Stop and when the turn has gone silent |
| In-app update notice | `wave` / greeting row, `flipper-groove`, `dance` / success row, `pondering`; `blink` / waiting row between them; native 128px rows, drawn at 64px on a narrow window | A new version greets once and rests on the waiting loop; the download dances for as long as it runs beside the real progress bar; a finished install celebrates once and rests; a failed install ponders. A clip changes on the shared neutral pose, and reduced motion holds the first frame |
| In-app agent turn finished | `dance`, `clap` or `hop` / native 128px rows, chosen from the turn id | One finite celebration for a turn this panel watched end with an answer, then the stage folds away; never over a reopened conversation |
| In-app agent asks before a file or tool action (permission card) | `await-permission` for an ask inside the folder, `uncertain` for one outside it or with no path; `tail` / tail-wag row while Allow once is hovered or focused, `stop` while Reject is hovered | Native 128px rows at the play pace, centred above the question where the work stage stood, which is hidden while the turn waits. No row here is played by another surface. A new row fades in over the one it replaces, which plays on until it is gone; reduced motion swaps the held neutral pose with no fade. Moru is absent at window heights of 800px or less, where the slot halves the card and the path needs the room, and from the task-bound ontology change review, whose evidence needs the height. The card's words still name the agent's action; Moru only accompanies the ask |
| Planning empty stage | `folder-open` once, then `blink` / waiting row with `compare` every second loop; `hop` when the action is hovered or focused | Native 128px rows. Moru opens the folder as the two sheets rise, then looks from the document to the screen while visible; the stage's pause holds him on his clip's first frame, and reduced motion shows the settled picture |
| Automations empty stage | `blink` / waiting row, `source-read` / read row on each pass of the dial hand; `tilt` / curious row when the action is hovered or focused | Native 128px rows. Moru reads once per example run as a proposal lands in the tray; same pause and reduced-motion rest. The schedule is marked as an example in words, so he claims no real run |
| Work status rooms: what a worktree's room observed | Writing: `desk-type`, `laptop-code` / code row. Reading: `monitor-read`, `source-read` / read row. Thinking: `thinking` / think row, `pondering`. Idle: `blink` / waiting row. Untouched for a while: `nod-off`. Waiting for the person: `heads-up`. Commit observed: `crate-send` or `lever-pull`. Merge observed: `merge-cheer`, `clap`. Working, between typing loops: the tool clips in turn (`hook-wrench`, `gear-start`, `magnifier-read`, `switch-flip`, `book-stack`, `timer-set`, `lock-check`, `sapling-tend`). Two tools working, now and then together: `ask-idea`, `teach`, `ask-fish`, `idea-shrug-sulk`. After a sent crate: `feel-proud` in front, `feel-happy` behind. A lock left with nobody working: `feel-worried`. Stuck, or a folder gone: `sigh`. Entering a new room: `settle-in`. Moving in or out as a room changes size: `galumph` to the right, `galumph-left` to the left. Two tools in one room: `monitor-read` behind and `desk-type` or the code row in front | Native 128px rows at the play pace; the 32-cell rows keep each cell's time. The cast clips ship as one grey strip each (`pnpm brand:room-clips`) and are dressed for the room's Moru at run time. Every new row opens and closes on the shared neutral pose, so a state change swaps there, and reduced motion holds that pose. The room moves the cell; the two galumphs move only the body, and their loop closes without a hold. A row claims no progress and nothing about a commit's content, the cheer needs the observed merge, and the permission card's `await-permission` and `uncertain` are never played here |
| Work status lobby: the building's ground floor, under the floors | Life clips (`pnpm brand:life`): `step`, `turn`, `blink`, `sway`, `look-ahead`, `look-back`, `wave`, `highfive`, `ask` and its replies, `shrug`, `huff`, `laugh`, `swap`, `boo`, `startled`, `tiptoe`, `yawn`, `nap`, `roll`; the cast palettes and the wardrobe | Play, never state: no lobby Moru stands for a worktree; the floor is named "Lobby" like the floors above it, with a doorway at each edge, a bench, a mat, a crate and a plant they use. A crew of four plus one per worktree no live session holds, at most twelve, of whom two to four are usually on the floor and never more than five; they come in from an edge and go out through one, one walk at a time, and nobody walks past anybody. Standing Moru keep a body and a half apart (only two playing together stand flipper to flipper), at most two move at once, and a newcomer wears a palette and head piece nobody on the floor wears. One Canvas 2D canvas at the drawn scale on the rooms' pixel beat (150 ms) while a Moru walks or plays a clip and every fourth beat while all only stand or blink, half the rate in a window that is not key; stopped while hidden or off screen; reduced motion holds a still lobby |
| Verified entrance (`walk`) | `wave` | Existing finite entrance |
| Verified read (`read`) | `source-read` | Existing finite cycle, then still |
| Verified completion (`success`) | `dance` | One finite celebration, then existing hide timer |
| Dead end: missing page, route error, missing project, unread harness, schedule or Git status | `tilt` / curious row | One tilt per 7.2 s cycle while visible, slower than the waiting loop; the held tilt under reduced motion. It sits beside the recovery text and claims no pending work or success |
| Startup failure (`app/global-error.tsx`) | `tilt` / curious row, held | The held tilt only, with no hook or observer: the screen reports that the runtime failed, so its figure reads nothing from it |
| Permission / quiet | Existing recovery text; no mark | No pending loop or invented success |

`src/features/agent-activity/model/mascot-state.ts` remains the authority for
verified read/completion. Planning alone cannot claim READ; SUCCESS requires a
timestamped terminal projection of the observed sequence. Status text and
`data-mascot-state` keep the same mapping. Animation does not approve writes or
accept meaning.

Runtime rows contain twenty-four 64px cells. Their first/last pixels share a neutral
pose, including WALK→READ and READ→SUCCESS boundaries. The verified sequence
uses twenty-three steps over sixteen fast beats (1920ms), with a 2520ms
completion hold. Pending loops take 4320ms with
a quiet neutral hold. Catalogue timing is independent; compositions use 47
poses with a shared neutral handoff between gestures.

`BrandWaitingMark` stops when its parent removes the active operation; it never
owns progress, cancellation or completion. First answer, Stop, permission, error
and silence keep their existing behavior. Intersection and document visibility
pause motion; reduced motion uses a still pose and unchanged status/actions.
The curious row runs under the same visibility and reduced-motion guards but
accompanies no operation: its 7200ms cycle holds neutral, tilts once and returns.
A character's gesture may repeat for as long as it is visible
([Design system](../DESIGN-SYSTEM.md), "Motion"). Reduced motion is its stop
control, and no screen adds a pause button for it.
The decorative companion keeps native 128px cells and authored jump headroom; the download hero shows them at exactly twice that size, so each drawn pixel stays a square.
Its ambient and reaction sheets use 32 columns with explicit row/column addressing
(maximum width 4096px), so adding motions does not create oversized textures.
Horizontal travel is capped at 32px and occurs only in airborne hop poses.
The borderless character target uses the existing transparent link control treatment;
its keyboard focus indication remains, while pressing it adds no rectangular fill.
Petting gives a finite shy, clap, dance, thinking, pondering, hearts, laughter or flipper-groove response. A pet during flight waits for the
neutral landing pose, then returns to the grounded ambient timeline. The ambient
character stays visible until the reaction image finishes decoding; a failed
decode keeps that fallback. Repeated presses during decoding or a response are
ignored rather than queued. Right-clicking the character or pressing Shift+F10 opens its pause/resume menu.
The resting surface shows only Moru, with no adjacent playback button. Escape
closes the menu and restores character focus; outside presses dismiss it. Pointer hover and keyboard focus hold ambient movement after an airborne hop finishes landing; ordinary
pointer focus does not leave it frozen after the pointer moves away.
Hidden/offscreen state suspends ambient and reaction animations, cleanup cancels a
pending handoff, and reduced motion uses a still expression. An explicit pause is
preserved across a pet. Large pending marks use retained 128px source rows instead
of enlarging a 64px export. All status, cancellation and verified-work authority
remains with the existing parent states.
No mark roams over graph ink; no idle state pretends work is occurring.

## Fan-out

| Surface | Asset |
|---|---|
| Gateway header | `AtlasSymbol` → `public/brand/atlas-symbol.png` |
| Download hero | Playful `BrandCompanion` at twice its native cell on whole pixels: on the app window's top edge from 80rem, above the headline when narrower |
| Character marks | `BrandMark` → `public/brand/mascot-{full,compact,micro}.png` |
| First run / missing page, route error, startup failure, missing project and an unread harness, schedule or Git status | Playful companion / curious `BrandPortrait` → `public/brand/mascot-curious-row-128.png` |
| Browser / Apple Touch | `app/icon.png`, `app/favicon.ico`, `app/apple-icon.png` |
| PWA / platform icons | `public/brand-icon-512.png`, `src-tauri/icons/**` |
| Open Graph | `public/og/<locale>.png` per locale and `public/og-image.png` (English, the `x-default`), 1200×630, from `pnpm og:build`; the copy comes from each locale's hero headline |
| README en/ko/ja/zh | Compass lockup and Moru showcase; expandable motion samples |
| Menu bar | `src-tauri/icons/tray-template.png` |

The installed app does not gain a self-download flow. The retired companion game
and personal-record surfaces remain retired; existing local saves are untouched.

## Rebuild

```bash
# Only after changing a clip in scripts/brand/moru-work-clips.mjs:
pnpm brand:work-clips
pnpm brand:sprites
pnpm brand:cast
node scripts/brand/build-brand-assets.mjs
node scripts/brand/build-brand-raster.mjs
# Open the printed loopback URL once to bake the PNG family.
node scripts/brand/install-brand-icons.mjs
node --test scripts/brand/build-moru-sprites.test.mjs scripts/brand/build-moru-cast.test.mjs
```

Generation is not part of rebuilding. The Node/sharp exporter uses retained
Image Gen sources and no new dependency. The eleven Work status clips have no
generated source: their sheets in `source/motion-v10/` are the output of
`author-moru-work-clips.mjs`, which reads the neutral pose from the first
catalogue clip and rewrites those sheets and their `moru-source.json` entries. Browser canvas disables smoothing for
Moru and enables it for the compass. The installer owns every platform destination,
including ICNS/ICO assembly. Product runtime needs no image service or server.

## Sources and rights

The art was generated with the built-in Image Gen tool from this session's own
selected designs. No third-party character or logo was supplied as a generation
reference. Prompts and raw outputs preserve this provenance; they do not prove
global uniqueness or legal clearance.

The eleven Work status clips (`desk-type`, `monitor-read`, `nod-off`,
`heads-up`, `sigh`, `crate-send`, `lever-pull`, `merge-cheer`, `galumph`,
`galumph-left`, `settle-in`) were
hand-authored as pixel art in code in this session from the existing designs,
with no third-party reference: the body, tail, flippers and facial marks are
cut from the catalogue's neutral pose, and the closed eyes, the mouth, the
raised paw and every prop are pixel maps typed in `scripts/brand/moru-work-clips.mjs`. No
image was generated for them.

Use of generated output and exclusive copyright protection are different questions.
The [OpenAI terms](https://openai.com/policies/terms-of-use/) assign output rights
between the parties to the extent permitted by law and note that outputs may be
similar. The [US Copyright Office](https://www.copyright.gov/newsnet/2025/1060.html)
and [Korea Copyright Commission](https://library.copyright.or.kr/art.do/10220/contents/7522251)
describe human authorship requirements. No exclusive copyright in AI-only elements
or registered trademark is asserted here.

The compass is a common motif and seals are a common subject. A distinct palette
and silhouette do not establish non-infringement. Trademark review must consider
similar marks and related services, not exact copying alone
([USPTO](https://www.uspto.gov/trademarks/search/likelihood-confusion)).
A comprehensive KIPRIS/USPTO design-mark clearance has not been completed.
The repository [license](../../LICENSE) remains unchanged.

## Checks

- Brand parity/presence contracts cover the three character tiers, independent
  compass fan-out, binary templates and exact installed motion rows.
- `build-moru-sprites.test.mjs` covers the observed eye/ivory regressions,
  identical level eyes at both sizes, the floor line of every grounded clip,
  the cleaning, reduction, facial-mark, resting-body and free-ink rules, a
  nonempty clip inventory, frame count, hard alpha, margins and loop seams.
- `mascot-state.test.ts`, `AgentMascotPresence.test.tsx` and waiting-mark tests
  cover evidence, Stop, visibility, reduced motion and finite work behavior. Companion tests cover independent decorative play and pause/resume.
- Motion approval additionally requires a real recording through
  [the motion procedure](../engineering/motion-recording.md); still captures alone
  do not prove temporal quality.
