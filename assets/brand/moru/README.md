# Moru and the Atlas compass

Open [the motion studio](preview.html) locally. It works from a file or static
server and provides Play/Pause, frame scrubbing, 64/128px inspection, light/dark
backgrounds and individual downloads. Reduced motion stays still; offscreen and
hidden canvases pause.

The pack contains **70 clips: 54 authored motions and 16 labelled compositions**.
The original 46 authored clips have **24 timed poses**; the newest eight have
**32**. Each composition has **47**. These are authored pose counts, not display fps.
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
Use `preview.html?clip=soft-bow` to open a particular motion.

- [Export manifest](moru.json): paths, timings, native grids and runtime subset.
- [Source manifest](moru-source.json): source-sheet cells and composed sequences.
- Source prompts: [v1](source/generation-v1.json), [v2](source/generation-v2.json),
  [v3](source/generation-v3.json), [v4](source/generation-v4.json), [v5](source/generation-v5.json), [v6](source/generation-v6.json), [v7](source/generation-v7.json), and [v8](source/generation-v8.json).
- [All retained explorations](explorations/index.json): includes rejected concepts;
  these are not additional shipping designs.
- [Pose showcase](moru-poses-showcase.png) and [1024px app icon](icons/atlas-compass-1024.png).

`sprites/{64,128}/{authored,composed}` contains transparent frame strips.
`animated/{gif,webp}/{authored,composed}` contains timed, looping 256px exports.
`poses/` contains individual transparent PNGs. Raw source sheets are retained
unchanged in `source/`; export processing handles palette, binary alpha, body
registration and shared neutral transitions. The peekaboo scene reserves a fixed
inset for the blanket. Only rosy temper opts into two coral inks; ordinary gray,
ivory and indigo mapping stays unchanged.

The app uses compact 32-column pages of native 128px cells, capped at 4096px
wide, rather than increasingly long strips. Export checks compare every runtime
cell with its catalogue source. Three project-authored SVG pixel bubbles in
`public/brand/moru-emote-*.svg` add wordless hearts, notes and sparkles. They follow
the companion and pause/visibility guards, never create another control.

Run `pnpm brand:sprites` from the repository root to regenerate the pack without
an image API. Run `node --test scripts/brand/build-moru-sprites.test.mjs` to check
eye/ivory regressions, nod body volume, frame inventories, margins and loop seams. Full platform
fan-out is documented in [Brand](../../../docs/design/brand.md#rebuild).

Only the explicitly mapped subset plays in the app, beside an existing observed
state. The catalogue's story sequences do not establish work, approval, progress
or accepted meaning. Completion art requires the existing completion evidence.

The built-in Image Gen tool created the art using this session's selected designs;
no third-party logo or character was supplied as a generation reference.
See [Sources and rights](../../../docs/design/brand.md#sources-and-rights) for the
limits of this provenance and the official references. The repository's
[license](../../../LICENSE) is unchanged. No trademark clearance or exclusive
copyright over AI-only elements is asserted.
