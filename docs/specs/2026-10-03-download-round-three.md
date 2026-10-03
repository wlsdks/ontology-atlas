---
title: "Download page round three, slice 1: three blocks out, nothing draws off-screen"
doc_type: spec
status: draft
area: product
date: 2026-10-03
decisions: []
---

# Download page round three, slice 1: three blocks out, nothing draws off-screen

## Person and moment

A developer who already runs Claude Code or Codex lands on `/{locale}/download/` on a laptop (the owner's 14-inch
MacBook, or a 1040-wide window) and decides within one scroll whether to install. The owner reviewed the live page
on 2026-10-03: the evidence and agents sections hold content "not needed now", the bottom download and verify block
and the release paragraph are unnecessary, and the page lags. This slice removes the three blocks and stops every
drawing that is out of view. The two motion figures that replace the sections are slice 2
(`docs/specs/2026-10-03-download-showpieces.md`), built after the owner has seen their rest frames. The Mac control
is draft PR #2420 (one direct Apple Silicon link); this slice assumes it and does not touch it. No visitor has been
observed; slice 2's AC-1 captures one.

## Today

Baseline `b3ef671a3`. Probe captures (scratch, not committed):
`/private/tmp/claude-501/-Users-jinan-orca-workspaces-ontology-atlas-main-5/0682aa93-39f7-494a-96d3-94b0fe2c2343/scratchpad/probe/`.

- Order: hero, conduction figure, demo, evidence, screens, agents (`src/views/download/ui/DownloadPage.tsx:88-100`), then
  closing band and colophon with release-policy notes (`:102-148`). Evidence mounts the map canvas engine (`:713`) beside
  the specimen card (`:719`); agents types the agent's request a character at a time (`AcpChatScene.tsx:117-121`).
- The closing band holds the only full SHA-256 and verify command (`DownloadPage.tsx:939-961`); the facts strip shows a
  truncated hash (`:439-443`). Each release file is published with a `.sha256` sibling
  (`.github/workflows/release-macos.yml:605-610`, verified by `scripts/check-macos-download-release.mjs:290-296`);
  `docs/guide/trust.md:28-30` states signing but no verify command.
- The conduction figure reads the specimen module (`model/conduction-cast.ts:1`, `:39`, `:50-51`, `:58`), so the generator
  and its gate (`.githooks/pre-push:192`, `scripts/lib/check-rules/vault.mjs:77-85`) keep a consumer. It already pauses
  below 20% visible and in a hidden tab (`ConductionFigure.tsx:79-95`). The screens Map row links `#evidence` with an
  up arrow (`ScreensStage.tsx:82-106`).
- Off-screen work: the hero WebGL scene draws every frame with no visibility gate (`lib/hero-atlas-scene.ts:458-466`) and
  keeps its drawing buffer for one test (`:98`; read at `tests/e2e/download-gateway-grid.spec.ts:561-606`); the field draws
  at 30 fps for the whole page (`GatewayFx.tsx:184-188`); scroll counts as input, so the shared loop never sleeps while
  scrolling (`lib/gateway-frame-loop.ts:42-48`, `:69`).
- With scripting off, the headline's characters stay `visibility: hidden` (`app/styles/gateway.css:236`); only reduced
  motion forces them visible (`app/styles/base-responsive.css:594`).

Probe: static export on :4227, headed Chromium (Playwright 1.62), Apple M2 Max, DPR 2, 120 Hz; wheel 30 px per event
top to bottom; rAF sampler with longtask and long-animation-frame observers, bucketed by the section at the viewport
centre; one Chrome trace per width; ablations hide one section with CSS.

| Measure | 1440×900 | 1040×720 |
|---|---|---|
| Scroll | 4,062 px at ~1,000 px/s | 6,172 px at ~730 px/s (ablated runs 912-977) |
| Dropped frames, median of 3 | 8.9% (8.5-10.3) | 38.5% (38.3-39.9) |
| Max frame interval, median | 134 ms | 149 ms (worst 249) |
| Long tasks / long frames over 50 ms | 0 / 0-2 (max 212, no script) | 0 / 35-40 (max 259) |
| Worst bucket; all others | agents and bottom 27.5-32%; ≤ 5.3% | agents 69-72%, bottom 79-80%; ≤ 5.4% |
| Evidence hidden | 0.5%, 1.0%; max 18 ms | 0.7%; max 33 ms; no long frame |
| Agents hidden | 0.7%; max 17 ms | 7.6%; max 100 ms |
| Hero object hidden; field hidden | not run | 41.9%; 14.0% |

Attribution: GPU-bound. At 1040, in the last 3 s, the GPU main thread was busy 2,998 of 3,000 ms, mostly waiting on
canvas surfaces before presenting (1,710 ms) and running the page's canvas and WebGL commands (1,175 ms), while the
renderer main thread was busy 241 ms; the document layer repainted 18 times and the agents scene 12. The evidence map
drew every frame from mount to the end of the scroll, long after it left the viewport. In the 1440 trace the one
main-thread task over 50 ms was a 50.6 ms wait on the GPU. JS self time at 1440 over 4.3 s: map 200 ms plus ~110 ms
of canvas calls, hero 79, field 19; main thread idle 69%. Seven PNG decodes (8.5-14.9 ms) ran off the main thread.
Reduced motion: hero, field and conduction stayed still, but the map redrew every frame for ~1.5 s (4.0% dropped).

## Problem and alternatives

Ranked by value against cost: (1) lag, which says "this app is slow"; its cause sits inside the blocks being removed,
so it is cheapest and it bounds the figures that follow; (2) the two sections the owner judged unneeded; (3) the bottom
block, cheap but seven gates to re-aim. The figures come second because the owner judges motion by its look: their
rest frames go to the owner first, and slice 2 builds what is approved.

The lag is a symptom of a missing rule (nothing stops a drawing that left the viewport), so the rule ships, not only
the deletion: the hero and the field measured as running off-screen too, and a later figure would repeat the failure.
Existing visitors lose the draggable map (Map now opens the live map in the browser), the full checksum on the page
(one press to the release page), and the `#evidence` and `#agents` anchors (they land on top).

| Option | Value and usability | Feasibility and cost | Verdict |
|---|---|---|---|
| Status quo plus a perf patch (pause the map, stop the typing) | Fixes lag; keeps content the owner rejected | Cheap | Lost: owner's judgement |
| Remove the three blocks only | Fixes the measured cause | Cheapest | Lost: hero and field still draw off-screen; the next figure repeats it |
| Remove the blocks and gate every drawing by visibility | Fixes the cause and the class | Small: three loops get one rule | Chosen |

Bottom block: keep (owner rejects); fold hash and command into the facts strip (re-adds the block in the hero); link
the release page and move the recipe to the guide (chosen; one more press). Map row: keep `#evidence` (dead anchor);
point it at the hero (the hero is not the map screen); drop the row (six names under a "seven ways" title); open
`/topology` in the browser (chosen). Everything stays local-first: the page reads no folder and sends nothing.

## Flow

Page in slice 1: hero; conduction figure; demo; screens; colophon (reading links, license, third-party licenses,
stack, trademarks).

1. When the visitor scrolls, a drawing runs only while its own section is at least 20% visible in a visible tab: the
   hero WebGL scene, the field's drift, the conduction figure and the demo video (which keeps its own 45% rule).
2. When the hero drops below 20% visible, its scene stops drawing and holds its last frame, and the field holds its
   last frame at the intensity it had; the cursor ring keeps following the pointer directly, as it does today when the
   loop is not running (`GatewayFx.tsx:212-217`). When the hero returns, both resume from where they stopped.
3. When the visitor stops on the conduction figure, it plays its loops and rests on its finished frame; a resting
   figure holds no running animation and no compositor layer.
4. When they press the facts strip's hash, the release page for that file opens in a new tab with `<file>.sha256`
   beside it. On an unpublished release the strip has no hash row (`DownloadPage.tsx:434-444`), so there is no link.
5. When they press Map in the screens list, `/topology` opens with the live sample map; the row shows no arrow.
6. When reduced motion is on, nothing moves: the hero and field draw one still frame and register no frame loop, the
   conduction figure shows its finished frame, scroll entrances do not exist.
7. When scripting is off, every section's text is visible, the headline included; the canvases are absent by design
   and nothing on the page needs them to be read.

**Visibility gate rules.** (1) One rule for every loop on the page: draw while ≥ 20% of the owning section is
visible and the tab is visible; otherwise hold the last frame and register no frame client. (2) At most one figure
plays at a time (binding once slice 2 adds two). (3) At rest nothing holds a compositor layer: finished animations
are committed and cancelled, `will-change` exists only while an animation is pending or running, and scroll
entrances leave no fill after their range; the 44 px cursor ring on fine pointers is the one exception. (4) The hero
keeps its drawing buffer only under `?e2e=1`.

**Removed, kept, re-aimed.** Removed: `EvidenceSection`, `AgentSection`, `AgentFactRow`, `DEMO_SCRIPT`, `ClosingBand`,
`ReleasePolicyNotes`; `ui/EvidenceSpecimen.tsx`, `ui/StageMap.tsx` (`useStageGraph` moves to `lib/` for the hero and
conduction), `ui/AcpChatScene.tsx`, `ui/CountUp.tsx`, `lib/use-in-view-once.ts` and their tests; `.gateway-map-after`,
`.gateway-term-*`, `app/styles/gateway-map.css` with their reduced-motion carve-outs; `tests/contract/gateway-map-reveal.contract.test.ts`,
the StageMap case of `wheel-intent.contract.test.ts:68`, the map frame of `download-gateway-grid.spec.ts:153`, `:175`, the
gateway part of `map-label-collision.spec.ts`. Kept: the specimen generator, `gateway:specimen:check`, its lane and rule;
the fields only the card read (`frontmatter`, `omittedLines`, `file`, `url`, `vaultNodeCount`, `facts.kind`,
`facts.domain`) go with `evidence-specimen.locales.test.ts`. Re-aimed: hosted-check needles
(`scripts/check-hosted-download-surface.mjs:289-290`) to `download.screens.title` until slice 2 adds its titles; its `:301`
needle `primaryCtaPublished`, rendered today only by the closing band, comes from the hero link of #2420;
`scripts/desktop-smoke.mjs:88-93`, `:153-157`; the `trustVerifyCommand` checks (`check-desktop-readiness.mjs:986`,
`validate-messages.test.mjs:127`, `check-translation-coverage.mjs:85-86`, `lib/locale-vocabulary.mjs:103-104`,
`desktop-smoke.test.mjs:167`); `download-gateway-grid.spec.ts:561-606` opens `?hero=three&e2e=1`;
`docs/features/download.md:32-37`, `:46-47`; `docs/guide/trust.md` gains both verify commands and the release-path sentences.

## States

| State | Web | macOS app |
|---|---|---|
| Hero in view | Scene and field draw; hero copy and #2420's link unchanged | Out of scope — the app never shows /download (`AGENTS.md`) |
| Hero under 20% visible | Scene and field hold their last frame; cursor ring follows directly | Out of scope — same reason |
| Conduction figure in view, paused, finished | As today: `downloadConduction.pause`, `.resume`, `.replay` | Out of scope — same reason |
| Reduced motion | One still frame each; finished conduction frame; no control | Out of scope — same reason |
| Scripting off | All text visible, headline included; no canvas | Out of scope — same reason |
| Facts strip, published | Truncated hash with `↗`, name `download.factShaLink`; opens the release page | Out of scope — same reason |
| Facts strip, unpublished | No hash row, no link (`download.factUnpublished`) | Out of scope — same reason |
| Screens Map row | `navRail.map` and `download.screens.mapHint`, no arrow; opens `/topology` | Out of scope — same reason |
| Colophon | Reading links and `footer.*` only | Out of scope — same reason |
| 1040 wide, ko, ja, zh | Same sections; strings wrap with `break-keep`; nothing scrolls sideways | Out of scope — same reason |

## Copy

Written to `messages/en/download.json` and `messages/ko/download.json`.

| Key | Where it appears | English |
|---|---|---|
| `download.factShaLink` | Facts strip, hash link name | The checksum file for {file} on the release page |
| `download.screens.sub` | Screens, lead (changed) | The same Markdown folder opens as seven screens in the app. Press a name to see that screen; Map opens live in this browser. |
| `download.screens.mapLink` | Screens, Map row name (changed) | Map, opens the live map in this browser |
| `download.screens.mapHint` | Screens, Map row hint (changed) | in the browser |

Retired from en and ko (43): `evidenceEyebrow`, `evidenceTitle`, `evidenceSub`, `specimen*` (11), `portraitCensus`,
`portraitScope`, `portraitHint`, `stageMapLabel`, `stageClusterHint`, `agentsEyebrow`, `agentsTitle`, `agentsSub`,
`acpSceneTab`, `acpUserMsg`, `acpToolCaption`, `acpToolWhy`, `acpResultLine`, `col1Title` to `col3Body` (8),
`closingVerifyLabel`, `closingVerifyBody`, `closingShaLabel`, `trustVerifyCommand`, `trustVerifyCommandWindows`,
`trustPolicyPending`, `trustPolicyPublished`, `windowsPolicy`. `acpUserLabel` stays for the conduction figure; Mac
keys belong to #2420. Slice 2's `download.change.*` and `download.start.*` are drafted in the same files and render
nothing until slice 2. ja and zh: add `factShaLink` and the three changed `screens.*` keys; retire the same 43.

## Edge cases

- Zero, one, largest: one hash link per published file; the largest measured page was 6,893 px at 1040 before the cut.
- First visit and a reload mid-page: a loop starts only once its section is visible; a reload at the colophon starts
  no hero or field drawing.
- Hangul keeps `break-keep`; at 320 px nothing scrolls sideways.
- Reduced motion switched on mid-scroll stops every loop within a frame; a hidden tab holds every frame.
- Tall screens where the hero and the conduction figure are both visible: both may draw; the one-figure rule binds
  figures, not the hero.
- Offline: the page is static; only the release-page link needs a network.
- Moved or unreadable folders and two edits at once do not apply: the page reads no folder and writes nothing.

## Out of scope

- Figures A and B: slice 2, after the owner has seen their rest frames.
- The Mac control and every Apple Silicon or Intel fact: #2420.
- Hero headline, lead and trust line: owner-approved; the lead's "over MCP" is Later 2.
- Conduction figure and demo take: the 2026-10-02 record keeps the take until a retake.
- The six decoded screen captures (~110 MB): off the main thread, not a lag cause; Later 4.

## Acceptance criteria

1. Given the built page, Then no `gateway-evidence-section`, `gateway-agents-section`, `download-closing-band`,
   release-policy sentence or `data-gateway-stage` exists, the colophon holds only reading links, license, third-party
   licenses, stack and trademarks, and the re-aimed gates pass. `DownloadPage.test.tsx`,
   `check-hosted-download-surface.test.mjs`, `desktop-smoke.test.mjs`, `validate-messages.test.mjs`, `pnpm desktop:check`.
2. Given the static export, DPR 2, headed Chromium on the owner's Mac, at 1440×900, 1040×720 and a GPU-load variant
   1920×1080, When the probe runs a brisk leg (top to bottom at ~1,000 px/s) and a parked leg (stop on each figure until
   it rests, then move on), Then each leg's median of 3 has ≤ 2% dropped frames, no frame interval over 50 ms and no long
   task over 50 ms. New `tests/e2e/download-scroll-budget.spec.ts` (local headed project), numbers in the PR.
3. Given the page parked at the colophon for 2 s, Then no time-based animation runs, the hero and field draw no frame,
   and the gateway loop has no client; given the conduction figure at 19% visible, it is paused; given it at rest, the
   layer tree holds no composited layer for it. New `tests/e2e/download-visibility-gate.spec.ts` (CDP `LayerTree`).
4. Given reduced motion, When the page loads and scrolls top to bottom, Then `document.getAnimations()` stays empty, the
   gateway loop never registers a client, and the hero and field each draw once; given scripting off, the headline and
   every section's text are visible. New `tests/e2e/download-still.spec.ts` (reduced motion and scripting off).
5. Given a published release, When the visitor presses the facts strip's hash, Then the release page of that file
   opens in a new tab, the link's name is `download.factShaLink`, and `docs/guide/trust.md` holds
   `shasum -a 256 <file>` and `Get-FileHash <file> -Algorithm SHA256`. `DownloadPage.test.tsx`, `download-hero-release.spec.ts`.
6. Given the screens list, Then the Map row shows no arrow, is named `download.screens.mapLink`, and opens `/topology`.
   New `ScreensStage.test.tsx`.
7. Given `?hero=three&e2e=1`, Then `download-gateway-grid.spec.ts:561-606` passes; without `e2e=1` the hero's context
   is created without a preserved drawing buffer. `download-gateway-grid.spec.ts`, new `HeroAtlas.test.tsx`.

## Risks

1. The page reads thin until slice 2 lands (hero, conduction, demo, screens). Probe: the owner sees slice 1 with the
   rest frames in hand; design: slice 2 can land in the same train once the frames are approved.
2. The GPU-load variant still fails because the conduction figure animates SVG masks and strokes on the main thread
   (its bucket measured up to 5.3% at 1440). Probe: AC-2's parked leg at 1920×1080; fallback: its light drops a layer
   or its masks become opacity.
3. Someone who verifies downloads cannot find the checksum ((83)'s falsifier). Probe: one walkthrough task, "check the
   file you downloaded"; design: the hash itself is the link, and the guide's On trust chapter holds the commands.

## Later

1. Slice 2, figures A and B (`docs/specs/2026-10-03-download-showpieces.md`): next when the owner approves the rest frames.
2. Hero lead and demo prompt in plain words: next if a walkthrough reader stalls on MCP or tool names.
3. A Download control in the gateway nav once the hero leaves view: next if a reader at the bottom cannot find it.
4. Decode only the active and next screen capture: next on a memory probe of the page.
5. Retake or retire the demo against the current app: per the 2026-10-02 record.
6. Rename the specimen generator for what it now feeds: with the next conduction cast change.

## Owner question

None. Decided: no download control at the page's end, since the owner called the bottom block unnecessary (reverse:
one outline link under the last section).

## Decision fragment draft

Not created; the lead files it with `pnpm record:new`.

```text
## 2026-10-03 — The download page drops three blocks and stops every drawing that is out of view
**Why**: The owner (2026-10-03) judged the evidence and agents sections unneeded, called the bottom download and verify block and the release notes unnecessary, and asked that the page stop lagging. A scripted scroll of the static export dropped 8.9% of frames at 1440×900 and 38.5% at 1040×720, GPU-bound; hiding the evidence section alone brought both under 1%, and the hero and field were drawing off-screen too.
**Prior**: Overturns (103), whose own falsifier allowed dropping the map, and (70)'s agents section; overturns the 2026-09-02 closing band (#1394, recorded only in docs/features/download.md) and the colophon's release notes; amends the 2026-09-24 screens direction B (Map opens the browser map). (83) stands: the hero trust line stays the page's only signing claim. (70)'s order and one moving thing per section, the 2026-10-02 conduction band, and #2420's Apple Silicon link stand.
**Decision**: Remove the three blocks; every drawing on the page runs only while its section is at least 20% visible in a visible tab, one figure plays at a time, nothing at rest holds a compositor layer, and reduced motion is fully still. The facts strip's hash links to the release page's checksum file; the guide's On trust chapter carries the verify commands. Two replacement figures follow in slice 2 after the owner has seen their rest frames.
**Dissent**: The closing band was the page's only bookend and full checksum; a reader at the bottom has no download control, and the release-path sentences leave for the guide. Until slice 2 lands the page is shorter and plainer.
**Falsifier**: A scroll at 1440×900, 1040×720 or 1920×1080 over 2% dropped frames or with a long task over 50 ms after this lands; or (83)'s falsifier (questions about the checksum or signing), answered in the colophon, not by a new band.
**Owner**: owner (direction 2026-10-03); acceptance pending review.
```
