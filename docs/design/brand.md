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
28 authored twenty-four-frame motions, 16 explicitly labelled composed sequences and
16 static poses. Sizes/formats never count as additional designs.
Open [preview.html](../../assets/brand/moru/preview.html) locally to play, pause,
scrub frames, inspect 64/128px exports, and download individual assets.
The preview works from a local file or a static server without external requests.

Source sheets, generation prompts and discarded explorations remain in that pack.
`moru-source.json` records source cells and sequence constituents; `moru.json`
records every export, timing and contextual runtime mapping.
The catalogue includes folder opening, source reading, search, relation following,
comparison, proposal review, permission wait, uncertainty, stop, retry, save,
refresh, connection, reply arrival, empty search and returning from rest.
Silent singing, a fish friend, dancing and a miniature Moru chorus are optional
expressive artwork. The chorus keeps its own smaller scene framing. Catalogue
availability does not create an app state.

## Raster grids and palette

| Role | Canonical source | Use |
|---|---|---|
| Full Moru | `assets/brand/mascot/mascot-full-64.png` | Native 64px character |
| Compact | `mascot-compact-32.png` in that directory | Separately simplified 32px face |
| Micro | `mascot-micro-16.png` | Independently simplified 16px face |
| Presentation | `mascot-presentation-128.png` | Larger character compositions |
| Curious portrait | `mascot-curious-32.png` | Existing missing-page icon slot |
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
Raw source files remain unchanged.

## Contextual motion

| Existing moment | Source gesture | Playback and still endpoint |
|---|---|---|
| First folder-entry welcome | `wave` / greeting row | One finite cycle in the existing identity slot, then neutral |
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
completion hold. The welcome takes 3600ms; pending loops take 4320ms with
a quiet neutral hold. Catalogue timing is independent; compositions use 47
poses with a shared neutral handoff between gestures.

`BrandWaitingMark` stops when its parent removes the active operation; it never
owns progress, cancellation or completion. First answer, Stop, permission, error
and silence keep their existing behavior. Intersection and document visibility
pause motion; reduced motion uses a still pose and unchanged status/actions.
The finite greeting never restarts on a re-render or after its completion.
No mark roams over graph ink; no idle state pretends work is occurring.

## Fan-out

| Surface | Asset |
|---|---|
| Gateway header | `AtlasSymbol` → `public/brand/atlas-symbol.png` |
| Download closing invitation | Static full Moru, outside graph illustrations |
| Character marks | `BrandMark` → `public/brand/mascot-{full,compact,micro}.png` |
| First run / missing page | Finite welcome / static curious `BrandPortrait` |
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
  a nonempty 44-clip inventory, frame count, hard alpha, margins and loop seams.
- `mascot-state.test.ts`, `AgentMascotPresence.test.tsx` and waiting-mark tests
  cover evidence, Stop, visibility, reduced motion and finite greeting behavior.
- Motion approval additionally requires a real recording through
  [the motion procedure](../engineering/motion-recording.md); still captures alone
  do not prove temporal quality.
