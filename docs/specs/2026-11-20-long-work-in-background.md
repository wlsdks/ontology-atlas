---
title: Long work keeps running when you leave, and says so everywhere
doc_type: spec
status: current
date: 2026-11-20
decisions: []
area: desktop
---

# Long work keeps running when you leave, and says so everywhere

The product planner wrote this on 2026-11-20 and the lead accepted it the same day. It specifies slice 1 (the wiki check and the seat every later operation reuses). `Later` ranks the rest. The Korean copy moves into `messages/ko/` with the building slice (the planner's draft carries it until then); ja and zh are written by that slice under the same keys.

## Person and moment

- **Who.** A developer who already runs a coding agent, with a folder of thousands to tens of thousands of documents, in the installed macOS app.
- **Moment.** They press **Check wiki** in Library › Check results, then go back to the map, another tab, or their editor while the agent reads.
- **Observed.** The owner, 2026-11-20 (translated): "When a check runs, the popups and whatever is on screen must not be boring. And it has to work in the background too." The same day, about first builds: "What confused people most was whether the map was being built at all" (`docs/specs/2026-11-20-first-map-at-scale-and-by-hand.md:16`). On 2026-11-19 the owner accepted hours of preparation only if "it runs in the background" with "visible, lively progress" (`docs/specs/2026-11-19-search-by-meaning.md:329`).
- **Not observed.** No capture exists of a person leaving Library during a check. Criterion 1 takes it before anything is built.

## Today

Every long operation, from the code. "Away" means another tab or route.

| Operation | What the person sees | Real progress | Survives going away | Announced elsewhere | Cancel |
|---|---|---|---|---|---|
| Open or re-read a folder | Non-map tab: a full pane, Moru and "Opening {name}…" only (`src/app/providers/AppShell.tsx:153-176`, `:197-222`). Map: the partial map plus "Reading {read} of {total} files" (`messages/en/mapDial.json:15`, `src/views/home/ui/TopologyMapRenderer.tsx:289`) | The count exists (`src/entities/vault-session/model/vault-load-progress.ts:6-9`) but only the map draws it | Yes: the load lives in the vault provider (`.../local-vault/use-local-vault.ts:101-260`); a same-folder re-read keeps the screen (`:119-123`) | Not needed: the pane yields to the tab | None on the pane |
| Wiki check (Library) | A 14 px mark replaces the icon inside the **Check wiki** chip; "Checking the wiki…" is screen-reader only (`src/views/library/ui/parts/wiki/LibraryCheckReport.tsx:683-706`) | None: no stage, count or time | No. The Library dock renders its conversation without `keepKey` (`src/views/library/ui/parts/agent/LibraryAgentDock.tsx`), so leaving Library unmounts it and the session's cleanup sends `acp_stop` (`src/features/acp-session/model/use-acp-session.ts`, measured with the Library work harness); the map, project and Architecture docks park theirs (`src/widgets/acp-chat-panel/model/kept-panels.ts`). The running flag and the findings are Library page state (`src/views/library/ui/LibraryPage.tsx:143`, `.../library-page/use-library-turns.ts:372-373`, `:470-471`) | Only inside Library, as "new" (`use-library-turns.ts:471`) | **Stop** in the conversation (`.../chat-panel/ComposerFooter.tsx:277`) |
| Question-desk answer or report | "Preparing a new answer…" (`messages/en/library.json:729`), the observed-work strip (`LibraryPage.tsx:543`) | Files the agent opened | Turn yes; the answer is page state (`use-library-turns.ts:136-137`) | Screen-reader notice only (`.../questions/LibraryQuestionDesk.tsx:634`) | **Stop** in the conversation |
| Harness repository read | Centred stage: Moru, four named stages, "{done} of {total}", a bar (`src/widgets/harness-setup/ui/HarnessScanProgressPanel.tsx:29-68`) | Yes | No: the hook's cleanup drops the result and returning reads again (`src/features/harness-report/model/use-harness-report.ts:63-109`) | No | None |
| Meaning-search preparation | No screen yet: `messages/en/library.json` has no `meaning.*` key; the store merged in #3694 | Specified: files done, minutes left, Stop (`2026-11-19-search-by-meaning.md:150`, `:235`) | Required "from every top-level tab" (`:287`, decision 513482b0); the seat is unspecified | Unspecified | Stop, specified |
| Scheduled check | Automations row "Running · Checking documents" (`src/views/automations/ui/AutomationScheduleRow.tsx:98`); ledger line with seconds (`src/widgets/round-ledger/ui/RoundsLedger.tsx:124-128`) | Phase word and elapsed seconds; no count | Yes: the runner sits above every route (`AppShell.tsx:62-68`) | No: only Agents and Git carry rail badges (`src/widgets/app-nav-rail/ui/AppNavRail.tsx:149-154`) | Only by pausing, editing or removing the schedule (`src/views/library/lib/rounds/use-rounds-runner.ts:283-286`) |
| "Check the whole map" in chat | The transcript and Moru's work band above the composer (`docs/design/brand.md:206`); transcript code not read | The kind of tool call in flight | Yes (kept panel) | Status chip and bell, on the map toolbar only (`src/views/home/ui/TopologyCommandChrome.tsx:629`) | **Stop** |
| App update download | A shell card, bottom right on every screen: Moru, percent, MB (`AppShell.tsx:93-97`, `src/features/app-update/ui/UpdateToast.tsx:132-136`, `messages/en/appUpdate.json:5-6`) | Yes: received of total (`src/features/app-update/model/use-app-update.ts:208-216`) | Yes; **Hide** keeps it going (`use-app-update.ts:39`) | The "ready" card on every screen; the Settings trigger's label (`appUpdate.json:18-19`) | None |
| Agent install | Stage words in the doctor (`messages/en/acpChat.json:464-479`); first run in chat: MB so far and an indeterminate bar (`acpChat.json:25-31`, `.../chat-panel/TranscriptStates.tsx:94`) | Stage names; MB without a total | Yes: a rail badge counts finished installs (`src/features/acp-doctor/model/use-install-notice.ts:7-11`) | Rail badge on Agents (`AppNavRail.tsx:150-151`) | None found in `AgentDoctor.tsx` |

Where a run could already show on every screen:

- **The shell's notice seat** (`AppShell.tsx:93-97`): one fixed card that steps aside for docks, the map's instruments and toasts (`UpdateToast.tsx:133-135`), with Moru beside a real bar, **Hide**, and a crossfade whose "box never moves" (`app/styles/motion-surface.css:30`).
- **Rail tile badges** (`AppNavRail.tsx:255-263`), terminal states only: "peripheral chrome shows no progress" (`:150`), because "a per-second number in a rail badge flickers" (`use-install-notice.ts:9`).
- **The bell** is drawn only on the map toolbar (`TopologyCommandChrome.tsx:629`), and its Results tab is "Finished work that changed files" (`messages/en/agentActivity.json:68`).
- **`WaitStage` and `WorkProgress`** already draw a stage name, a fixed-width counter, a bar and steps (`src/shared/ui/status/wait-stage.tsx:82-101`).
- Unknown: whether a turn or a schedule tick keeps its pace while the app window is hidden. `use-rounds-runner.ts:646-655` only marks the app away; nothing in `src-tauri/` opts out of background throttling. Not measured.
- Unknown: the check's brief lists every wiki page (`src/features/library/lib/wiki/lint-brief.ts:21-27`); the agent check has no figure at 10k or 50k pages.

## Problem and alternatives

**Measured in the browser with the Library work harness, to be confirmed in the installed app by criterion 1.** A check does not finish while the person is on another tab: leaving Library stops the agent process, so the turn ends cancelled and nothing is reported. Were the conversation kept, its findings would land in a Library page that is no longer mounted and be lost; on return the page says "What the agent read does not survive reopening the app" (`messages/en/library.json:661`). While it runs, tool observation is cut for an away panel (`kept-panels.ts:22`, `:59-63`). The cause is one: a run's state belongs to the page that started it, not to the run.

**Ranked by value returned against cost.**

1. **Wiki check.** Minutes long, the owner's named case, no progress at all, and leaving can lose the result. First.
2. **Meaning preparation.** Hours long, but it has no screen yet; it must take this seat rather than invent a second one. Next, because its desk slice is being built now.
3. **Scheduled check.** Runs unattended by design and announces nothing outside Automations.
4. **Folder open on a non-map tab.** The count exists and is not drawn.
5. Question-desk report, Harness read, agent install, update download: short, or already announced.

**Alternatives.**

| | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo | Check stays a blind wait | Person must stay on the page | Free | Fits | Lost: it is the complaint |
| Put runs in the bell | One inbox | The bell exists on one screen; a read-only check has no Results row | Bell must move to the shell, overturning 1bde932e's toolbar seat | Fits | Lost: larger, and mixes "what the agent changed" with "what is still running" |
| A tenth rail tile with a list | Always visible | Nine tiles already fill the 616 px rail at the 1040×720 floor (`AppNavRail.tsx:232-233`) | Overflows the floor window | Fits | Lost on the floor window |
| **The shell's notice seat, plus a ring on the owning rail tile** | Live facts on every screen; the result waits | Shipped pattern the owner accepted for updates; one press hides it | One seat, no new chrome | In memory only | **Chosen** |

**The rule every long operation follows** (this slice proves it on one):

1. A run belongs to the app session, not to a page. Leaving never stops it or drops its result.
2. On the screen that owns it, that screen is the stage. Everywhere else the notice seat holds one card. Nothing is said twice.
3. A surface shows only observed facts: the step it is on, a count that was counted, elapsed time. A bar fills only when a total is known.
4. Finishing is announced where the person is, with one door to the result.
5. **Stop** is on the card and on the stage, and says what it leaves behind.
6. Moru appears only beside an observed state, with rows `docs/design/brand.md` already lists.

## Flow

1. When the person presses **Check wiki**, Atlas starts the agent turn as today, and the Check results page's "Agent checks" section becomes the stage: the title, the agent's name with what it is doing now, the pages read so far, elapsed time, the sentence "Checking the wiki reads and reports. It writes nothing." and **Stop**. The app's own checks stay listed above it.
2. When the agent opens a page, Atlas names that page on the stage and raises "pages read" by one. No percent and no "of total" is shown: the agent chooses how many pages it reads.
3. When the person goes to any other screen, Atlas draws the card in the notice seat with the same facts, **Stop** and **Hide**, and a ring on the Library rail tile. Coming back to Check results removes the card; the stage continues from the same numbers.
4. When the person presses **Hide**, the card leaves and the ring stays. The card does not return for this run until it finishes.
5. When the person hides the app window or switches to another app, the run continues at the same pace and its result waits on return.
6. When the agent asks before acting, the card says so and offers **Review**, which opens the Library conversation at the question. Nothing is answered from the card.
7. When the check finishes elsewhere, the card changes in place to the result with **Open check results**; the ring becomes a count badge on the Library tile. The card stays until the person presses its door or **Close**. The badge stays until Check results is opened, where the findings carry the existing "new" mark.
8. When the check finishes with nothing to fix, the card says so and closes after the person presses **Close** or opens the page.
9. **The agent is wrong or the evidence is missing.** When the turn ends without a list Atlas can read, the card and the page say that the report could not be read as a list and offer **Open the conversation**; Atlas never prints "nothing to fix" for it. When the agent stops on an error, the card says the check stopped, that nothing was changed, and how to run it again.
10. When the person presses **Stop**, Atlas ends the turn, removes the card and the ring, and the page says the check was stopped and nothing was reported. No log line is added (as today, `use-library-turns.ts:451-461`).

## States

| State | Web | macOS app |
|---|---|---|
| No check running | Out of scope — the web cannot start a check (`library.stage.blockedWeb`) | **Check wiki** chip as today |
| Running, on Check results | Out of scope — as above | Stage: `check.title`, `check.reading` / `check.working` / `check.writing`, `check.figures`, `report.emptyLede`; **Stop** |
| Running, any other screen | Out of scope — as above | Card with the same lines; `workCard.stop`, `workCard.hide`; ring on the Library tile (`workCard.railRunning`) |
| Running, card hidden | Out of scope — as above | Ring only; the tile's door leads to Library |
| Running, app window hidden | Out of scope — as above | Nothing drawn; the run keeps its pace |
| Agent asks before acting | Out of scope — as above | Card `check.asking`; `check.review` opens the conversation. Moru holds his neutral pose |
| Finished with findings, elsewhere | Out of scope — as above | Card `check.foundTitle`, `check.foundBody`; `check.openResults`, `workCard.close`; badge (`workCard.railFinished`) |
| Finished, nothing to fix | Out of scope — as above | Card `check.doneTitle`, `check.doneClean`; `workCard.close` |
| Finished on Check results | Out of scope — as above | No card. The findings draw in place with `report.unseen` |
| Report not readable as a list | Out of scope — as above | Card `check.unreadCardTitle`, `check.unreadCardBody`; page `check.unreadTitle`, `check.unreadBody`; `check.openConversation` |
| Stopped on an error | Out of scope — as above | Card and page `check.failedTitle`, `check.failedBody`; `check.openConversation`, `workCard.close` |
| Stopped by the person | Out of scope — as above | No card. Page `check.stopped`; **Check wiki** is pressable again |
| An update notice is due during a run | Out of scope — the web has no updater | The run keeps the seat; the update stays on the Settings trigger (`appUpdate.settingsTriggerPending`) and takes the seat when the run's card closes |
| Folder switched during a run | Out of scope — as above | The check ends with the folder it was reading. The card closes with `check.failedTitle` naming the old folder's check; the new folder shows no card, ring or findings from it |
| App reopened after a finished check | Out of scope — as above | Unchanged: `report.gone` |

## Copy

New keys. `check.*` goes in `messages/<locale>/library.json`; `workCard.*` is a new namespace shared by every later operation. Reused as they are: `library.wiki.lint`, `library.report.emptyLede`, `library.report.unseen`, `library.report.clean`, `acpChat.elapsedSeconds|Minutes|Hours`, the `acpChat` tool labels.

| Key | Where | en |
|---|---|---|
| `check.title` | stage, card | Checking the wiki |
| `check.reading` | stage | {agent} · reading {page} |
| `check.working` | stage | {agent} · {tool} |
| `check.writing` | stage | {agent} · writing the report |
| `check.cardWriting` | card | Writing the report |
| `check.figures` | stage, card | {read, plural, =0 {No page read yet} one {# page read} other {# pages read}} · {elapsed} |
| `check.asking` | card | {agent} is asking before it goes on. The check waits for your answer. |
| `check.review` | card button | Review |
| `check.doneTitle` | card | Wiki check finished |
| `check.foundTitle` | card | {findings, plural, one {# finding} other {# findings}} on {pages, plural, one {# page} other {# pages}} |
| `check.foundBody` | card | Wiki check finished. Check results lists them. |
| `check.doneClean` | card | The agent found nothing to fix in the pages it read. |
| `check.openResults` | card button | Open check results |
| `check.unreadTitle` | page | The check finished, but its report is not a list |
| `check.unreadBody` | page | Atlas could not read findings from the agent's answer, so Check results is unchanged. The conversation has the answer as written. |
| `check.unreadCardTitle` | card | The report could not be read |
| `check.unreadCardBody` | card | Check results is unchanged. The conversation has the agent's answer. |
| `check.openConversation` | card, page button | Open the conversation |
| `check.failedTitle` | card, page | The wiki check ended early |
| `check.failedBody` | card, page | {agent} ended before it reported. No file was changed. Press Check wiki to run it again. |
| `check.stopped` | page | You stopped this check. Nothing was reported, and no file was changed. |
| `workCard.stop` | card, stage button | Stop |
| `workCard.hide` | card button | Hide |
| `workCard.close` | card button | Close |
| `workCard.progressLabel` | bar name | {title} progress |
| `workCard.railRunning` | rail tile name | {destination}: running |
| `workCard.railFinished` | rail tile name | {destination}: {count, plural, one {# finished run to read} other {# finished runs to read}} |

The Korean catalogue names the same page two ways (`messages/ko/library.json:648`, `messages/ko/acpChat.json:489`). This slice uses the Library one; the other key is fixed when its surface is next touched.

## Edge cases

- **Zero pages.** **Check wiki** already has nothing to send; unchanged.
- **One page.** The stage shows "1 page read"; the result card uses the singular.
- **Largest measured count.** None exists for the agent check. Criterion 8 measures 10k pages before the slice ships; 50k is reported as measured or as not reached, never assumed.
- **First run.** If the agent still has to download, the existing first-run download state shows in the conversation; the stage's line reads "{agent} · Connecting" (the status word at `messages/en/acpChat.json:16`) until the first tool call.
- **Hangul names.** Page names are shown as stored, NFC, truncated in the middle so the file's ending stays readable; the counter keeps a fixed width so the line never shifts.
- **Moved, renamed or unreadable folder mid-run.** The turn fails as today; the card shows `check.failedTitle`.
- **Two presses at once.** **Check wiki** stays disabled while any Library turn runs (`LibraryCheckReport.tsx:680`, `LibraryDocumentColumn.tsx:100`). A scheduled check running at the same time keeps its own row in Automations; it does not take the card in this slice.
- **Pages edited after the check finished.** The findings keep the existing "Fixed · check again to re-judge" rule; nothing new.
- **Offline.** The agent's own failure arrives as `check.failedTitle`; Atlas adds no network call.
- **A dock opened for the same folder while the check runs away.** A parked conversation running the wiki check, which only reads, stays and finishes beside it; a parked turn that may write still ends, as before, so two writers never share a folder.
- **Folder switched mid-run.** Switching folders ends the check; the card shows `check.failedTitle` for the folder it ran on, and no ring, badge or finding carries into the new folder.
- **A write requested during a check.** The check's turn is read-only from its start, whichever screen holds it later, so a write it asks for is never approved automatically, even with auto-approve on; the conversation asks.
- **A re-check that reports nothing.** The last findings and their fixed marks stay in Check results until a new readable report replaces them; a stopped, failed or unreadable re-check leaves them.
- **Agent switched mid-check.** The check keeps running in its own conversation and the card's **Stop** still ends it; the newly chosen agent's conversation cannot report into or clear the check.
- **A dock or panel on the right.** The card glides left of any open dock (the Library's conversation, the map's conversation) and returns to the corner when it closes; notifications stand above the card. Where no room is left beside a dock (the Library below `xl`, where its dock overlays the page), the card stays in its corner above the dock, as notices already do there.
- **Moving between tabs.** No tab change, dock or conversation ends or restarts the check; the card is one element across routes, and its count and time continue from the last value drawn.
- **Reduced motion.** The ring is a still arc, the bar a still track, Moru holds each clip's first frame; every word and button is unchanged. The app draws no pause button.

## Out of scope

- **Findings that survive reopening the app.** They would need a file in the folder, which is a vault contract change (one-way). `report.gone` stays true.
- **A system notification when the app is not in front.** `tauri-plugin-notification` is held by the 2026-08-24 decision (`docs/DECISIONS.md:5279`); lifting it needs a record.
- **Running with the app quit.** Quitting stops agents by design (`src-tauri/src/lib.rs:383-390`).
- **Findings arriving one by one.** The agent reports once, at the end; streaming them changes what the agent is asked to write and needs a field trial.
- **A list of all runs.** One person-started run exists in this slice, so one card suffices.
- **The web.** Checks need an agent on this computer.

## Acceptance criteria

1. **Capture first, then recovery proof.** Given the installed app on current main and a real wiki of at least 200 pages. When the person presses Check wiki, goes to the map, and returns after the turn ends. Then the "before" recording shows whether the findings are present (the inference in Problem). After the build, the same walk shows the card on the map, the result card, and **Open check results** landing on findings that match the agent's answer. Installed-app walk with recordings.
2. **The result waits.** Given a check started in Library. When the route changes to `/topology` and the turn completes with 3 findings. Then returning to Check results shows those 3 with `report.unseen`, and the Library tile carried a badge of 1 until then (`tests/e2e/library/library-check-background.spec.ts`).
3. **Only observed facts.** Given a turn that completes 5 page reads, then streams answer text. Then the line reads `check.reading` with each page in turn, the count reaches exactly 5, the line becomes `check.writing`, and no percent, total or estimate is drawn. Given an answer with no readable list, the page shows `check.unreadTitle` and never `report.clean` (`use-library-turns` unit test, `LibraryPage.turns.test.ts`).
4. **Stop.** Given a running check. When **Stop** is pressed on the card. Then the turn ends within 2 s, the card and ring are gone, the page shows `check.stopped`, and the wiki log has no new `lint` line (e2e spec above).
5. **One seat, nothing twice.** Given a running check at 1040×720, 1512×900 and 1920×1080, with a dock open and closed. Then the card is absent on Check results and present on every other top-level tab; it overlaps no control (hit-tested at nine points of its box) and no toast; an update notice due during the run appears only after the card closes (`tests/e2e/design-audits/work-card-seat.spec.ts`).
6. **Smooth.** Given a full run recorded per frame in the static build. Then no frame interval exceeds 50 ms; the card's box never moves between states; the ring, the bar and each text change continue from the value last drawn; every loop stops in the frame the run ends. Under reduced motion nothing moves and every fact still reads (`/ui-proof`).
7. **Window hidden.** Given the installed app and the same wiki. When the check runs once in front and once with the window hidden from the first second (median of 3 each). Then the hidden runs finish within 15% of the front runs and the result card is standing when the window returns. A failure here blocks the slice and moves "Keep pace while hidden" from Later into it.
8. **Scale and memory.** Given a 10k-page wiki. When a check runs with the card on the map. Then map frame p95 stays within 10% of the same pan without a check, the card redraws at most 4 times a second, and the app's retained heap grows by at most 2 MB over the run; steady and peak footprint are reported. The 50k figure is reported as measured or as "brief not accepted by the agent".

## Risks

1. **Nothing observable happens, so the stage is still dull.** An agent may answer from one `validate_wiki` call and read no page. Probe before building the stage: record the tool calls of 5 real checks each with Claude and Codex. If the median gap between observed events exceeds 10 s, the stage leads with the tool label and elapsed time, and "findings arriving one by one" moves up in Later.
2. **"Background" is false once the window is hidden.** The WebView may slow timers and event handling. Criterion 7 measures it first; the design answer is native (keep the process at full pace while a run is registered), not a caveat in the copy.
3. **The card is noise.** It stands over the map for minutes. Design choice: one press hides it for the whole run, the ring carries the state, and it uses the update notice's measured seat. Falsifier: the owner hides it on three runs in a row; then the card starts hidden and only the finish is announced.

## Later

Ranked. Each adopts the six rules and the seat; none invents another.

1. **Meaning preparation takes the seat** (hours at 50k). Its card shows files done of total, the file being read, minutes left, **Stop**; this is where decision 513482b0's "from every tab" is met. Brings the list: when two runs exist, the card names the person's latest and "1 more running" opens a centred dialog, runs on the left, the selected run on the right. Next because its desk slice is in progress.
2. **Scheduled checks.** The card and the Automations tile ring for a run in flight, a counted "documents checked", a **Stop** that does not require pausing the schedule, and a finished badge. Next when slice 1's seat is merged.
3. **Folder open on every tab.** The non-map opening pane shows the count that already exists, and a way back to the folder list. Next on the first owner report of a blind open at scale.
4. **Keep pace while hidden**, if criterion 7 passes only narrowly; and **a system notification on finish**. One-way neighbour: needs a decision record overturning the 2026-08-24 hold, and a new dependency.
5. **Findings that survive reopening.** One-way: a new file under `.ontology-atlas/` is a vault contract. Next when a person reports re-running a check only to see old findings.
6. **Writing Library turns keep running.** Slice 1 parks only the read-only check when a person leaves Library; a turn that may write still ends with the screen, since its permission cards would have nowhere to stand. Next when a person reports losing an answer or an edit by switching tab.
7. **Findings arriving one by one**; **question-desk reports and Harness reads keep their result when you leave**; **bounding the check's brief** past the largest page count the agent accepts.

One-way items: none in slice 1. Items 4 (notification) and 5 above each need a decision record before work starts.

## Owner question

None. Decided: "background" means another tab and a hidden window, not a quit app, because the person's next act after pressing Check wiki is returning to their editor, and quitting stops agents by an existing rule. To reverse: add "runs with the app quit" as a new spec; nothing here blocks it.

## Revisions

- 2026-11-20: first draft, written read-only in the session scratchpad.
- 2026-11-20: accepted and committed; slice 1 is being built.
- 2026-11-20: corrected Today and Problem: the Library dock does not keep its conversation, so leaving Library stops the check rather than only losing its result.
- 2026-11-20: slice 1 built; added the edge cases for a parked read-only check, a folder switch mid-run and a write asked for during a check.
- 2026-11-20: added the right-hand dock and tab-change edge cases after the owner asked that the work keep running and stay in view on every screen.
- 2026-11-20: review round: the read-only flag belongs to the running turn, a write it asks for never takes an automatic approval, only the check is parked when Library goes, a re-check keeps the last findings until a new report arrives, and "Writing Library turns keep running" joined Later. The card's line names only what the agent does, and its found and unreadable states got sentences that fit its two lines.
