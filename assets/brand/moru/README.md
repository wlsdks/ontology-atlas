# Moru and the Atlas compass

Open [the motion studio](preview.html) locally. It works from a file or static
server and provides Play/Pause, frame scrubbing, 64/128px inspection, light/dark
backgrounds and individual downloads. Reduced motion stays still; offscreen and
hidden canvases pause.

The pack contains **85 clips: 69 authored motions and 16 labelled compositions**.
There are **50 authored clips with 24 timed poses** and **19 with 32**. Each composition has **47**. These are authored pose counts, not display fps.
The pack also has **16 static poses**, including separately simplified 32px/16px faces.
Singing with notes, a fish friend, a happy dance and a tiny Moru chorus are
included as expressive clips. Shy smiles, a ball game with a friend, three cuddling
pups and rain/snow/breeze scenes extend the catalogue. The compass is the approved
app identity. Moru is the seal companion. A somersault, toy-fishing, laptop coding,
curious thinking and quiet pondering add five further gestures. Affectionate hearts,
a giggle, a puzzled frown and a tiny temper add four emotional expressions.
A flipper groove and two floating-ontology scenes complete the twelve-clip addition.
Eight 32-pose gestures add a soft bow, hat greeting, fish trick, blanket peekaboo,
rosy temper, flipper five, folder peek and bubble chase.
The polish pass replaces the deep bow with a small rounded nod and separately
times anticipation, movement, holds and settling for nod, hop, folder peek and
shy response. Its earlier source attempt remains alongside the chosen source.
Four more 32-pose encounters add a nose-star balance, a sparkle sneeze, pup
peekaboo and a heart gift. The flipper groove is redrawn with 32 poses. The
second pet reveals an encounter; a pup also visits once per long idle cycle.
Folder entry uses 14 responses, welcome uses 18 including singing and bubble
chasing. Props and drawn notes replace the extra bubble in those scenes.
Use `preview.html?clip=pup-peek` to open a particular motion.

- [Export manifest](moru.json): paths, timings, native grids and runtime subset.
- [Source manifest](moru-source.json): source-sheet cells and composed sequences.
- Source prompts: [v1](source/generation-v1.json), [v2](source/generation-v2.json),
  [v3](source/generation-v3.json), [v4](source/generation-v4.json), [v5](source/generation-v5.json), [v6](source/generation-v6.json), [v7](source/generation-v7.json), [v8](source/generation-v8.json), and [v9](source/generation-v9.json).
- Clips drawn in code: [the eleven Work status clips](../../../scripts/brand/moru-work-clips.mjs), posed from the neutral pose into `source/motion-v10/` by `pnpm brand:work-clips`.
- [Pose showcase](moru-poses-showcase.png) and [1024px app icon](icons/atlas-compass-1024.png).

`sprites/{64,128}/{authored,composed}` contains transparent frame strips.
`animated/{gif,webp}/{authored,composed}` contains timed, looping 256px exports.
`poses/` contains individual transparent PNGs. The source sheets `moru-source.json` names
are kept unchanged in `source/`; drafts, first passes and rejected sheets are
not committed; export processing handles palette, binary alpha, body
registration and shared neutral transitions. Clips are processed on a 256px
grid and halved to each size; eyes, nose and whiskers are reduced to their own
size so equal marks stay equal, the outline's soft gray edge joins the outline, the lighter haze beside any ink dissolves into the fill, and
ink drawn away from every fill is exported in indigo so it reads on the dark canvas
([Brand](../../../docs/design/brand.md#raster-grids-and-palette)). The peekaboo scene reserves a fixed
inset for the blanket. Rosy temper and the heart gift opt into two coral inks; ordinary gray,
ivory and indigo mapping stays unchanged.

The app uses compact 32-column pages of native 128px cells, capped at 4096px
wide, rather than increasingly long strips. Export checks compare every runtime
cell with its catalogue source. Three project-authored SVG pixel bubbles in
`public/brand/moru-emote-*.svg` add wordless hearts, notes and sparkles. They follow
the companion and pause/visibility guards, never create another control.

Run `pnpm brand:sprites` from the repository root to regenerate the pack without
an image API. Run `node --test scripts/brand/build-moru-sprites.test.mjs` to check
eye/ivory regressions, the reduction rules, identical eyes, floor lines, nod body volume, frame inventories, margins and loop seams. Full platform
fan-out is documented in [Brand](../../../docs/design/brand.md#rebuild).

## In the app

**Where Moru appears.** At folder entry Moru greets you, holds out a small folder and waits; once a folder starts opening, play gives way to the waiting view. The download page has its own welcome. Reading a source, waiting for your permission and celebrating a finished check appear only when the app has observed that state, so Moru never shows progress nobody confirmed.

**Petting.** Press Moru for one short response. The first is gentle, the second reveals a playful one, and after that Moru works through everything it knows while avoiding the last two: 14 responses at folder entry, 18 on the download welcome. A small wordless bubble sometimes answers with a heart, a note or a sparkle, and a pup peeks out once in a long idle.

**Staying out of the way.** Moru moves only while airborne, and lands before it waits under your pointer. While work is pending it stays quiet and in place. Pause and resume live in Moru's menu (right-click or Shift+F10), with no playback button beside the character, and reduced motion answers with a still expression.

## The 16 poses

<img src="moru-poses-showcase.png" width="400" height="400" alt="Moru's 16 poses" />

## All 69 drawn motions

### Waiting

<p>
<img src="animated/gif/authored/moru-blink.gif" width="128" height="128" alt="Moru blinking while it waits" />
<img src="animated/gif/authored/moru-tail.gif" width="128" height="128" alt="Moru wiggling its tail" />
<img src="animated/gif/authored/moru-doze.gif" width="128" height="128" alt="Moru dozing" />
<img src="animated/gif/authored/moru-hop.gif" width="128" height="128" alt="Moru doing a little hop" />
<img src="animated/gif/authored/moru-tilt.gif" width="128" height="128" alt="Moru tilting its head curiously" />
<img src="animated/gif/authored/moru-stretch.gif" width="128" height="128" alt="Moru stretching" />
<img src="animated/gif/authored/moru-rest-return.gif" width="128" height="128" alt="Moru coming back from a rest" />
</p>

### Greeting

<p>
<img src="animated/gif/authored/moru-wave.gif" width="128" height="128" alt="Moru greeting" />
<img src="animated/gif/authored/moru-soft-bow.gif" width="128" height="128" alt="Moru bowing softly" />
<img src="animated/gif/authored/moru-hat-tip.gif" width="128" height="128" alt="Moru tipping a tiny hat" />
<img src="animated/gif/authored/moru-flipper-five.gif" width="128" height="128" alt="Moru offering a flipper five" />
<img src="animated/gif/authored/moru-shy.gif" width="128" height="128" alt="Moru smiling shyly" />
</p>

### At work

<p>
<img src="animated/gif/authored/moru-folder-open.gif" width="128" height="128" alt="Moru opening a folder" />
<img src="animated/gif/authored/moru-folder-peek.gif" width="128" height="128" alt="Moru peeking into a folder" />
<img src="animated/gif/authored/moru-source-read.gif" width="128" height="128" alt="Moru reading source" />
<img src="animated/gif/authored/moru-search.gif" width="128" height="128" alt="Moru searching" />
<img src="animated/gif/authored/moru-follow-link.gif" width="128" height="128" alt="Moru following a link" />
<img src="animated/gif/authored/moru-compare.gif" width="128" height="128" alt="Moru comparing two things" />
<img src="animated/gif/authored/moru-review-proposal.gif" width="128" height="128" alt="Moru reviewing a proposal" />
<img src="animated/gif/authored/moru-await-permission.gif" width="128" height="128" alt="Moru waiting for a person" />
<img src="animated/gif/authored/moru-uncertain.gif" width="128" height="128" alt="Moru unsure" />
<img src="animated/gif/authored/moru-stop.gif" width="128" height="128" alt="Moru stopping" />
<img src="animated/gif/authored/moru-retry.gif" width="128" height="128" alt="Moru trying again" />
<img src="animated/gif/authored/moru-save.gif" width="128" height="128" alt="Moru saving" />
<img src="animated/gif/authored/moru-refresh.gif" width="128" height="128" alt="Moru refreshing" />
<img src="animated/gif/authored/moru-connect.gif" width="128" height="128" alt="Moru connecting" />
<img src="animated/gif/authored/moru-reply-ready.gif" width="128" height="128" alt="Moru with a reply ready" />
<img src="animated/gif/authored/moru-no-results.gif" width="128" height="128" alt="Moru finding nothing" />
<img src="animated/gif/authored/moru-laptop-code.gif" width="128" height="128" alt="Moru coding on a laptop" />
<img src="animated/gif/authored/moru-clap.gif" width="128" height="128" alt="Moru celebrating observed completion" />
</p>

### Feelings

<p>
<img src="animated/gif/authored/moru-thinking.gif" width="128" height="128" alt="Moru thinking" />
<img src="animated/gif/authored/moru-pondering.gif" width="128" height="128" alt="Moru pondering" />
<img src="animated/gif/authored/moru-hearts.gif" width="128" height="128" alt="Moru sending little hearts" />
<img src="animated/gif/authored/moru-laugh.gif" width="128" height="128" alt="Moru giggling" />
<img src="animated/gif/authored/moru-frown.gif" width="128" height="128" alt="Moru frowning thoughtfully" />
<img src="animated/gif/authored/moru-grumpy.gif" width="128" height="128" alt="Moru with a tiny temper" />
<img src="animated/gif/authored/moru-warm-temper.gif" width="128" height="128" alt="Moru blushing with a tiny temper" />
<img src="animated/gif/authored/moru-heart-gift.gif" width="128" height="128" alt="Moru offering a heart" />
</p>

### Play

<p>
<img src="animated/gif/authored/moru-sing.gif" width="128" height="128" alt="Moru singing" />
<img src="animated/gif/authored/moru-dance.gif" width="128" height="128" alt="Moru dancing" />
<img src="animated/gif/authored/moru-chorus.gif" width="128" height="128" alt="Moru chorus" />
<img src="animated/gif/authored/moru-flipper-groove.gif" width="128" height="128" alt="Moru dancing with its flippers" />
<img src="animated/gif/authored/moru-somersault.gif" width="128" height="128" alt="Moru doing a somersault" />
<img src="animated/gif/authored/moru-toy-fishing.gif" width="128" height="128" alt="Moru playing with a fishing-line toy" />
<img src="animated/gif/authored/moru-fish-play.gif" width="128" height="128" alt="Moru and a fish" />
<img src="animated/gif/authored/moru-magic-fish.gif" width="128" height="128" alt="Moru revealing a magic fish" />
<img src="animated/gif/authored/moru-peekaboo.gif" width="128" height="128" alt="Moru playing peekaboo" />
<img src="animated/gif/authored/moru-bubble-chase.gif" width="128" height="128" alt="Moru chasing a bubble" />
<img src="animated/gif/authored/moru-nose-balance.gif" width="128" height="128" alt="Moru balancing a star" />
<img src="animated/gif/authored/moru-star-sneeze.gif" width="128" height="128" alt="Moru sneezing sparkles" />
<img src="animated/gif/authored/moru-friend-play.gif" width="128" height="128" alt="Moru playing ball with a friend" />
<img src="animated/gif/authored/moru-pup-cuddle.gif" width="128" height="128" alt="Moru cuddling three pups" />
<img src="animated/gif/authored/moru-pup-peek.gif" width="128" height="128" alt="Moru playing with a pup" />
</p>

### Work status rooms

<p>
<img src="animated/gif/authored/moru-desk-type.gif" width="128" height="128" alt="Moru typing at a laptop that rises in front of it" />
<img src="animated/gif/authored/moru-monitor-read.gif" width="128" height="128" alt="Moru reading a monitor above it" />
<img src="animated/gif/authored/moru-nod-off.gif" width="128" height="128" alt="Moru nodding off and snoring" />
<img src="animated/gif/authored/moru-heads-up.gif" width="128" height="128" alt="Moru perking up, hopping and looking out" />
<img src="animated/gif/authored/moru-sigh.gif" width="128" height="128" alt="Moru looking round for someone and sighing" />
<img src="animated/gif/authored/moru-crate-send.gif" width="128" height="128" alt="Moru heaving a crate onto its head and patting it down through the floor" />
<img src="animated/gif/authored/moru-lever-pull.gif" width="128" height="128" alt="Moru throwing a floor lever" />
<img src="animated/gif/authored/moru-merge-cheer.gif" width="128" height="128" alt="Moru jumping, flapping and clapping" />
<img src="animated/gif/authored/moru-galumph.gif" width="128" height="128" alt="Moru galumphing along the floor" />
<img src="animated/gif/authored/moru-galumph-left.gif" width="128" height="128" alt="Moru turning round through a front-facing pose and galumphing to the left" />
<img src="animated/gif/authored/moru-settle-in.gif" width="128" height="128" alt="Moru looking round a new room, hopping and settling" />
</p>

### Scenes

<p>
<img src="animated/gif/authored/moru-rainy-day.gif" width="128" height="128" alt="Moru with an umbrella in the rain" />
<img src="animated/gif/authored/moru-snow-day.gif" width="128" height="128" alt="Moru watching snowflakes" />
<img src="animated/gif/authored/moru-breeze.gif" width="128" height="128" alt="Moru in a little breeze" />
<img src="animated/gif/authored/moru-ontology-orbit.gif" width="128" height="128" alt="Moru watching a floating ontology model" />
<img src="animated/gif/authored/moru-ontology-dance.gif" width="128" height="128" alt="Moru dancing with a floating ontology" />
</p>

## Provenance

Only the explicitly mapped subset plays in the app, beside an existing observed
state. The catalogue's story sequences do not establish work, approval, progress
or accepted meaning. Completion art requires the existing completion evidence.

The built-in Image Gen tool created the art using this session's selected designs;
no third-party logo or character was supplied as a generation reference. The eleven
Work status clips were hand-authored as pixel art in code from those designs,
with no third-party reference and no generated image.
See [Sources and rights](../../../docs/design/brand.md#sources-and-rights) for the
limits of this provenance and the official references. The repository's
[license](../../../LICENSE) is unchanged. No trademark clearance or exclusive
copyright over AI-only elements is asserted.
