# Demo Video Shooting Scenario — `atlas-tour` (Revised 2026-08-22)

> One clip · **9 seconds** · No cuts · No speed changes · No audio · No loop · **Record separately in Korean/English**.
> The implementation of the playback contract is in `src/views/download/ui/DemoStage.tsx`, and the asset registration section is
> in `src/views/download/model/demo-clips.ts`.

## 0-1. Revised 2026-08-22 — Abandoning the tour, leaving only one scene

**What has changed**: This section used to argue for a 155-second tour. Now it is just **one scene** above the installation step; the tour demands three minutes before the audience even has a reason to watch.
So we left only the single claim the map makes — *click one node, and the graph responds with its neighbors.*

**What Changed**: This section used to earn its place as a gateway argument with 155 seconds. Now it’s just **one scene** above the installation stage, and the tour demands three minutes before giving the audience any reason to watch. So only one claim remains from the map — *clicking one node makes the graph respond to its neighbors.*

**Owner Directive Two** (2026-08-22):

- *"Ignore the map layout"* — The clustering of nodes is not the subject of this shot; the layout will be adjusted separately.
- *"There's no folder selection during recording, right? Record in the already designated folder."* — §0(a) extends the rule established for privacy reasons **to scene selection as well**. There is not even a single frame of a file selection dialog box, nor any bit representing "choosing a folder." We do not spend 2 seconds out of 9 on something assumed to be already done.

**New Beat — 9 seconds, acceleration section 0**

| 0.0~1.0 | The app opens to a folder it already knows | Prep card → INDEX appears |
|---|---|---|
| 1.0~2.0 | The map draws itself and settles | 7 domains surround the hub |
| 2.0~3.9 | Selection | The audience reads the whole |
| 3.9 | Click one domain node | — |
| 3.9~9.0 | Only neighbors remain, others blur | Detail panel: 16 sub · 1 parent · 1 reference doc |
| 3.9~9.0 | Only neighbors remain, others blur | Detail panel: Lower 16 · Upper 1 · Source document 1 |

**Automation note** — Coordinates are window-relative. The `coordinateSpace` of `orca computer click --x --y` is `window`, so the 33px title bar is **not included in the offset**. And `screencapture -R 0,33,1512,949` returns 3024×1898 Retina pixels, so **pixels ÷ 2 = window-relative logical coordinates**. Confusing these two caused the node clicks in the first two takes to land on a blank canvas.

**Automation Note** — Coordinates are window-relative. Since the `coordinateSpace` of `orca computer click --x --y` is `window`, the 33px title bar is **not included in the offset**. Additionally, because `screencapture -R 0,33,1512,949` returns 3024×1898 Retina pixels, **pixels ÷ 2 = window-relative logical coordinates**. Confusing these two caused the node clicks in the first two takes to land on the empty canvas.

### (a) Finish prep outside the shoot — it was a privacy flaw

### (a) Preparation Ends Outside the Shoot — A Privacy Defect

This is not a matter of directorial taste; it is **personal privacy embedded in the asset**. So we codify this rule:

This is not a matter of directorial preference; it's about **the asset having someone else's (the cinematographer's) privacy embedded in it**.

Therefore, we are establishing this as a rule:

> **Finalize all settings before shooting.** Neither bolt selection nor agent connections are made within the frame. While the camera is rolling, only the **result** appears on screen.

This rule protects privacy in two layers:

1. **It does not contain an OS file selection dialog** — the sidebar and list display the photographer’s home directory structure in its entirety.
2. **It does not contain an agent connection screen** — the connect button displays the vault’s **absolute path** on screen (`/Users/<person>/...`). The value of the connection is “not touching the configuration file,” which the gateway’s static screen message already conveys. What the video captures is the round trip **after** the connection.

The same applies to the act of choosing a folder. The gate's message already says it all ("Choosing a folder becomes a map"). What unfolds next is what happens **after you choose**.

As a side effect, the first 5 seconds are played in full — previously, those 5 seconds were just an empty dialogue box.

### (B) Aligning the beat sheet with the current app

The previous 45-second beat sheet (2026-08-03) was from a time when there were no 3D placements, and the actual filming did not follow it. The document remained inconsistent with reality. This time, I rewrite it using the current app's screen and control names.

**Remove the length cap.** Owner's judgment (2026-08-19): "It can exceed 2 minutes, so make it work properly." The previous 45-second constraint forced us to omit required content, resulting in a mismatch between the document and assets.

## 1. The One Sentence This Video Must Convey

> **My folder becomes a map, and my agent uses that same map.**

If the audience doesn't walk away with this sentence, the scenario is wrong. It must not be a list of features, but a compression of **one person's 5 minutes**.

## 2. Shooting Specifications

| Item | Value |
|---|---|
| Resolution | 1512 × 918 (14" logical resolution · app window only, excluding desktop and menu bar) |
| Duration | **Approx. 155 seconds + actual download time** — measure after filming and align with `DEMO_CLIPS[0].seconds` |
| Cuts | **0** — One take. If you make a mistake, start over |
| Sound | None (including BGM: 0) |
| Cursor | Visible. Do not use click highlights |
| Speed | Constant speed. No speeding up or jumping |
| Deliverables | `atlas-tour.{ko,en}.webm` + `.mp4` + `atlas-tour.{ko,en}-poster.png` |

**The vault must be real.** The demo's 3-node folder reads as "this is a toy" on the first screen. Use this repository's `docs/ontology` (currently 82 nodes) — do not list the count in the document; verify it with `node cli/src/index.mjs overview`.

**Only the app window should be in frame.** Do not include the menu bar, dock, desktop, or notifications. (This is for the same reason as (a) — there is private information outside the window.)

**Language switch:** Change EN/KO in Settings › Display › Language, then film **the same route again**. If the duration difference between the two videos exceeds 10 seconds, one of them took a different route.

## 3. Beats — Approx. 155 seconds

The "remaining image" of each beat is its purpose. If no image remains, that beat can be omitted. The text in parentheses indicates the actual control name (`data-testid`).

| Seconds | What to do | Remaining Image |
|---|---|---|
| 0–6 | **Do nothing.** The Bolt is already open, showing a 2D map. Wait without touching it | The folder has already become an image |
| 6–20 | **Click one node.** Only neighbors remain; others recede. Facts about that concept appear beside it | "What is this and what is it connected to?" |
| 20–32 | **Tap one more neighbor in that fact.** The map shifts toward it. Click is movement. |
| 32–46 | **Search in INDEX** (`topology-concept-search`). Type the name, tap a result, and the map moves there. Speed of finding one among 82 items. |
| 46–58 | **Tap auto-arrange** (`topology-auto-arrange`). Scattered nodes gather back into place. You can undo this anytime. |
| 58–86 | **Turn on 3D** (`topology-view-3d`). Watch the dome assemble completely. Rotate it with your hand. The moment a flat surface becomes a shape. |
| 86–100 | **Select a concept from the left list.** The dome refocuses on it. 3D is also a tool for reading. |
| 100–118 | **Change layout to 'Cloud'.** A different layout spreads, where relationships determine angles. Same data, different question. |
| 118–124 | **Return to 2D.** The plane stands up again. No cost for round trips. |
| 124–150 | **Ask the agent.** Open the panel (already prepared), ask one sentence about this folder, and watch the answer arrive. The human and the agent look at the **same folder**. |
| 150–155 | **Go to History** (`app-nav-rail-item-git`). It shows the lines left by your recent actions. Your work is saved as a file. |

### Download Bit — Decided to Exclude (Measured on 2026-08-19)

Owner instruction (2026-08-19): *"It would be good to include the download process in the recording if possible."* The adapter's first run downloads tens of MB. The value of this bit is **showing that time without hiding it** — what that wait actually looks like for someone opening it for the first time, and what the app is doing during that time, remains on screen.

This does not conflict with rule (a) 'settings outside the frame.' That rule blocks **the recorder's privacy from entering the frame** (file selection dialog · absolute paths), whereas adapter download is a **product's first experience** that happens identically on anyone's screen.

**So we re-shot it, and decided to exclude the result.** The criteria were as follows:

| Measurement | How |
|---|---|
| ~20 seconds or less | Capture as is. Waiting is also a fact. |
| 20–40 seconds | Capture, but trim the bits before and after so the total doesn't stretch out. |
| Over 40 seconds | **Do not capture.** In a cut-free video, a progress bar over 40 seconds loses the audience. |

**Measurement (2026-08-19, installer rc.8)**: The adapter was not 'tens of MB' but **277–352 MB**. After clearing the cache and opening a new conversation, the screen showed 'Received 32 MB so far,' and it took **several minutes** to complete. This significantly exceeds the 40-second threshold, so this bit is excluded.

**Instead, shoot with the cache filled.** The first-run experience is handled by the gate's stop-screen message.

⚠️ **The document stating 'tens of MB' was incorrect.** The progress message also says so (`acpChat.firstRun.body`), so when that message is corrected next, update it with the measured value — telling users tens of MB but delivering 300 MB is a lie.

Measurement method (for next time): Delete the adapter cache entry in `~/.npm/_npx` (→ reproducing first-run state), open a new conversation in the app, and measure from when progress appears to when the conversation opens. The hash is calculated as `sha512(package spec).hex[..16]` (`src-tauri/src/acp.rs`).

### Rules Between Bits

- **The last 1 second of each bit is a freeze.** Let go of your hand and let the screen settle — if the next action starts before the audience's eyes arrive, nothing remains.
- **Typos · Undo · Hesitation are re-shot.** Since it's cut-free, that time remains as is.
- **Pre-determine the sentence asked to the agent.** If you improvise, typos occur, and typos require re-shooting. The sentence must be one that **actually yields an answer** in this folder — if the answer is empty, this bit shows the product failing.
- **Do not touch the screen while waiting for the agent's answer.** Waiting is also a fact. However, if it exceeds 30 seconds, redesign that bit (the audience has left).

## 4. Pre-shoot Checklist

- [ ] **VOLT is already open** — When the app launches, the first screen is the map. If a file selection dialog appears, discard that take.
- [ ] Settings › Notifications › Auto-show screen guide **OFF** (tour cards cover half the screen)
- [ ] VOLT = `docs/ontology`
- [ ] Window size 1512 × 918, app in full-screen, **only the window frame is captured**
- [ ] Clear OS distractions like notifications and battery warnings (enable Do Not Disturb mode)
- [ ] Language matches the target locale
- [ ] The agent is **pre-prepared** — do not capture Settings «Process» or the first run «Download» (see section (a)-2 · Download bits). When opening the panel, it should show "Ready"
- [ ] The adapter cache for the agent to use is **populated** — open it once just before recording to verify
- [ ] The question posed to the agent is fixed, and **you have verified beforehand that the answer actually appears**. If a blank answer comes during recording, discard that take.
- [ ] Cleared notification badges and unread indicators in advance (so numbers in the top-right corner do not remain in the frame)
- [ ] Closed and reopened the app to verify **the first screen is the map** (to confirm settings persist)

## 5. Post-recording — Activation Procedure

```bash
# 1) Place assets (webm + mp4 + poster, per locale)
public/demo/atlas-tour.ko.webm
public/demo/atlas-tour.ko.mp4
public/demo/atlas-tour.ko-poster.png
public/demo/atlas-tour.en.webm
public/demo/atlas-tour.en.mp4
public/demo/atlas-tour.en-poster.png

# 2) Measure the length and match it to DEMO_CLIPS[0].seconds
ffprobe -v error -show_entries format=duration -of csv=p=0 public/demo/atlas-tour.ko.mp4

# 3) Enable the registry — this section will not appear until this line is fixed
#    src/views/download/model/demo-clips.ts
#    export const AVAILABLE_DEMO_CLIP_IDS = ['atlas-tour'];
```

**Both the asset and the declaration must exist for it to activate.** If you enable it based solely on file existence, a partially loaded asset will remain in the initial impression spot.

## 6. Post-activation Gate

- **Frame sweep** — Extract frames from the recorded video at 1-second intervals and visually verify that **no frame contains anything outside the window or personal information**. Previous incidents occurred precisely due to the absence of this check:

  ```bash
  ffmpeg -i public/demo/atlas-tour.ko.mp4 -vf "fps=1,scale=760:-1,tile=6x5" /tmp/sheet-%d.png
  ```

- `/design-audit` — Verify whether the video row starts and ends at x coordinates matching the section title (it shifted twice previously: by 188px due to `mx-auto`, and by 344px to the viewport top)
- `/responsive-sweep` — Check for overflow and poster aspect ratio at 1280 · 1512 · 1920 · 2560
- In reduced-motion mode, verify **whether the poster remains and the play button appears** — disabling autoplay alone is not enough; the content must not be stripped. That is the purpose of reduced motion.
- Verify that each locale receives its own video (`.ko.` / `.en.` paths)
- `pnpm exec vitest run tests/contract/demo-clip-assets.contract.test.ts` — **whether the declared `seconds` matches the actual MP4 length.** This document previously noted "post-recording gate comparison," but no such gate existed (discovered 2026-08-20). Numbers quietly rot, so now we read directly from the `mvhd` box for comparison.

## 7. What is currently attached

**2026-08-22 recording, measured 9.000 seconds · per locale** (installer · VOLT `docs/ontology` 82 nodes · window 1512×949 · built-in display · 30fps).
There is no privacy defect in §0(a) — the VOLT was connected before recording, and the file selection dialog did not appear in any frame.

| | webm (AV1) | mp4 (H.264) | poster |
|---|---:|---:|---:|
| `ko` | 267KB | 285KB | 195KB |
| `en` | 293KB | 275KB | 223KB |

The actual path captured:

1. The app opens to a folder it already knows — Ready card, INDEX entry
2. The map draws itself and settles (hub + 7 domains)
3. Scroll down for about 2 seconds
4. Click the domain node **「Onboarding · Deployment · App Shell」**
5. Only neighbors remain visible while others blur, and the detail panel opens showing 16 sub-items (including names), 1 parent item,
   and 1 reference document

**The cursor remains on screen.** The reason for not removing it is that the presence of a clicker is part of this scene's content, and since it renders at 766px on the page, the arrow is within ~8px.

**The previous recording (2026-08-20, 199.13 seconds) has been replaced by this one.** That path — DOM · Cloud · ACP round-trip — remains above along with the §3 bit table, and serves as the starting point if a tour is needed again.

### *(155-second tour)* Speed was used, but no cuts

While adhering to the director's "no cuts, single take" rule, dead time was **fast-forwarded**. Cutting would create jump cuts, breaking the nature of this asset itself. Actual actions (assembly · rotation · answer streaming · detail panel) are all **constant speed**, and only sections with no activity have speed applied. The original 300 seconds became 199 seconds.

### Why the recording failed three times — So the next person doesn't fall into the same trap

*(This happened during the 155-second tour, but it repeats regardless of distance as long as you click with eyes closed at fixed coordinates. Even in the 9-second recording, two misclicks occurred — see automation notes in §0-1 above.)*

All were caused by **clicking with eyes closed at fixed coordinates**. This screen causes Chrome to move depending on the state.

- **3D is a menu, not a toggle** (flat/dome/cloud). Pressing the button does not switch modes; it opens a list.
- **When the "Path walked · N" chip appears, the buttons above shift to the right.** Therefore, coordinates after clicking a node differ from those before. If you handle Chrome operations first and click nodes later, this problem disappears entirely.
- **Opening the agent panel shrinks the map, changing all node positions.** If you click a node after opening the panel, you must re-capture the screen at that moment.
- **Korean cannot be typed via `cliclick t:`** (IME interferes). Use `pbcopy` + `⌘V` to paste.
- **The send button's hit area is close to the adjacent "Ask and proceed" dropdown.**

So this time, we **captured the window via `screencapture` at every bit to verify visually** before determining the next coordinates. The few seconds spent on verification fall into speed-up sections anyway.

### The English version was recorded separately on the same day

Changed language to English in App Settings → and **restarted**, then walked through the same bits again. Both screen text and node names are in English (since VOLT has `display_en`, node names follow). The section stating "both languages share the same recording" in the gate instructions was removed.

**No need to re-plan coordinates.** I expected the path to shift because English labels are wider, but the layout is deterministic, so the same node had Korean 812,797 and English 813,798. If recording a third language next time, start here — but **verify every time**. The fact that values were identical is an observation, not a guarantee.

**A gate was set to prevent the two assets from merging again.** For the first two days, this asset used one Korean master under two names, and all checks passed green — both existed, both exceeded 10KB, and both declared their lengths. Overwriting one with the other would cause an incident in a single line during the next swap, so `demo-clip-assets.contract` now **compares bytes**.
