---
title: Moru Identity
doc_type: spec
status: draft
area: design-system
date: 2026-11-12
decisions: [acd9f35c-ae54-45ae-8f19-0a03ff732b12]
---

# Moru Identity

## Person and moment

The owner selected **Moru**, then noticed an incorrect right eye in an exported
sprite and asked for verification before expansion (product-check brief, 2026-11-12). They want many
expressions, project-owned sources, synchronized READMEs, and situational motion.

An agent user must distinguish observed from unknown activity; visitors and learners should recognize Atlas and enter its existing flows.

## Today

Observed baseline before this change at `43d02994ffd36ab3e301b11a5d0e3425eaaf1fa4`
(the paths and line references below describe that revision):

- The traveler owns shipping marks/activity; the rail is brand-free (`docs/design/brand.md:15`,
  `docs/design/brand.md:39`). Moru's manifest labels animations as candidates (`assets/brand/moru/moru.json:4`).
- README uses raster lockups and existing download/browser links (`README.md:3`,
  `README.md:18`). The download view serves the gateway and selects its CTA from release/platform facts
  (`src/views/download/ui/DownloadPage.tsx:56`, `src/views/download/ui/DownloadPage.tsx:64`).
- Gateway chrome has a decorative mark beside the Atlas name; folder entry and
  404 have portraits (`src/widgets/gateway-chrome/ui/GatewayNav.tsx:60`,
  `src/views/first-run/ui/FirstRunPage.tsx:169`, `src/views/terminal-state/ui/NotFoundScreen.tsx:82`).
- Pending art is decorative; its parent owns status/cancellation. It pauses
  offscreen/hidden and stays still under reduced motion
  (`src/shared/ui/marks/brand-waiting-mark.tsx:7`, `src/shared/ui/marks/brand-waiting-mark.tsx:28`).
- Read poses require a current read-like tool; completion requires a timestamped
  terminal projection (`src/features/agent-activity/model/mascot-state.ts:5`).
  Idle/unverified work hides the finite sequence (`src/features/agent-activity/ui/AgentMascotPresence.tsx:100`).
- The recorded capability separates presence from approval and excludes claiming
  work with the app closed; its source review is limited
  (`docs/ontology/capabilities/agent-work-visibility.md:14`). No live-agent session,
  largest-vault measurement, or installed-app rendering was observed for this spec.

## Problem and alternatives

The export defect loses the selected appearance; more frames would multiply it.
Separate app identification from expression so a tiny icon need not preserve the
full character's face. Owner selection does not prove unfamiliar users recognize either mark.

| Rank | Value returned | Cost and reason for ordering |
|---|---|---|
| 1. Source/export fidelity | Restores the selected eyes and silhouette | Small; every derivative depends on it |
| 2. Coherent compass/Moru fan-out | Makes the existing entry surfaces agree | Moderate; prevents mixed traveler/seal identity |
| 3. Rich catalogue and contextual motion | Adds requested expression without false reassurance | Moderate art/QA; runtime follows verified contexts |

| Alternative | Value/usability | Feasibility, local-first fit, cost; choice |
|---|---|---|
| Keep traveler, separate candidate pack | Preserves familiar appearance; leaves owner's selection unapplied | Lowest cost, local assets; rejected by owner selection |
| Moru as every app/OS/browser mark | One character everywhere; small face carries both identity and expression | Existing pipeline is close, local assets; loses the selected independent compass role |
| Compass identity plus Moru companion | Stable app identification and expressive company in existing slots | Moderate fan-out, entirely local; chosen |

The current pack covers all requested surfaces and **74 distinct named animation clips
and 16 static expressions/poses**. The owner subsequently requested more expressive gestures beyond the initial 30–50 range;
58 clips are authored motions and 16 are explicitly labelled compositions.
Sizes/formats do not count
as new clips or poses. Each clip records its authored source or constituent poses
and timing; compositions are labelled. Keep references, prompts, masters, exports,
manifest, and preview in `assets/brand/moru/` or the existing project brand pipeline.

Moru retains a low, round warm stone-gray body, ivory cheek/belly, indigo flippers
and forked tail. The compass owns app/OS/browser symbols, gateway chrome, and lockup
identity. Moru owns character, portrait, and activity slots plus a static README
showcase. Runtime uses only the contextual subset below. The Atlas name, current
routes/actions, and brand-free rail remain; users lose the familiar traveler art.
Supersede the appearance and single-mascot-mark choice in the
[2026-10-02 decision](../records/decisions/2026-10-02-planet-traveler-identity-5b4ca3c7-ae8f-4ac8-a729-3c9b721ab982.md),
retaining evidence-bound motion and raster tier constraints (`docs/DECISIONS.md:1751`).

## Flow

1. When the person inspects the project preview, the pack shows corrected eyes,
   every named pose/clip, native/enlarged pixels, and source provenance before fan-out.
2. When the person reads any README or visits the existing gateway/download,
   Atlas presents compass identity and Moru without changing the promise or CTA facts.
3. When the person enters folder selection, Atlas uses the existing welcome slot:
   bounded decorative play with finite pet reactions, a character context menu for pause/resume and reduced-motion stillness; re-renders do not restart it.
4. When the person starts a real pending operation, Moru accompanies the existing
   status/cancel controls without progress percentages, read claims, or predictions.
5. When the person's feed verifies a read, Atlas keeps the finite entrance/read
   sequence; only that sequence's observed completion gets a brief completion gesture.
6. When the agent is wrong or evidence is missing, Atlas retains the existing
   explanation/recovery action. Stop, permission, error, and silence remove pending
   motion; Moru never approves work or turns unknown activity into success.
7. When the person hides the app, scrolls the mark away, or requests reduced motion,
   Atlas pauses or stays still while preserving status and actions. Quiet stays quiet.

## States

| State | Web | macOS app |
|---|---|---|
| Public identity | Atlas name; existing `download.primaryCtaPublished` / `download.webCta` conditions; choose CTA | Out of scope — installed app does not offer its own download |
| Empty / greeting | `firstRun.title`; `firstRun.openTitle`; bounded decorative playground | Same keys/actions; existing chooser may use `vaultSwitch.choose.title` |
| Loading / pending | Existing operation status/action, e.g. `firstRun.busy`; await folder result | `acpChat.starting.title` / `acpChat.firstRun.title`; wait or `acpChat.stop` |
| Verified entry / read | `agentActivity.mascot.detected` then `.reading`; inspect existing agent-work control | Same keys/actions; finite motion then still |
| Verified completion | `agentActivity.mascot.success`; inspect result; gesture ends | Same key/action; no meaning-acceptance claim |
| Quiet / unverified | `agentActivity.quietUnknown` if status is shown; inspect history; no work pose | Same key/action; no work pose |
| Error / stopped | `notFound.title`; `notFound.home` / `.previous`; static curious portrait | Same 404 title, `notFound.findByProject`; stopped connection uses `acpChat.connectStopped.title` / `.again`, without pending art |
| Partial / missing evidence | `agentActivity.quietUnknown` when unverified; inspect existing evidence | Same rule; permission uses `acpChat.permission.ontologyWriteTitle`; answer existing allow/reject card |
| Largest measured vault | No size-specific copy; existing status/action; count unknown in this spec | Same; use existing largest available dense-map fixture for overlap proof |
| Hidden / reduced motion | Underlying status/action retained; hidden motion pauses, reduced motion stays still | Same; no new background presence |

## Copy

Runtime art mapping (other catalogue clips have service contexts, not new app states):

| Context | Named source and playback | Still / transition |
|---|---|---|
| First-run / download welcome | Contextual native 128px selection/welcome gestures | Bounded play; context-menu pause, visibility and reduced-motion guards |
| Actual pending | `blink`; `connect` for tool preparation, `source-read` for Compile; existing guarded cadence | Neutral; active=false removes the mark |
| Verified entrance (`walk`) | `wave`, finite 1920ms entrance | Neutral shared endpoint before read |
| Verified read (`read`) | `source-read`, one twenty-four-frame finite cycle (1920ms) | Neutral; text retains read state after motion ends |
| Verified completion (`success`) | `dance`, one finite 1920ms cycle with a 2520ms hold | Neutral; existing terminal timer hides it |
| Error / quiet / reduced motion | Curious portrait / hidden / neutral respectively | No completion or pending loop |

Existing duration ramps supply the longer twenty-four-frame timings; cancellation/visibility guards remain authoritative;
the catalogue preserves its slower standalone GIF timing separately. AC5/7 inspect
these exact sequences and endpoints, rather than state labels alone. Catalogue
contexts name source-owned folder, search, relation review, proposal, permission,
save, retry, stop and no-result moments; artwork never changes approval authority.
The owner also requested silent singing/notes, fish play, dancing and a miniature
Moru chorus (2026-11-13). These four catalogue clips are expressive art, not new
service states.

The four localized `moru` catalogues name petting, pause, resume and reduced motion. Other service status strings remain unchanged; approved identity labels are
“Ontology Atlas” and “Moru”. README prose changes are localized together.

| Key | Where it appears | English |
|---|---|---|
| `firstRun.title` | Folder entry | Open a folder to start working |
| `firstRun.openTitle` | Folder action | Open my folder |
| `firstRun.busy` | Opening folder | Opening folder… |
| `acpChat.starting.title` | Real connection pending | Connecting to the tool |
| `acpChat.firstRun.title` | Real tool preparation | Getting this tool ready |
| `acpChat.stop` | Pending cancellation | Stop |
| `agentActivity.mascot.detected` | Verified entrance | Verified agent reading detected. |
| `agentActivity.mascot.reading` | Verified read | The agent is reading the ontology. |
| `agentActivity.mascot.success` | Observed completion | The verified agent work completed. |
| `agentActivity.quietUnknown` | Existing quiet status | Quiet |

Sources: `messages/en/{firstRun,acpChat,agentActivity}.json` and corresponding Korean namespaces; other unchanged keys stay screen-owned.

## Edge cases

- Empty, one-concept, and largest available dense vault: identical motion rules;
  no per-node instances, graph-ink overlap, blocked controls, or extra focus stops.
- First run/re-renders: continuous decorative play stays inside its measured area; folder actions work immediately.
- Hangul input: preserve composer input, focus, and keyboard behavior.
- Moved/renamed/unreadable folder: keep path/access failure and picker recovery.
- Concurrent edits or stale/missing heartbeat: keep conflict/unknown and evidence;
  a file change alone cannot produce completion. First answer removes pending art.
- Offline: local art requires no service; existing network/release behavior applies.
- Reduced motion or missing visibility observation: static pose and unchanged text.

## Out of scope

- New gallery route, game, personal-memory feature, or persona: the project preview supplies the catalogue.
- New telemetry, progress source, capability, or vault write: truth, transfer, write, and correction boundaries remain.
- New rail branding or roaming overlay: navigation and graph priority stand.
- FDE service positioning or safety guarantees: the compass remains a metaphor.
- Merge, release, publication, or unrelated platform behavior: not requested.

## Acceptance criteria

1. **Given** the selected source and defective export, **when** the pack is
   regenerated, **then** native/enlarged comparisons show faithful paired eyes,
   no unintended indigo eye edge, clipping, jitter, or ground-contact drift.
   Check preview captures and `brand-asset-parity.contract.test.ts`; preserve eye evidence.
2. **Given** the catalogue, **when** manifest and preview are inspected, **then**
   74 distinct clips and 16 static poses resolve to project sources and
   exports, with compositions/timing identified. Open every clip in `assets/brand/moru/preview.html` at 64px and 128px.
3. **Given** current consumers, **when** pipeline/parity checks run, **then**
   compass symbols and Moru slots consistently replace traveler art; compass at
   16/32px and Moru at 32/64px remain legible. Check `brand-assets-present.contract.test.ts`,
   gateway capture, and installed Dock/tray capture.
4. **Given** en/ko/ja/zh READMEs and gateway/download, **when** inspected, **then**
   identity agrees, existing destinations/release facts remain, and the CTA is
   reachable at 320px and desktop widths. Check image/link inventory and affected
   design audit and `/en/download/` + `/ko/download/` browser walk.
5. **Given** pending, verified read, early completion, quiet, and stale work,
   **when** transitions occur, **then** only the specified pose/status appears.
   Check `mascot-state.test.ts`, `AgentMascotPresence.test.tsx`, and the
   affected-state browser/native walk; completion never accepts meaning.
6. **Given** pending work, **when** Stop, permission, first answer, failure, or
   silence occurs, **then** pending art disappears and input/status/recovery remain
   usable, without false completion. Check waiting-mark tests and an installed-app
   start/Stop/reconnect walk as the recovery proof.
7. **Given** decorative play/work sequences, **when** reduced motion, offscreen, hidden,
   and repeated-render cases occur, **then** motion stops as specified without
   lost text/focus or teleporting transitions. Check changed-sequence motion capture,
   `brand-waiting-mark.test.tsx`, and `reduced-motion-equivalent.contract.test.ts`.
8. **Given** the dense-map fixture and installed app, **when** inspected at 2560px
   and 1920px widths, **then** Moru stays in its slot without covering graph ink or
   controls, and the app offers no self-download. Check the affected-state
   computer-use loop and `pnpm checks:changed -- --run`.

## Risks

1. Palette conversion corrupts eyes/silhouette: compare every tier before fan-out; retain adverse eye evidence.
2. Motion falsely reassures/distracts: retain state authority; probe cancellation, absent evidence, reduced motion, and dense-map overlap.
3. Split identity or stale traveler art: inventory consumers, inspect icons/README
   themes, and update the canonical brand document plus superseding decision.

## Later

1. More reactions after an observed user moment can drive them without invented status or interruptions.
2. Broader recognition research after tier captures pass; owner selection alone does not establish recognition.

## Owner question

None — character, name, compass family, and surfaces are authorized; compass refinement and pixel QA are acceptance work. Retained sources provide a way back.

The 2026-11-13 owner correction replaces the finite entry greeting and static
download portrait with native 128px decorative play. Copy keys `moru.pause`,
`moru.resume` and `moru.still` name the character context-menu playback action in all four locales; `moru.interact` names the transparent character target (English: “Pet Moru”).
The stage owns travel bounds; work-state authority and navigation stay unchanged.

The later owner correction makes character presses produce one finite `shy`, `clap`,
`dance`, `thinking`, `pondering`, `hearts`, `laugh` or `flipper-groove` response instead of a rectangular pressed surface
or a pause toggle. Somersault, toy-fishing, laptop-code, frown, temper and floating-ontology scenes are available in
the catalogue and README; they do not stand in for observed application activity.
Airborne hops land before reacting; repeated clicks do not queue. A busy chooser
uses quiet `blink`/`tilt` waiting; folder opening can replace it with the existing
waiting view. Download uses a welcome without the folder prop.
Explicit pause and reduced motion permit a still expression without resumed motion.

The owner rejected an always-visible playback icon beside Moru. Only the character
is visible at rest; secondary-click or Shift+F10 opens the existing pause/resume
action in a dismissible context menu. Primary click still gives the finite response.

Pointer and keyboard attention holds finish an airborne hop before resting.
Explicit pause, reduced motion and hidden/offscreen guards still stop immediately.
Leaving the character cancels a pending attention hold.

The next owner request adds eight 32-pose gestures: soft bow, hat tip, fish trick,
peekaboo, rosy temper, flipper five, folder peek and bubble chase. Folder entry
uses folder peek and bow; touch adds bow, flipper five and hat tip. Only welcome
touch includes the fish trick. A waiting chooser answers gently without props or
celebration. Rosy temper stays a catalogue expression, never an error response.
Wordless pixel bubbles show a heart, note or sparkle on touch and occasionally a
note during a return hop. They stay within the companion, add no control or live
announcement, and follow visibility, pause and reduced-motion guards.

The subsequent polish pass keeps the catalogue at 70 clips. It preserves the
rounded body during the small nod, retimes anticipation and settling in the core
gestures, and uses three quiet ambient phrases with a stable starting variation.
Click responses draw the whole contextual repertoire without recently repeated
gestures; the first response remains gentle. Visibility, resize, explicit pause
and reduced motion preserve their existing guards.

The November 14 expansion adds four 32-pose encounters: nose-star balancing, a
sparkle sneeze, pup peekaboo and a heart gift, and redraws the flipper groove with
32 poses. The gentle first pet remains; the second discovers a new encounter.
The complete contextual bag still avoids recent repeats. Folder entry uses 14
responses; welcome uses 18, adding the sneeze, fish trick, singing and bubble
chase. Props and drawn notes replace an extra speech bubble. A pup occasionally
peeks out during the longer idle routine; waiting remains quiet and stationary.
Sources, prompts and the four localized README examples ship with the 74-clip
pack. Existing scene framing keeps blanket peekaboo in the catalogue.
