---
title: "Download page round three, slice 2: after a commit, after you install"
doc_type: spec
status: draft
area: product
date: 2026-10-03
decisions: []
---

# Download page round three, slice 2: after a commit, after you install

## Person and moment

The same reader as slice 1 (`docs/specs/2026-10-03-download-round-three.md`): a developer who runs Claude Code or
Codex, deciding in one scroll whether to install; next, someone learning agents who wants to know what they would see
first. The owner asked for refined, genuinely impressive motion where the evidence and agents sections were. Slice 1
leaves the page with no answer to "what does Atlas do for my next agent task" and "what will I see first". This slice
adds one figure for each moment. It is built only after the owner has seen the two rest frames
(`/Users/jinan/scratch/download-round3/rest-frames/01-08*.png`). No visitor has been observed, so AC-1 captures one.

## Today

- In the app, Insights' brief counts concepts "whose meaning stands while the code under it moved"
  (`src/views/ontology-insights/lib/brief/ontology-brief.ts:111`), dated from Git; it marks them with an amber dot
  (`ui/tabs/BriefTab.tsx:78-82`), lists name, file and both dates (`:628-641`), and offers Ask the agent (`:649`), a
  request for a judgement, never a write (`lib/brief/drift-handoff.ts:7-13`). It counts concepts an agent wrote that
  no person has looked at as unknown (`ontology-brief.ts:93-94`).
- The installed app with no folder opens on `firstRun.title` (`src/views/first-run/ui/FirstRunPage.tsx:24`); a code
  folder's first map card is `analyze` (`src/widgets/topology-controls/ui/VaultStartSteps.tsx:96-108`). An agent's
  ontology write shows one card titled by its change headline with `acpChat.permission.ontologyWriteBody`
  (`src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx:311-332`) and, once answered, `answered.allow` (`:304`).
- The conduction figure is the precedent for both figures: real vault names held by a test
  (`ConductionFigure.test.tsx`), a label that says "Illustration", a pause/replay control, a pause off-screen
  (`ConductionFigure.tsx:79-95`), a finished frame that is also the reduced-motion frame, and three light layers
  (`lib/conduction-scene.ts:48`, tracks at `:500`, drawn at `ui/ConductionScene.tsx:288-289`). Its cast
  (`model/conduction-cast.ts:24-46`) must not reappear in figure A.

## Problem and alternatives

The two moments that sell the product to this reader and are missing after slice 1: (1) after an agent's commit, the
reader sees which meanings to recheck, which makes the headline "Keep understanding your system" concrete; (2) after
installing, the reader sees the first screen and the first useful act, which answers the PO pass's "name the first
screen". The conduction figure already shows the mechanism (an agent asks, Atlas answers, a write waits), so neither
figure repeats it.

| Option | Value and usability | Feasibility and cost | Verdict |
|---|---|---|---|
| No figures (slice 1 as the page) | Lag-free, but no moment shown | Free | Lost: the reader cannot name what changes for them |
| One offline-rendered film per locale | Polished | Four locales, drifts from the app like the demo take | Lost: drift, upkeep |
| Captures of the real screens | True | Static; the screens section already does this | Lost: no cause and effect |
| Two DOM figures in the app's own words and this vault, motion only on attention | One moment each; rest frame is static HTML | About 60 animated elements, two tests | Chosen |

## Flow

Page: hero; conduction figure; demo; **A, After a commit** (`id="change"`); screens; **B, After you install**
(`id="start"`); colophon.

1. When A or B comes within a viewport, Atlas sets its opening frame; at 35% visible it plays once (A ~3 s, B ~4 s)
   and rests. Below 20% visible, in a hidden tab, or when another figure starts, it pauses and later resumes. Its
   control pauses, resumes and replays like the conduction figure's; a reload with it in view shows the rest frame.
2. When the agent's judgement in A would be wrong, nothing is written: the figure ends on the offer, and the lead
   says the answer waits. When the agent's draft in B is wrong, the person answers No thanks; B's middle step shows
   both buttons.
3. When reduced motion is on, the animation API is missing or throws, or scripting is off, each figure is its static
   rest frame with no control; the screen-reader description tells the whole story.

Both figures animate attention through a structure already present: the opening frame is the rest frame at
stepped-down ink (`--map-spotlight-rest-alpha`, the recent-change lens's "sink, not glow"), and beats raise ink in
causal order. Exceptions: A's three paths start over their commit rows and travel home; B's map fills only after Allow
once. Drawn controls are `inert` and the scene is `aria-hidden`, as in the conduction figure.

**Figure A.** Geometry: figure ≥ 900 px wide (1440 viewport: 1040 px), stage padded 24 px, ~410 px tall: commit card
272 px, concept column centred, brief panel 340 px, 32 px gaps, three cubic dashed threads from row ports to chips.
Narrower (1040 viewport: 640 px), padded 18 px, ≤ 520 px with the label row (rest frame measured 473 px): each commit
row carries its own concept chip, the calm chips drop out, brief rows show name and file name; cause and effect share
one 720 px viewport. Cast, held to the vault and disjoint from the conduction cast:

| Changed file (example commit) | Concept | Calm concepts |
|---|---|---|
| `src/views/library/ui/LibraryPage.tsx` (+18 −4) | Library workspace (capability) | Wiki pages |
| `src/features/library/lib/judge-page-write.ts` (+9 −2) | Wiki page write judge (element of Library workspace) | Ontology insights, Agent work visibility |
| `src/features/saved-constellations/model/use-saved-constellations.ts` (+6 −6) | Saved constellations (capability) | Graph block exchange |

Rest frame (poster, one focal point: the brief line): commit card full ink; threads at rest alpha, no light; moved
chips full with amber dots; calm chips stepped down; brief panel elevated, full ink, line expanded, rows with name, path
and `detailMoved` ("changed 2 minutes ago · document 6 days ago", relative to now), Ask the agent. The heading's key
phrase carries a 2 px amber underline, amber because it is the brief's own stale mark.

| t (ms) | Beat | What moves | Clock |
|---|---|---|---|
| 0 | Cause | commit card and rows rise from stepped-down to full ink | `--motion-base`, rows `STAGGER` |
| 360/480/600 | Conduction | the conduction light runs each thread, row port to chip, hop 180-420 ms | light tokens and tracks |
| on arrival | Impact | chip to full ink; amber dot set down | `--motion-fast`; `--motion-ease-place`, 240 ms |
| 1,100/1,135/1,170 | Continuity | each path travels from its commit row into its brief row, ~400 ms | `SPRING.surface`, `STAGGER` |
| 1,500 | Answer | brief panel and line to full ink; line's dot set down; heading underline draws scaleX 0→1 from the left | `--motion-base`; place; `--motion-settle` |
| 1,900 | Offer | Ask the agent to full ink; no pointer in A | `--motion-fast` |
| ~2,800 | Rest | calm chips stay stepped down; light gone | none |

| Animated element | Count | Property |
|---|---|---|
| Commit card, file rows | 1 + 3 | opacity |
| Conduction light layers (3 threads × halo, core, tip) | 9 | the conduction tracks |
| Moved chips, amber dots | 3 + 3 | opacity; transform |
| Traveling paths | 3 | transform |
| Brief line and dot, Ask the agent, heading underline | 2 + 1 + 1 | opacity; transform |
| Depth layers (scroll-linked) | 2 | transform |
| Total | 28 | cap 32 |

**Figure B.** Geometry: figure ≥ 900 px wide: three mini windows of equal width, 268 px tall, 24 px gaps, captions
`download.start.step1-3` on one start line below. Narrower: one 360 px window steps in place under the same three
captions as a strip; rest frame measured 516 px with the label row. Window 1: `firstRun.eyebrow`, `.title`,
`.openTitle` (filled), `.justStartTitle`. Window 2: map backdrop, card `topology.startSteps.analyze.title`, `.bodyAgent`,
`.ctaAgent`. Window 3: one permission card, title `ontologyChangeReview.headline.createBatch` ({count} 12, one write
batch), body `acpChat.permission.ontologyWriteBody`, buttons `.reject`, `.allowOnce`, over an empty map; after Allow once
the card shrinks to the stamp `acpChat.permission.answered.allow` and the map fills with 12 unnamed marks (1 project, 4
domains, 7 capabilities; the visitor's names are unknown) and the line
`ontologyPages.insights.brief.line.ontology-agent-unreviewed` with the hollow "not checked" ring. No dashed arriving
marks: in the app the proposal lives in the card, not on the map.

Rest frame (poster, one focal point: the drafted map): windows 1-2 stepped down; window 3 full with the map, the quiet
stamp and the unreviewed line; caption 3 full ink. The heading's key phrase carries an indigo underline (indigo marks
the act of allowing; amber stays the stale mark).

| t (ms) | Beat | What moves | Clock |
|---|---|---|---|
| 0/420 | Hand, press | pointer to Open my folder; window 1 to full; button 0.97 and back | `SPRING.surface`; `SPRING.control` |
| 520 | Cause | conduction light runs the gutter to window 2 (260 ms); window 1 steps down, window 2 to full | light; `--motion-base` |
| 900/1,300 | Hand, press | pointer to Ask the agent, press | `SPRING.surface`; `SPRING.control` |
| 1,400 | Question | light to window 3; window 2 steps down; window 3 and its card to full | light; `--motion-base` |
| 1,900/2,300 | Answer | pointer to Allow once, press; button fills | `SPRING.surface`; `SPRING.control`; `--motion-fast` |
| 2,450 | Stamp | card body leaves; its answer line moves to the window's top edge | `--motion-ease-exit`, 120 ms; `SPRING.surface` |
| 2,600/2,640/2,680 | The map fills, top first | three tier groups ink in with a 4 px rise; relations fade to rest alpha | `SPRING.canvas`; `--motion-base` |
| 2,800 | One light | project → domain → capability, two hops | light tokens |
| 3,300/3,500 | State, exit | unreviewed line to full ink; pointer leaves | `--motion-fast`; `--motion-ease-exit` |
| ~4,000 | Rest | windows 1-2 stepped down, window 3 full | none |

Narrower than 900 px, steps 1-3 crossfade in place in one window (`useSurfaceSwap` grammar) on the same clock, and the
strip's current caption takes full ink.

| Animated element | Count | Property |
|---|---|---|
| Windows (or the three in-place states) and captions | 3 + 3 | opacity |
| Pointer, pressed buttons | 1 + 3 | transform |
| Conduction light layers (2 gutter runs + 2 hops × 3) | 12 | the conduction tracks |
| Card body, stamp | 1 + 1 | opacity; transform |
| Tier groups, relations group, unreviewed line | 3 + 1 + 1 | transform, opacity; opacity |
| Heading underline, depth layers | 1 + 2 | transform |
| Total | 32 | cap 32 |

What makes both premium: one continuous element (A's paths fly into the brief); fewer, confident beats (A ~3 s, B ~4 s,
pointer only in B); staging (one zone or window at full ink); anticipation (each effect follows a press or a light
leaving its cause); overlap (each beat starts before the last settles); weight (house springs, tiers move as groups);
one light, gone by rest; a heading key phrase underlined at rest; 2-4 px scroll-linked depth between the figure's layers
through `animation-timeline: view()`, none under reduced motion; each rest frame composed as a poster with one focal
point. Slice 1's visibility gate rules apply unchanged.

## States

| State | Web | macOS app |
|---|---|---|
| Primed | Opening frame (rest frame stepped down); label `download.change.label` or `download.start.label` | Out of scope — the app never shows /download (`AGENTS.md`) |
| Playing | Control `downloadConduction.pause` | Out of scope — same reason |
| Paused by the person | Control `downloadConduction.resume` | Out of scope — same reason |
| Paused off-screen or hidden tab | Frame held; resumes on return | Out of scope — same reason |
| Finished | Rest frame; control `downloadConduction.replay` | Out of scope — same reason |
| Reduced motion, no animation API, scripting off | Rest frame, no control; `download.change.description`, `download.start.description` read aloud | Out of scope — same reason |
| Figure under 900 px | A stacked with row chips; B one window in place | Out of scope — same reason |
| ko, ja, zh | Equal window heights sized to the longest locale; no clamp, no clipped word | Out of scope — same reason |

## Copy

Drafted in `messages/en/download.json` and `messages/ko/download.json`; heading tags `<key>` mark the underlined phrase.

| Key | Where it appears | English |
|---|---|---|
| `download.change.eyebrow` | A, eyebrow | After a commit |
| `download.change.title` | A, heading | `When your agent commits, you see <key>which meanings to recheck</key>` |
| `download.change.sub` | A, lead | Concepts on the map name the files they describe. When a commit in your Git repository changes one of those files after its concept was last written, the app's Insights lists that concept with the file and both dates. Reread it yourself or ask your agent to; its answer waits for you. |
| `download.change.label` | A, frame label | Illustration · concepts and files from this repository's ontology; the commit is an example |
| `download.change.agentCommit` | A, commit card head | Your agent's commit |
| `download.change.filesChanged` | A, commit card count | {count, plural, one {# file changed} other {# files changed}} |
| `download.change.description` | A, screen-reader caption | An illustration. A coding agent's commit changes three files in this repository: {files}. Each is the file a concept on the map names: {concepts}. A light runs from each changed file to its concept, the concept takes the amber mark Insights gives a meaning whose code moved, and each file's path moves into the Insights brief, which reads “{line}” and offers “{askAgent}”. The concepts and files are this repository's own; the commit is an example. |
| `download.start.eyebrow` | B, eyebrow | After you install |
| `download.start.title` | B, heading | `Open your project, and <key>let your agent draft the map</key>` |
| `download.start.sub` | B, lead | The app opens by asking for a folder. Open your project's, and the first card offers to have your coding agent read the code and draft the map. Nothing is written until you allow it, and what is written is Markdown in that folder, never your code. |
| `download.start.label` | B, frame label | Illustration · the app's own screens and words, drawn small |
| `download.start.step1`, `step2`, `step3` | B, captions | The first screen asks for a folder. / In a code folder, the first card offers your agent's draft. / The draft waits for your answer, then fills the map. |
| `download.start.description` | B, screen-reader caption | An illustration in three steps. First, the app's first screen, “{firstTitle}”, with the button “{openFolder}”. Second, a code folder is open and the first card reads “{draftTitle}”: {draftBody} Its button “{askAgent}” hands the request to the coding agent. Third, the draft arrives as one card, “{headline}”: {writeBody} After “{allowOnce}”, the card reads “{allowed}”, {count} concepts fill the map, and Insights lists them as “{unreviewed}”. |

Rendered unchanged from their own namespaces: `downloadConduction.agent`, `.pause`, `.resume`, `.replay`;
`navRail.insights`; `ontologyPages.insights.tab.brief`; `ontologyPages.insights.brief.line.ontology-evidence-moved`,
`.ontology-agent-unreviewed`, `.detailMoved`, `.askAgent`; `firstRun.eyebrow`, `.title`, `.openTitle`, `.justStartTitle`;
`topology.startSteps.analyze.*`; `acpChat.permission.ontologyWriteBody`, `.reject`, `.allowOnce`, `.answered.allow`;
`ontologyChangeReview.headline.createBatch`; `kinds.*`. The hosted check's needles move to these two titles with the
`<key>` tags stripped. ja and zh: add `change.*` and `start.*`.

## Edge cases

- Counts are fixed (3 files, 12 concepts). If the vault renames or drops a cast concept or a `path:` changes, the cast
  test fails the build instead of the page naming a dead concept.
- First visit plays each figure once; a reload with it in view does not autoplay over reading.
- Hangul keeps `break-keep`; paths break only after a slash; at 320 px both figures stack and nothing scrolls sideways.
- Reduced motion switched on mid-run jumps to the rest frame; a hidden tab pauses; two figures in view on a tall
  screen: the later start wins.
- Offline: both figures are static and inline.
- Moved or unreadable folders and two edits at once do not apply: the page reads no folder and writes nothing.

## Out of scope

- Everything in slice 1 (removals, visibility gate, checksum, Map row) and the Mac control (#2420).
- Naming the visitor's own concepts in B: unknown before they open a folder.
- The not-checked state in A: this vault's real count (most concepts are agent-written and unreviewed) would
  contradict any small number, so A shows only the moved line.

## Acceptance criteria

1. Given the rebuilt page at 1440 in en and ko, When a first-time reader (uses coding agents, never saw Atlas) scrolls
   past A and B, Then they say what Atlas does for their next agent task and name the first screen (`firstRun.title`);
   fail when A or B needs MCP tool names or frontmatter, or claims something the app does not ship. `/ui-proof`.
2. Given slice 1's probe, When it runs the brisk and parked legs (parked on A and B until each rests) at 1440×900,
   1040×720 and 1920×1080, DPR 2, Then each leg's median of 3 keeps ≤ 2% dropped frames, no frame interval over 50 ms
   and no long task over 50 ms. `tests/e2e/download-scroll-budget.spec.ts`.
3. Given reduced motion or scripting off, Then A and B render their rest frame on first paint, `Element.animate` is never
   called for them, no control renders, and their text is in the static HTML. New `ChangeFigure.test.tsx`,
   `StartFigure.test.tsx`; `tests/e2e/download-still.spec.ts`.
4. Given the vault, Then every A concept's `path:` equals its file and the file exists, no A concept is in
   `CONDUCTION_CAST`, B renders exactly the reused keys under Copy, and `VaultStartSteps` still leads with `analyze` for a
   code folder. `ChangeFigure.test.tsx`, `StartFigure.test.tsx`, `VaultStartSteps.test.tsx`.
5. Given A and B at rest, Then each holds no running animation and no composited layer, and at most 32 elements per
   figure carried an animation during its run. `tests/e2e/download-visibility-gate.spec.ts`.
6. Given real macOS recordings at 1440 and 1040, Then every beat starts within 33 ms of its table time, no stall exceeds
   50 ms in the run, and the rest frame matches the reduced-motion frame within 0.5% of pixels. `/ui-proof`.
7. Given 1040×720, Then A's figure is ≤ 520 px tall, B is one window stepping in place, and each figure's cause and effect
   fit one viewport; at 1040, 1440 and 1920 in en, ko, ja and zh nothing overflows and B's windows are equal height.
   `/ui-proof`.
8. Given the owner's approved rest-frame PNGs, Then the built rest frames keep their composition: the same zones, focal
   point and copy at 1440×900 and 1040×720. `/ui-proof` against `/Users/jinan/scratch/download-round3/rest-frames/`.

## Risks

1. The figures read as decoration. Probe: AC-1 once with reduced motion and once without; failing both means the copy
   is wrong, failing only in motion means the choreography is. Design: lead and captions carry the point unmoving.
2. B's 32 elements at the cap tip the GPU at 1920×1080. Probe: AC-2's parked leg on B; fallback: one hop of the final
   light goes, which frees three layers.
3. The figures drift from the app (start-step order, brief wording, permission card). Answer: rendered keys, the vault
   cast test and the step-order assertion (AC-4); `docs/features/download.md` names both figures as consumers.

## Later

1. A's not-checked line, once a real vault shows a small honest count: next after the review-state work lands.
2. B naming the visitor's concepts from the sample vault: next if AC-1 readers find unnamed marks abstract.

## Owner question

Do the two rest frames in `/Users/jinan/scratch/download-round3/rest-frames/` say it, so A and B are built as shown?
Yes builds this slice as specified; no, with the frame named, sends that figure back to its rest frame first.
