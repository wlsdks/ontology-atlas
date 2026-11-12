# Moru and the Atlas compass

Open [the motion studio](preview.html) locally. It works from a file or static
server and provides Play/Pause, frame scrubbing, 64/128px inspection, light/dark
backgrounds and individual downloads. Reduced motion stays still; offscreen and
hidden canvases pause.

The pack contains **50 clips: 34 authored motions and 16 labelled compositions**.
Each authored clip has **24 timed poses**; each composition has **47**.
The pack also has **16 static poses**, including separately simplified 32px/16px faces.
Singing with notes, a fish friend, a happy dance and a tiny Moru chorus are
included as expressive clips. Shy smiles, a ball game with a friend, three cuddling
pups and rain/snow/breeze scenes extend the catalogue. The compass is the approved
app identity. Moru is the seal companion.

- [Export manifest](moru.json): paths, timings, native grids and runtime subset.
- [Source manifest](moru-source.json): source-sheet cells and composed sequences.
- Source prompts: [v1](source/generation-v1.json), [v2](source/generation-v2.json),
  [v3](source/generation-v3.json), [v4](source/generation-v4.json), and
  [v5](source/generation-v5.json).
- [All retained explorations](explorations/index.json): includes rejected concepts;
  these are not additional shipping designs.
- [Pose showcase](moru-poses-showcase.png) and [1024px app icon](icons/atlas-compass-1024.png).

`sprites/{64,128}/{authored,composed}` contains transparent frame strips.
`animated/{gif,webp}/{authored,composed}` contains timed, looping 256px exports.
`poses/` contains individual transparent PNGs. Raw source sheets are retained
unchanged in `source/`; export processing handles palette, binary alpha, body
registration and shared neutral transitions.

Run `pnpm brand:sprites` from the repository root to regenerate the pack without
an image API. Run `node --test scripts/brand/build-moru-sprites.test.mjs` to check
eye/ivory regressions, frame inventories, margins and loop seams. Full platform
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
