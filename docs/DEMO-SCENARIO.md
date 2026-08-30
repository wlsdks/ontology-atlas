# Demo Video Shooting Scenario — `atlas-tour`

> Current scenario: one localized page clip · **44 seconds** · one take · no speed changes ·
> no audio · recorded separately in Korean and English. The X export is a separate Korean
> 21.633-second LNB overview and is not part of the page registry.

The playback contract lives in `src/views/download/ui/DemoStage.tsx`. Asset registration lives
in `src/views/download/model/demo-clips.ts`. The accountable decision is the 2026-08-30 record
“Two real-use cuts replace the nine-second neighbourhood loop” in `docs/DECISIONS.md`.

## 1. The sentences the footage must prove

> **Page:** Pick a concept, read its relations and evidence, and let Codex follow that same map.
>
> **X:** One local ontology continues through the map, implementation structure, source
> documents, maintenance, project scope, agents, and Git history.

The page recording is not a renderer tour. Its subject is the continuity from a human-readable
concept to an Atlas MCP lookup. 3D, Cloud, History, installation, and folder selection are all
outside that take. The X recording is intentionally a breadth-first navigation proof; it does
not repeat the page clip's complete MCP transaction.

## 2. Privacy and capture contract

All preparation ends before recording:

- the installed app is already open on this repository's public `docs/ontology` example;
- the target locale is already selected;
- before a page take, Codex is selected, downloaded, and ready;
- before the X take, all seven destination states are prewarmed on the same public example;
- the window is 1512×949 logical points;
- screen guides, transient surfaces, and unread notification badges are closed;
- the map is settled in its overview state with INDEX expanded.

The delivered frame contains only the Ontology Atlas window. On the current macOS build,
window-targeted video capture adds a system sharing badge to the title bar, so the accepted path
records display 1 while the app fills it, crops the exact app rectangle immediately, and deletes
the raw display master after verification. The cropped deliverable must not contain the desktop,
menu bar, Dock, another app, or a notification banner. Finder, the file picker, Settings,
terminals, and absolute paths never appear in a delivered frame. The page take also excludes the
agent connection surface. The X take may show the public-example Agents destination only after
its full frame has been checked for accounts, paths, or private state. The cursor remains visible
and click highlighting is disabled.

The example vault contains only public repository material. Even so, privacy is judged from the
pixels, not from that assumption: every final asset gets a one-frame-per-second visual sweep.

## 3. Download-page take — 44 seconds

| Time | Visible beat |
|---:|---|
| 0–2s | Hold on the settled ontology overview. The first frame is already useful; there is no loading screen. |
| 2–5s | Search INDEX for the localized **MCP Server** capability and choose the result. |
| 5–9s | Hold the capability detail: what uses it, what it depends on, its parent, and its evidence document. |
| 9–12s | Open **Ask AI**. Codex is already selected and ready. |
| 12–14s | Enter and send the locale-specific read-only prompt below. |
| 14–39s | Codex calls Atlas MCP `get_concept` for both endpoints and `find_path` for their path. The work indicator remains honest while it runs. |
| 39–44s | Hold the one-sentence result long enough to read. |

Use the locale's `download.demoAgentPrompt` message verbatim. The localized data preserves the
same two tool names, the same endpoint slugs, the one-sentence bound, and the no-write clause.

The take is valid only when the collapsed work-process receipt contains two `get_concept` calls
and one `find_path` call. A plausible answer produced from shell search or direct file reads is
not this product claim and invalidates the take.

## 4. X take — 21.633 seconds

The X clip answers the owner's posting need for a fast product-breadth hook. It starts after the
public example is open and uses real LNB clicks at natural speed; it does not wait for an agent
response or alter the page demo:

| Time | Visible beat |
|---:|---|
| 0–3.2s | Hold the settled **Map** overview so the product category is readable immediately. |
| 3.2–6.5s | Open **Architecture** and show the reviewed implementation roles and dependency chain. |
| 6.5–9.7s | Open **Docs** and show the Markdown ontology source. |
| 9.7–12.9s | Open **Insights** and show readiness and maintenance work. |
| 12.9–16.2s | Open **Projects** and show the same public project's domain coverage. |
| 16.2–19.4s | Open **Agents** and show the privacy-clean ready tools and MCP setup. |
| 19.4–21.633s | End on **History**, where Git closes the journey as human-owned reviewable meaning. |

This is a separate real take, not a time-compressed export of the page clip. Settings is not an
LNB destination and is excluded. It ships as
`docs/launch/ontology-atlas-x-demo.ko.mp4`; it is not added to `DEMO_CLIPS` and does not create a
second gateway tab.

## 5. Capture and encode

Use external scratch for raw captures and frames. Confirm immediately before each take that the
app occupies logical `(0,33) 1512×949` on display 1. A rebuilt or relaunched app gets a new window
ID even though the display crop stays the same. Window-targeted `screencapture -l` is rejected for
video because its sharing badge becomes part of the captured title bar.

```bash
screencapture -v -D1 -V44 -x -C atlas-tour.ko.mov
screencapture -v -D1 -V44 -x -C atlas-tour.en.mov
screencapture -v -D1 -V22 -x -C ontology-atlas-x.ko.mov
```

The Retina display source is 3024×1964 at the display refresh rate. Crop `(0,66) 3024×1898` to
remove the macOS menu bar, then deliver 1512×950 at a uniform 30fps; the one-pixel vertical pad
keeps an even H.264/AV1 frame without cropping app content.

```bash
ffmpeg -i atlas-tour.ko.mov -vf "crop=3024:1898:0:66,scale=1512:949,pad=1512:950:0:0:black,fps=30" \
  -an -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart \
  public/demo/atlas-tour.ko.mp4

ffmpeg -i atlas-tour.ko.mov -vf "crop=3024:1898:0:66,scale=1512:949,pad=1512:950:0:0:black,fps=30" \
  -an -c:v libsvtav1 -preset 8 -crf 34 -pix_fmt yuv420p \
  public/demo/atlas-tour.ko.webm
```

Repeat for English. Encode the X take as H.264 MP4 with the same dimensions and frame rate.
Create each page poster from its first settled frame.

## 6. Activation

The six localized page assets are:

```text
public/demo/atlas-tour.ko.webm
public/demo/atlas-tour.ko.mp4
public/demo/atlas-tour.ko-poster.png
public/demo/atlas-tour.en.webm
public/demo/atlas-tour.en.mp4
public/demo/atlas-tour.en-poster.png
```

Current attachment, filmed 2026-08-30 from the installed rc.18 app:

| Locale/output | WebM | MP4 | Poster |
|---|---:|---:|---:|
| Korean page | 893,587 bytes | 933,481 bytes | 245,523 bytes |
| English page | 926,124 bytes | 964,093 bytes | 268,205 bytes |
| Korean X | — | 936,948 bytes | — |

All three MP4 deliveries are 1512×950, 30fps, silent H.264: the page takes are exactly 44
seconds and the X take is 21.633 seconds. Both page WebM files are silent AV1 at the same
dimensions, frame rate, and 44-second duration.

After encoding:

1. measure both MP4 durations with `ffprobe`;
2. set `DEMO_CLIPS[0].seconds` to the measured whole-second duration;
3. keep `AVAILABLE_DEMO_CLIP_IDS = ['atlas-tour']`;
4. make `messages/{ko,en}.json` describe the recorded relation/evidence/Codex path, not the retired neighbourhood-only scene;
5. run `pnpm docs-vault:build` before `pnpm docs-vault:check`.

## 7. Required proof

- **Privacy sweep** — extract one frame per second from all three delivered MP4 files, build
  contact sheets, and inspect every tile for Finder, paths, notifications, desktop content, and
  personal information.
- **Motion proof** — extract uniform 30fps frames, inspect the page panel entrance and every X
  LNB transition as phase strips, and measure adjacent-frame stalls/cadence for each moving crop.
- **Agent proof** — each page take's recorded work receipt visibly names two
  `mcp.atlas-vault.get_concept` calls and one `mcp.atlas-vault.find_path` call; no write call
  appears. The X take instead holds the privacy-clean Agents destination long enough to read.
- **Breadth proof** — source-hidden evaluators classify the X cut as a codebase-ontology
  workbench by three seconds and recall at least four distinct work surfaces after viewing.
- **Asset contract** — `pnpm exec vitest run tests/contract/demo-clip-assets.contract.test.ts`.
- **Locale contract** — `/ko/download/` loads `.ko.` sources and `/en/download/` loads `.en.`
  sources; the two takes and posters are not byte-identical.
- **Responsive playback** — measure the video stage and poster at 1280, 1512, 1920, and 2560;
  verify the reduced-motion poster and play control remain available.
- **Hosted proof** — after deployment, verify the public Korean and English pages load the new
  duration and assets. A local static export is not hosted proof.

Recorded proof on 2026-08-30: 110 one-second privacy samples across the three MP4 files exposed
zero picker, path, notification, desktop, or personal-information frames. Both page takes'
expanded work receipts named two `mcp.atlas-vault.get_concept` calls and one
`mcp.atlas-vault.find_path` call, with no write call. Three source-hidden evaluators classified
the new X cut from its first three seconds and recalled all seven destinations; the old cut was
recalled as one or two work surfaces. The X take has 649 uniform 30fps frames. Across the six
active cursor moves, the LNB crop had 21 adjacent comparisons, one non-consecutive low-diff
ease tail and zero identical frames (`mean=0.281`, `cv=0.88`, `min=0.068`); the six-row phase
strip shows settled app states on both sides of every transition and no dropped desktop frame.

## 8. Retired scenarios

- **2026-08-22, 9.000 seconds** — loading → overview → one domain neighbourhood. Retired because
  the owner observed that it was too short and it did not show the agent promise made by the
  gateway.
- **2026-08-20, 199.13 seconds** — 2D, Dome, Cloud, ACP, and History. Retired because a
  three-minute feature tour demanded attention before proving the core loop.
- **2026-08-19, 88.83 seconds** — included folder selection and therefore failed the later
  privacy contract even though its product path was broader.

These durations remain historical evidence in `docs/DECISIONS.md`; they are not alternative
instructions for the current shoot.
