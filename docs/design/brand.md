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
58 authored motions (45 with 24 poses and 13 with 32), 16 explicitly labelled composed sequences and
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
| Curious portrait | `mascot-curious-128.png` | Native tilted pose on the missing page; a tilted body has no readable face at 32px |
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

Clips are cut, registered and cleaned on one 256px grid, then reduced once to
128px and 64px. A reduced pixel takes the colour most of its source block agrees
on; a stroke straddling two blocks lands in one of them, so an eye column or a
whisker neither doubles nor disappears. Outline ink is 1.14:1 on the app canvas
and reads only beside a fill, so ink drawn away from every fill (a note, a
fishing line, an emphasis tick) is exported in indigo `#6D73D2`, and a detached
piece smaller than four drawn pixels is treated as source noise. A plainly blue
source pixel stays in the ink and indigo family instead of taking the nearer
dark gray. Only skin anchors the body, which keeps a grounded clip on one floor
line; a clip that leaves the ground declares `airborne`.

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
| Verified entrance (`walk`) | `wave` | Existing finite entrance |
| Verified read (`read`) | `source-read` | Existing finite cycle, then still |
| Verified completion (`success`) | `dance` | One finite celebration, then existing hide timer |
| Error / permission / quiet | Existing recovery text; static curious portrait or no mark | No pending loop or invented success |

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
The decorative companion keeps native 128px cells and authored jump headroom.
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
| Download closing invitation | Playful `BrandCompanion`, outside graph illustrations |
| Character marks | `BrandMark` → `public/brand/mascot-{full,compact,micro}.png` |
| First run / missing page | Playful companion / static curious `BrandPortrait` |
| Browser / Apple Touch | `app/icon.png`, `app/favicon.ico`, `app/apple-icon.png` |
| PWA / platform icons | `public/brand-icon-512.png`, `src-tauri/icons/**` |
| Open Graph | `public/og-image.png`, 1200×630 |
| README en/ko/ja/zh | Compass lockup and Moru showcase; expandable motion samples |
| Menu bar | `src-tauri/icons/tray-template.png` |

The installed app does not gain a self-download flow. The retired companion game
and personal-record surfaces remain retired; existing local saves are untouched.

## Rebuild

```bash
pnpm brand:sprites
node scripts/brand/build-brand-assets.mjs
node scripts/brand/build-brand-raster.mjs
# Open the printed loopback URL once to bake the PNG family.
node scripts/brand/install-brand-icons.mjs
node --test scripts/brand/build-moru-sprites.test.mjs
```

Generation is not part of rebuilding. The Node/sharp exporter uses retained
Image Gen sources and no new dependency. Browser canvas disables smoothing for
Moru and enables it for the compass. The installer owns every platform destination,
including ICNS/ICO assembly. Product runtime needs no image service or server.

## Sources and rights

The art was generated with the built-in Image Gen tool from this session's own
selected designs. No third-party character or logo was supplied as a generation
reference. Prompts and raw outputs preserve this provenance; they do not prove
global uniqueness or legal clearance.

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
  equal eye width at both sizes, the floor line of every grounded clip, the
  reduction and free-ink rules, a nonempty clip inventory, frame count, hard
  alpha, margins and loop seams.
- `mascot-state.test.ts`, `AgentMascotPresence.test.tsx` and waiting-mark tests
  cover evidence, Stop, visibility, reduced motion and finite work behavior. Companion tests cover independent decorative play and pause/resume.
- Motion approval additionally requires a real recording through
  [the motion procedure](../engineering/motion-recording.md); still captures alone
  do not prove temporal quality.
