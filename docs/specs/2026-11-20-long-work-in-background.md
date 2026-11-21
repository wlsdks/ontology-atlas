---
title: Long work keeps running when you leave, and says so everywhere
doc_type: spec
status: current
date: 2026-11-20
decisions: [475f5a7e]
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
| Open or re-read a folder | Non-map tab: a full pane, Moru and "Opening {name}…" only (`src/app/providers/AppShell.tsx:153-176`, `:197-222`). Map: the partial map plus "Reading {read} of {total} files" (`messages/en/mapDial.json:15`, `src/views/home/ui/map-surfaces/TopologyMapRenderer.tsx:289`) | The count exists (`src/entities/vault-session/model/vault-load-progress.ts:6-9`) but only the map draws it | Yes: the load lives in the vault provider (`.../local-vault/use-local-vault.ts:101-260`); a same-folder re-read keeps the screen (`:119-123`) | Not needed: the pane yields to the tab | None on the pane |
| Wiki check (Library) | A 14 px mark replaces the icon inside the **Check wiki** chip; "Checking the wiki…" is screen-reader only (`src/views/library/ui/parts/wiki/LibraryCheckReport.tsx:683-706`) | None: no stage, count or time | No. The Library dock renders its conversation without `keepKey` (`src/views/library/ui/parts/agent/LibraryAgentDock.tsx`), so leaving Library unmounts it and the session's cleanup sends `acp_stop` (`src/features/acp-session/model/use-acp-session.ts`, measured with the Library work harness); the map, project and Architecture docks park theirs (`src/widgets/acp-chat-panel/model/kept-panels.ts`). The running flag and the findings are Library page state (`src/views/library/ui/LibraryPage.tsx:143`, `.../library-page/use-library-turns.ts:372-373`, `:470-471`) | Only inside Library, as "new" (`use-library-turns.ts:471`) | **Stop** in the conversation (`.../chat-panel/composer/ComposerFooter.tsx:277`) |
| Question-desk answer or report | "Preparing a new answer…" (`messages/en/library.json:729`), the observed-work strip (`LibraryPage.tsx:543`) | Files the agent opened | Turn yes; the answer is page state (`use-library-turns.ts:136-137`) | Screen-reader notice only (`.../questions/LibraryQuestionDesk.tsx:634`) | **Stop** in the conversation |
| Harness repository read | Centred stage: Moru, four named stages, "{done} of {total}", a bar (`src/widgets/harness-setup/ui/HarnessScanProgressPanel.tsx:29-68`) | Yes | No: the hook's cleanup drops the result and returning reads again (`src/features/harness-report/model/use-harness-report.ts:63-109`) | No | None |
| Meaning-search preparation | No screen yet: `messages/en/library.json` has no `meaning.*` key; the store merged in #3694 | Specified: files done, minutes left, Stop (`2026-11-19-search-by-meaning.md:150`, `:235`) | Required "from every top-level tab" (`:287`, decision 513482b0); the seat is unspecified | Unspecified | Stop, specified |
| Scheduled check | Automations row "Running · Checking documents" (`src/views/automations/ui/AutomationScheduleRow.tsx:98`); ledger line with seconds (`src/widgets/round-ledger/ui/RoundsLedger.tsx:124-128`) | Phase word and elapsed seconds; no count | Yes: the runner sits above every route (`AppShell.tsx:62-68`) | No: only Agents and Git carry rail badges (`src/widgets/app-nav-rail/ui/AppNavRail.tsx:149-154`) | Only by pausing, editing or removing the schedule (`src/views/library/lib/rounds/use-rounds-runner.ts:283-286`) |
| "Check the whole map" in chat | The transcript and Moru's work band above the composer (`docs/design/brand.md:206`); transcript code not read | The kind of tool call in flight | Yes (kept panel) | Status chip and bell, on the map toolbar only (`src/views/home/ui/map-readouts/TopologyCommandChrome.tsx:629`) | **Stop** |
| App update download | A shell card, bottom right on every screen: Moru, percent, MB (`AppShell.tsx:93-97`, `src/features/app-update/ui/UpdateToast.tsx:132-136`, `messages/en/appUpdate.json:5-6`) | Yes: received of total (`src/features/app-update/model/use-app-update.ts:208-216`) | Yes; **Hide** keeps it going (`use-app-update.ts:39`) | The "ready" card on every screen; the Settings trigger's label (`appUpdate.json:18-19`) | None |
| Agent install | Stage words in the doctor (`messages/en/acpChat.json:464-479`); first run in chat: MB so far and an indeterminate bar (`acpChat.json:25-31`, `.../chat-panel/transcript-pane/transcript-states.tsx:94`) | Stage names; MB without a total | Yes: a rail badge counts finished installs (`src/features/acp-doctor/model/use-install-notice.ts:7-11`) | Rail badge on Agents (`AppNavRail.tsx:150-151`) | None found in `use-agent-doctor.tsx` |

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
- **Two presses at once.** **Check wiki** stays disabled while any Library turn runs (`LibraryCheckReport.tsx:680`, `LibraryDocumentColumn.tsx:100`). A scheduled check running at the same time also takes the card: the card names the run that started last and "1 more running" opens the centred list of both. Schedules run one pass at a time, so two scheduled checks never run together.
- **Pages edited after the check finished.** The findings keep the existing "Fixed · check again to re-judge" rule; nothing new.
- **Offline.** The agent's own failure arrives as `check.failedTitle`; Atlas adds no network call.
- **A dock opened for the same folder while the check runs away.** A parked conversation running the wiki check, which only reads, stays and finishes beside it; a parked turn that may write still ends, as before, so two writers never share a folder.
- **Folder switched mid-run.** Switching folders ends the check; the card shows `check.failedTitle` for the folder it ran on, and no ring, badge or finding carries into the new folder.
- **A write requested during a check.** The check's turn is read-only from its start, whichever screen holds it later, so a write it asks for is never approved automatically, even with auto-approve on; the conversation asks.
- **A re-check that reports nothing.** The last findings and their fixed marks stay in Check results until a new readable report replaces them; a stopped, failed or unreadable re-check leaves them.
- **Agent switched mid-check.** The check keeps running in its own conversation and the card's **Stop** still ends it; the newly chosen agent's conversation cannot report into or clear the check.
- **A dock or panel on the right.** The card glides left of any open dock (the Library's conversation, the map's conversation) and returns to the corner when it closes; notifications stand above the card. Where no room is left beside a dock (the Library below `xl`, where its dock overlays the page), the card stays in its corner above the dock, as notices already do there.
- **Moving between tabs.** No tab change, dock or conversation ends or restarts the check; the card is one element across routes, and its count and time continue from the last value drawn.
- **A scheduled check's Stop.** **Stop** on the card, in the list or on the Automations stage ends that run only; the schedule stays on, its next run stays where it was, and the run's history entry reads that the run was stopped before it finished.
- **A scheduled check that finishes elsewhere.** The card turns into its result in place, with one **Open run** that opens Automations on that run's entry; the Automations tile keeps a count of finished runs until Automations is opened.
- **What a scheduled check counts.** A document check counts the wiki pages it read, a service check the sources it refreshed (the same numbers as its history entry); an ontology review counts each distinct document the agent finished reading.
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

1. **Built.** **Meaning preparation takes the seat** (hours at 50k). Its card shows files done of total, the file being read, minutes left, **Stop**; this is where decision 513482b0's "from every tab" is met. Brings the list: when two runs exist, the card names the person's latest and "1 more running" opens a centred dialog, runs on the left, the selected run on the right. Next because its desk slice is in progress.
2. **Scheduled checks.** The card and the Automations tile ring for a run in flight, a counted "documents checked", a **Stop** that does not require pausing the schedule, and a finished badge. Next when slice 1's seat is merged.
3. **Folder open on every tab.** The non-map opening pane shows the count that already exists, and a way back to the folder list. Next on the first owner report of a blind open at scale.
4. **Keep pace while hidden**, if criterion 7 passes only narrowly; and **a system notification on finish**. One-way neighbour: needs a decision record overturning the 2026-08-24 hold, and a new dependency.
5. **Findings that survive reopening.** One-way: a new file under `.ontology-atlas/` is a vault contract. Next when a person reports re-running a check only to see old findings.
6. **Writing Library turns keep running.** Slice 1 parks only the read-only check when a person leaves Library; a turn that may write still ends with the screen, since its permission cards would have nowhere to stand. Specified below under "Slice: a Library turn that may write keeps running when you leave Library", after the owner asked on 2026-11-20 that background work never stop.
7. **Findings arriving one by one**; **question-desk reports and Harness reads keep their result when you leave**; **bounding the check's brief** past the largest page count the agent accepts.

One-way items: none in slice 1. Items 4 (notification), 5 and 6 above each need a decision record before work starts.

## Owner question

None. Decided: "background" means another tab and a hidden window, not a quit app, because the person's next act after pressing Check wiki is returning to their editor, and quitting stops agents by an existing rule. To reverse: add "runs with the app quit" as a new spec; nothing here blocks it.

## Slice: a Library turn that may write keeps running when you leave Library

The product planner wrote this on 2026-11-20 as Later item 6, specified, and revised it the same day after an independent review. **One-way**: it changes what an agent may write (a Library turn keeps writing after its screen is gone) and where a person may approve (a second surface). Decision 475f5a7e (`docs/records/decisions/2026-11-20-library-writing-turn-outlives-screen-475f5a7e-4c15-4a4a-be7b-60738d60c86b.md`) covers it. The Korean strings are in the planner's hand-back and move into `messages/ko/` with the building step.

**Built in two steps, by the lead's decision.**

- **A. The turn survives, and Review opens the Library conversation.** Everything below except the Runs list: the turn and its record outlive the screen, the card waits in view, **Review** uses the door slice 1 built, Stop is enforced. Criteria 1, 4, 5, 6 and 8, and the clauses of 2 and 7 marked A.
- **B. The request is answered in the Runs list.** Starts only after A has merged and criterion 1's capture exists. Criterion 3 and the clauses of 2 and 7 marked B. B edits slice 1's Flow step 6 and its "Agent asks before acting" row, which stay true until then.

### Person and moment

- **Who.** The same developer, in the installed macOS app, with an agent already signed in.
- **Moment.** They press **Write wiki pages** (or **Fix with agent**, **Bring from a service**, **Propose as concept**, or send a typed request in the Library conversation), then go to the map or Automations while the agent works.
- **Observed.** The owner, 2026-11-20 (translated): "Without stopping, shown at the top of the screen or as a popup, background work must be possible while I keep moving around seamlessly." The owner, 2026-11-12: keep the agent working when the person moves to another screen mid-answer (decision 387a3c17, `Why`). The owner, 2026-11-16: approving every write makes the in-app agent tiresome enough not to use (decision 15443720, `Why`).
- **Not observed.** No capture exists of a person leaving Library during a writing turn, or of a permission request arriving while they are on another screen. Criterion 1 takes it first.

### Today

- The Library dock keeps its conversation only for a read-only turn (`src/views/library/ui/parts/agent/LibraryAgentDock.tsx:353-354`; `src/widgets/acp-chat-panel/model/kept-panels.ts:46-48`), and the session's read-only flag covers the wiki check alone (`src/views/library/ui/library-page/use-library-turns.ts:136-138`). Any other Library turn is dropped with the screen (`kept-panels.ts:50-55`) and the session's cleanup stops the agent (`src/features/acp-session/model/use-acp-session.ts:692-698`).
- A question-desk answer and an answer refresh are read-only only by a ref of the Library page (`use-library-turns.ts:135`, `:408-410`), which nothing outside the page can read.
- The map, project and Harness docks keep any turn, with no such limit (`src/views/home/ui/map-overlays/TopologyAgentDock.tsx:289`, `src/views/project-detail/ui/parts/ProjectAgentDock.tsx:182`, `src/views/architecture/ui/ArchitectureAgentDock.tsx:161`). A kept conversation is parked hidden and inert (`src/widgets/acp-chat-panel/ui/AcpChatPanelKeeper.tsx:33`); decision 387a3c17 records as dissent that nothing shows it working or waiting, and that a waiting permission has no time ceiling.
- Seating a conversation for the same folder elsewhere removes a parked one that may write (`kept-panels.ts:62-70`); decision 387a3c17 states the effect: opening the agent elsewhere ends the kept one first.
- A permission request is a promise with no timer: it resolves only by an answer, by Stop, or by the agent process ending (`permissions/ask-permission.ts:190-217`, `permissions/refuse-open-ask.ts`, `use-acp-session.ts:391-403`, `:635-642`). A waiting request is not counted as a silent turn (`src/features/acp-session/model/turn-liveness.ts:45`).
- Two standing choices answer without a card. The wiki write mode, `auto` by default (`src/shared/lib/preferences/library-preferences.ts:87-102`; decision 2026-09-07, `docs/DECISIONS.md:554`), allows a wiki page write that fits the template. The mode, the page text, the source list and the concept index it judges with are values of the Library page's last render (`use-library-turns.ts:132`, `:174-187`, `:367-377`), and a parked conversation keeps the props of the last render it was given (`src/widgets/acp-chat-panel/ui/KeptPanelSeat.tsx:18-20`, `kept-panels.ts:72-76`). Auto-approve, kept per folder (decisions 15443720, 04edab8a), is read at each request (`permissions/ask-permission.ts:173-177`). Neither answers in a read-only turn (`permissions/ask-permission.ts:100`, `:165`, `:173`).
- **Stop** enforces: it answers the open request and every later one of the turn `cancelled` before any standing choice, asks the agent to cancel (`src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx:446-450`, `use-acp-session.ts:607-632`, `permissions/ask-permission.ts:133-135`), and ends the process when the turn is still open after the 5-second grace (`use-acp-session.ts:619-633`); closing the session also ends it (`use-acp-session.ts:635-660`).
- For a file write, the permission card shows the action, the full path and, for a wiki page, whether the page keeps its shape; it draws no line count and no text of the change (`src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx:704-772`). The page is judged from the request itself and the page on disk (decision 2026-09-06, `docs/DECISIONS.md:725`; `src/features/library/lib/wiki/judge-page-write.ts:102-106`). Outside-folder status is computed from the folder path the card is given (`AcpPermissionCard.tsx:209`). **Allow once** is disabled while an ontology change's basis is loading or its folder does not match (`:308`). For a file request focus lands on **Deny** (`:293-296`); once an answer is sent a second press on that card does nothing (`:298-299`).
- What a turn leaves when it ends is done by the Library page: the pages it changed, the fixed mark, the log line (`use-library-turns.ts:454-523`). A turn that did not complete adds no log line and no written-page receipt (`:470-480`). Whether a Library turn is running is page state that starts false on each visit (`src/views/library/ui/LibraryPage.tsx:153-158`), the check excepted.
- Each tool call reaches the app with its kind, its status and its input (`session-updates/apply-session-update.ts:88-104`); an allowed ontology write is followed to the result the agent reports (`session-updates/apply-session-update.ts:132-156`).
- The seat holds four kinds of run, the wiki check, a scheduled check, a Library turn that may write and a folder's meaning preparation (`src/features/work-run/model/work-run-store.ts:72-76`). A check that asks shows **Review**, which opens Library (`src/features/work-run/ui/WorkRunCard.tsx:258-259`, `src/features/work-run/ui/use-run-doors.ts:10-15`), and no **Stop** (`WorkRunCard.tsx:310-314`); a card hidden before the ask stays hidden (`src/features/work-run/model/work-run.ts:108-114`). The rail tile knows running, waiting for permission and finished (`src/app/providers/AppShell.tsx:356-384`). The centred Runs list shows the selected run's facts on the right (`src/features/work-run/ui/WorkRunsDialog.tsx:48-60`).
- A compile request names at most 10 sources (`src/features/library/lib/wiki/compile-brief.ts:44`).
- Unknown: whether an agent program gives up on a request left waiting for a long time, and how long a cooperating agent takes to end after Stop (neither measured). Unknown: pace with the window hidden; no result of slice 1's criterion 7 is recorded under `docs/records/`. Not read: how the transcript draws each finished write.

### Problem and alternatives

A Library turn's survival, its automatic answers and its end-of-turn record all belong to the Library page, so the turn cannot outlive it; and a request that waits away from Library has nowhere to be seen. Parking the conversation alone would be unsafe: the judge would answer from a write mode, page texts and a source list frozen at the moment the person left. Inference from the `auto` default, not a measurement: the requests that still reach a person are the unusual ones (a page that fails its shape, a file outside `wiki/`, a delete, a run, an ontology change), which need the most facts.

**Ranked by value returned against cost.** 1. The turn and its record survive leaving: nothing else exists without it (step A). 2. A request waits in view (A) and is answered where the person is (B). 3. A finished, stopped or ended turn says what it wrote (A). Next after this slice: the same seat for parked map, project and Harness conversations.

| Where the answer is given | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo: the turn ends with the screen | None | Person must stay in Library | Free | Fits | Lost: it is the complaint |
| On the card's face (**Allow once**, **Deny**) | Fastest | The card is 144 px tall (`WorkRunCard.tsx:105`): room for a path and a count, not a page verdict or an ontology change review | Small | Fits | Lost: the requests that reach it are the ones a summary serves worst |
| **Review** opens the Library conversation (as the check does today) | Full facts and every control | Leaves the screen for every request, then a second trip back | Built | Fits | **Step A**: it proves the turn survives before a second approval surface exists. It stays in B as **Open the conversation** |
| **Review** opens the request in the centred Runs list, drawn by the conversation's own permission card | Full facts, where the person is | One press in, one answer, back where they were | One card component in a second seat; no second set of facts | Fits | **Step B**: the owner's ask, gated on A's capture |

**What the Runs list must show for a safe answer (B)**, all from the one permission card and the same inputs as the conversation: the action; the full path, never truncated; whether it lies outside the turn's folder; for a wiki page the shape verdict and its problems, judged against that folder; for an ontology change the full change review, with **Allow once** disabled whenever the conversation's is; the size line for a request to change a file. The list adds who asks and the agent's last words. It offers **Allow once** and **Deny** only; a wider grant, a correction and "decide later" stay in the conversation, beside the composer they need.

### Flow

1. When the person presses a Library door that writes, or sends a typed request in the Library conversation, Atlas starts the turn as today. The turn's own conversation is its stage; where that conversation is on screen no card is drawn.
2. When the person goes to any other screen, Atlas keeps the turn running and draws the card: the door's name (a typed request shows its first line), what the agent is doing now, the files written so far, elapsed time, **Stop** and **Hide**; the Library tile rings.
3. When the agent asks for a write that a standing choice covers, Atlas reads the write mode, the page on disk, the source list and the concept index at that moment and answers as it would in Library, leaving the same transcript line. A mode switched to ask since the turn began makes the next page wait. When Atlas cannot read or judge what it needs, it asks.
4. When the agent asks for anything else, Atlas changes the card in place to **Waiting for permission** with the time waited, who wants what, **Review** and **Hide**. The Library tile's ring stands still and gains a badge. A card hidden earlier returns. The turn waits; no clock answers.
5. When the person presses **Review**: in A, Atlas opens Library on the asking agent's conversation at the request, with every control. In B, Atlas opens the Runs list on that run: the agent's last words (up to four lines, cut at the end), the request, and the sentence that this answers one request. Focus starts on **Deny** for a file request and on the request's title for an ontology change.
6. When the person presses **Allow once** or **Deny** in the list, Atlas sends that answer and shows the conversation's own answered sentence. A request already waiting takes its place; otherwise the list closes, focus returns, and the card shows the turn running again. A request that follows an answer, or arrives while the list is open, is drawn with both buttons disabled for 600 ms, so a press already in motion lands on nothing.
7. When the person closes the list, presses **Hide**, changes screen or hides the window, Atlas answers nothing and the request keeps waiting.
8. **The agent is wrong or the evidence is missing.** When Atlas cannot compute the size of a change it says so instead of leaving the line empty; a page that fails its shape lists its problems; a path outside the folder keeps the card's outside-folder title; a request that does not say what it wants shows its own title. When the agent's process ends, a waiting request closes unanswered and the card says the agent ended early and what it had written.
9. When the turn finishes elsewhere, the card changes in place to the files written with one door: **Open the page** when it wrote exactly one wiki page, **Open the conversation** otherwise. The Library tile carries a count until Library is opened.
10. When the person presses **Stop**, Atlas closes a waiting request unanswered, refuses every later request of that turn, lets no standing choice answer, and asks the agent to end. The card reads **Stopping** until the turn has ended; if it has not ended in 5 s Atlas ends the agent's process. Only then does the card say it stopped and what was written. A folder switch does the same.
11. When the person returns to Library mid-turn, the card leaves, the conversation shows the same turn, and the doors that start a turn stay disabled until it ends; its record is written once, whichever screen is open.

### States

Short names: `turn.*` is `workCard.turn.*`, `check.*` is `library.check.*`, `permission.*` is `acpChat.permission.*`.

| State | Web | macOS app |
|---|---|---|
| Running, its conversation on screen | Out of scope — the web cannot start an agent turn (`library.stage.blockedWeb`) | No card. The conversation and its door show the turn (`library.conversation.runningLabel`) |
| Running, another screen | Out of scope — as above | Card: door name, `turn.figures`, the line (`turn.writingFile`, `turn.answering`, or slice 1's reading and tool lines); `workCard.stop`, `workCard.hide`; ring (`workCard.railRunning`) |
| Running, card hidden | Out of scope — as above | Ring only |
| Returned to Library mid-turn | Out of scope — as above | No card. The same turn in the conversation; **Write wiki pages** and the other doors disabled as before leaving |
| Waiting for permission, another screen | Out of scope — as above | Card: `turn.waitingTitle`, `turn.ask.*`; `check.review`, `workCard.hide`; still ring and a badge without a number (`workCard.railWaiting`). Moru holds his neutral pose |
| Waiting, card hidden after the request | Out of scope — as above | Still ring and badge only, until answered or the next request |
| Waiting, and the tile also has finished runs to read | Out of scope — as above | The waiting badge wins; the tile's name says both (`workCard.railWaitingAndFinished`); the count returns when none waits |
| Library on screen with another agent chosen, and the parked turn asks | Out of scope — as above | The card stands in Library too, since the turn's conversation is not on screen; **Review** chooses the asking agent again and shows its request |
| The wiki check asks | Out of scope — as above | A: as slice 1, `check.asking` and **Review** to Library. B: `check.review` opens the Runs list like any run; no standing choice ever answers a check |
| Request open in the Runs list (B) | Out of scope — as above | `turn.said`, the permission card with `permission.change*`, `turn.onceOnly`; `permission.reject`, `permission.allowOnce`, `workCard.stop`, `check.openConversation`. Moru is the permission card's own |
| Answered (B) | Out of scope — as above | `acpChat.permission.answered.*`, then the next request with its buttons disabled for 600 ms, or the list closes |
| Two runs waiting | Out of scope — as above | Card names the one that asked first and `workCard.moreWaiting`; the list marks each (`workCard.runsWaiting`) |
| Window hidden while waiting | Out of scope — as above | Nothing drawn. On return the card shows the real time waited |
| Finished with files written, elsewhere | Out of scope — as above | `turn.writtenTitle`, `turn.wroteOne` or `turn.wroteMany`; `turn.openPage` or `check.openConversation`, `workCard.close`; badge (`workCard.railFinished`) |
| Finished, no file written | Out of scope — as above | `turn.answeredTitle`; `turn.answeredBody`, or `turn.beyond` when it ran a tool or wrote outside the folder; `check.openConversation`, `workCard.close` |
| Stop pressed, turn not yet ended | Out of scope — as above | `turn.stoppingTitle`, `turn.stoppingBody`; no button answers anything |
| Stopped after writing | Out of scope — as above | `turn.stoppedTitle`; `turn.stoppedBody`, or `turn.beyond`; `turn.partial` per cut-off write; `check.openConversation`, `workCard.close`. Stopped with nothing written and nothing run: no card |
| Agent ended early | Out of scope — as above | `turn.endedTitle`, `turn.endedBody`; `check.openConversation`, `workCard.close`. A list open on its request shows `turn.requestClosed` and no answer buttons |
| Folder switched or closed | Out of scope — as above | The turn is stopped as in Flow 10. Once, in the new folder: `turn.switchedTitle`, `turn.switchedBody`; `workCard.close`. No ring or badge carries over |
| A conversation opened elsewhere for the same folder | Out of scope — as above | It shows `acpChat.folderBusy` with `workCard.stop`. It starts no agent, resumes no conversation and sends nothing until the turn ends |
| A question-desk answer, a report or an answer refresh when Library is left | Out of scope — as above | Ends with the screen, as today; no card. Out of scope below says why |

### Copy

New keys. `turn.*` goes under `workCard` in `messages/<locale>/workCard.json`; `permission.change*` and `folderBusy` in `acpChat.json`. Reused as they are: `library.stage.compile.title`, `library.wiki.fixWithAgent`, `library.sources.import`, `library.wiki.propose` (the card's name for a door-started turn), `library.check.review`, `library.check.openConversation`, `acpChat.permission.*`, `acpChat.status.starting`, `acpChat.elapsed*`. In `turn.ask.unknown`, `{target}` is the request's own title, or `acpChat.permission.unknownTarget` when it has none. The builder checks each card sentence against the card's two lines in both locales.

| Key | Where | en |
|---|---|---|
| `workCard.turn.figures` | card | {written, plural, =0 {No file written yet} one {<count>#</count> file written} other {<count>#</count> files written}} · {elapsed} |
| `workCard.turn.writingFile` | card line | Writing <name>{file}</name> |
| `workCard.turn.answering` | card line | Writing the answer |
| `workCard.turn.waitingTitle` | card | Waiting for permission · {elapsed} |
| `workCard.turn.ask.edit` | card | {agent} wants to change <name>{target}</name> |
| `workCard.turn.ask.delete` | card | {agent} wants to delete <name>{target}</name> |
| `workCard.turn.ask.execute` | card | {agent} wants to run <name>{target}</name> |
| `workCard.turn.ask.read` | card | {agent} wants to read <name>{target}</name> |
| `workCard.turn.ask.ontology` | card | {agent} proposes: <name>{target}</name> |
| `workCard.turn.ask.unknown` | card | {agent} asks: <name>{target}</name> |
| `workCard.turn.said` | Runs list | {agent} said |
| `workCard.turn.onceOnly` | Runs list | Here you answer this one request. To allow more than once, or to ask for a correction, open the conversation. |
| `workCard.turn.requestClosed` | Runs list | The request was closed without an answer. Nothing was written for it. |
| `workCard.turn.writtenTitle` | card | {count, plural, one {# file written} other {# files written}} |
| `workCard.turn.wroteOne` | card | {agent} wrote {file}. |
| `workCard.turn.wroteMany` | card | {agent} wrote {file} and {more, plural, one {# more file} other {# more files}}. |
| `workCard.turn.openPage` | card button | Open the page |
| `workCard.turn.answeredTitle` | card | The answer is ready |
| `workCard.turn.answeredBody` | card | {agent} wrote no file. The conversation has its answer. |
| `workCard.turn.beyond` | card, Runs list | {agent} also ran a tool or wrote outside this folder. Atlas cannot see what that changed. |
| `workCard.turn.stoppingTitle` | card | Stopping {agent} |
| `workCard.turn.stoppingBody` | card | No further write is allowed. If {agent} has not ended in 5 seconds, Atlas ends it. |
| `workCard.turn.stoppedTitle` | card | {count, plural, =0 {Stopped} one {Stopped after # file} other {Stopped after # files}} |
| `workCard.turn.stoppedBody` | card | The files already written stay as they are. Nothing else was changed. |
| `workCard.turn.partial` | card, Runs list | {file} may be incomplete: the write was cut off. Open it before you rely on it. |
| `workCard.turn.endedTitle` | card | {agent} ended early |
| `workCard.turn.endedBody` | card | {written, plural, =0 {No file was written} one {# file was written} other {# files were written}} before it ended. The conversation shows how far it got. |
| `workCard.turn.switchedTitle` | card | Ended when you switched folders |
| `workCard.turn.switchedBody` | card | {agent} was working in {folder}. {written, plural, =0 {No file was written} one {# file was written} other {# files were written}} there before it ended. |
| `workCard.railWaiting` | rail tile name | {destination}: waiting for your permission |
| `workCard.railWaitingAndFinished` | rail tile name | {destination}: waiting for your permission · {count, plural, one {# finished run to read} other {# finished runs to read}} |
| `workCard.moreWaiting` | card button | {count, plural, other {# more waiting}} |
| `workCard.runsWaiting` | Runs list mark | Waiting for permission |
| `acpChat.permission.changeNew` | permission card | New file · {lines, plural, one {# line} other {# lines}} |
| `acpChat.permission.changeLines` | permission card | {added, plural, one {# line} other {# lines}} added · {removed, plural, one {# line} other {# lines}} removed |
| `acpChat.permission.changeUnknown` | permission card | Atlas cannot tell how much of this file changes. |
| `acpChat.folderBusy` | another screen's conversation | The Library conversation is working in this folder. You can ask here when it finishes. Press Stop to end it now. |

### Edge cases

- **What "files written" counts.** Distinct paths inside the folder named by the turn's Edit, Delete and Move tool calls that the agent reported completed, plus one per ontology change a person allowed and the agent reported completed. It is the agent's report, not a reading of the disk. A Run tool call, or a write to a path outside the folder, is never counted and never passed over: `turn.beyond` replaces "wrote no file" and "Nothing else was changed".
- **Which requests draw the size line.** Only a request to change a file. It is computed from the request's own arguments and, for an edit, from that file inside the folder. Atlas reads no file outside the folder and none under a dot path for it: `changeUnknown` there. Delete, Move, Run, Read and an ontology change draw none.
- **Zero, one, most.** No file written: the answered state, never "0 files written". One: the singular and **Open the page**. Most: a compile names at most 10 sources and no count of files per turn is measured; the card shows a count and one name, so any count fits. Criterion 7 runs 10 sources.
- **First run.** A pressed door is a run from the press: the card reads "Connecting" (`acpChat.status.starting`) and the request is sent when the agent is ready, whichever screen is open.
- **Hangul.** File names and a typed request's first line are shown NFC; names keep their ending (middle truncation), a typed line is cut at its end.
- **Moved, renamed or unreadable folder.** The agent's write fails as it reports; the turn ends early. A file Atlas cannot read is never allowed without asking.
- **A source deleted, or the file changed, while the turn runs.** The judge reads the folder at the request, so a page citing a source that is gone asks. The size line and the verdict of a waiting request are computed again when its file changes on disk.
- **Two presses; two places.** The first answer settles its card, and the next request's buttons take no press for 600 ms. A request is shown in one place: the Runs list while open, otherwise the turn's conversation; a route change closes the list without answering.
- **Two runs waiting.** A waiting run takes the card over a running one; among waiting runs, the one that asked first. Answering one moves the list to the next. The badge stays until none waits.
- **Window hidden; app quit.** Hidden: the request waits with no limit, and Atlas shows no system notification (held, 2026-08-24). Quit: agents stop by the existing rule, a waiting request closes unanswered, and nothing is written for it.
- **Stop and a write in flight.** Atlas does not undo a write. One the agent reports finished is counted; one it reports failed or cancelled, or that was open when Atlas ended the process, is named by `turn.partial`. An allowed request the agent had not started is not run.
- **The agent switched in Library mid-turn.** The turn keeps running under the agent that started it; the newly chosen agent's conversation shows `acpChat.folderBusy` and starts nothing. A parked wiki check still finishes beside a writing turn, as slice 1 decided, and is the only second agent a folder may have.
- **Offline.** The agent's own failure arrives as ended early; Atlas adds no network call.
- **Moru and motion.** Moru uses rows the check's card already uses: his work rows while the turn runs, the held neutral pose while it waits or is stopping, the success row for files written or an answer, the pondering row when it stopped or ended. The card's box never moves; the ring and the bar stop where they are when the turn starts waiting and go on from there when it is answered.
- **Reduced motion.** The card swaps words without a crossfade, the ring is a still arc with its badge, the bar a still track, Moru holds each clip's first frame; the time waited still updates. No pause button.
- **The doors in the Library's index.** **Write wiki pages** and **Check wiki** were not disabled while a turn ran on screen; criterion 11 assumed they were. Step A disables both while any turn of the folder runs, on screen or parked, so a return mid-turn and a turn that never left look the same.
- **Stop in any conversation.** The composer's **Stop** in every dock now does what Flow 10 says, not only the card's: it closes a waiting request unanswered, refuses every later one before any standing choice, and ends the agent's process if the turn has not ended in 5 s.
- **Which conversations wait.** Only a turn that may write and is not read-only holds the folder. A dock opened for the same folder on the map, a project or Architecture shows `acpChat.folderBusy` and starts nothing; a parked wiki check holds nothing, so the map's conversation still opens beside it.
- **How a file is named on the card.** By its folder-relative path without `.md` (`wiki/architecture`), as the check's card names pages, cut in the middle when it does not fit.

### Out of scope

- **A question-desk answer, a report, and an answer refresh that outlive Library.** They are read-only only by the Library page's own state, so a parked one could be answered by a standing choice; and their results are the desk's page state. They end with the screen as today (Later item 7).
- **Parked map, project and Harness conversations in the seat.** They already keep running; giving them the card is the next slice, after this one has answered real requests.
- **A system notification or Dock badge for a request waiting unseen.** Held by the 2026-08-24 decision; lifting it needs its own record.
- **A `wiki/_log.md` line for a turn that did not complete.** Today's line names the sources a turn was sent and would overstate a stopped one; it needs wording of its own.
- **Undoing what a stopped turn wrote.** Atlas does not hold each file's earlier bytes; Git is the undo (2026-09-07, `docs/DECISIONS.md:473`).
- **A wider grant, a correction or "decide later" from the Runs list.** They need the composer and stay in the conversation.
- **The 600 ms hold in the conversation.** Its card keeps today's behaviour; the hold belongs to the list, where one request replaces another under the same pointer.
- **A second conversation that only reads beside a writing turn.** It needs a read-only guarantee per conversation that only the wiki check has.
- **The Library's observed-work strip replaying a turn that ran elsewhere.** It is page state; the card and the conversation carry the turn.

### Acceptance criteria

1. **Capture first, then recovery proof (A; gates B).** Given the installed app on current main and a real wiki with at least 3 sources not yet written. When the person presses Write wiki pages and goes to the map. Then the "before" recording shows in the installed app what Today reads from the code: the turn ends. After A, with the wiki write mode set to ask: the card counts files on the map, turns to Waiting for permission on Automations, **Review** opens the request in the Library conversation, **Allow once** changes that file only after the press, and the finished card's door lands on what was written. Installed-app walk with recordings; B does not start without it.
2. **Only a press answers.** A: given a turn waiting on a request for one file whose hash is recorded. When the route changes three times, **Hide** is pressed, the window is hidden and shown, and the clock advances 30 minutes. Then the hash is unchanged and the request still waits with its time shown; **Deny** leaves it unchanged; on the next request **Allow once** changes exactly that file. B: the same holds when the Runs list is opened and closed by Escape, by Close and by a press outside it; and given two queued requests, two presses on **Allow once** 150 ms apart change only the first file's hash (`tests/e2e/library/library-turn-background.spec.ts`).
3. **The same facts from the same inputs, once only (B).** Given one request shown in the conversation and in the Runs list. Then both draw the same path, action, outside-folder title, page verdict and size line from one component, with the verdict and the outside-folder status judged against the turn's folder; whenever the conversation's **Allow once** is disabled (basis loading, folder mismatch) the list's is too; the list has **Deny** and **Allow once** and no wider grant, correction or defer. A new 48-line file reads `changeNew` with 48; an edit reads its counts; a path outside the folder or under a dot path reads `changeUnknown`, and no file there is read. At 1040×720 with text at 200%, the longest request (a 200-character path, a failing verdict with four problems) shows its full path, the verdict and both buttons together in the list's pane (`AcpPermissionCard.test.tsx`, `WorkRunsDialog.test.tsx`, `tests/e2e/design-audits/work-card-seat.spec.ts`).
4. **Library on return is as if the person had stayed (A).** Given the same scripted 3-source compile run once watched in Library and once with the person on the map from the first second. Then the folder holds the same pages with the same bytes and the same log line apart from its time, and Library shows the same Sources states and fixed marks. When the write mode is switched to ask mid-turn, the next page waits. When a source is deleted, or a page changed so it no longer fits, after the person left, the page that cites it asks instead of passing. When the person returns mid-turn, no door starts a second turn and the record is written once. A question-desk answer, a report and an answer refresh still end when Library is left (`use-library-turns` unit test; the e2e spec above).
5. **Stop is enforced (A).** Given a turn that has written 2 files and waits on a third, run by a planted agent that ignores cancel and keeps asking. When **Stop** is pressed. Then the third file's hash is unchanged; every later request is refused and none is answered by a standing choice, with the write mode on `auto`; the card reads `stoppingTitle` until the turn has ended; the agent's process is gone within 5 s; only then does the card read `stoppedTitle` with 2, and a write open at that moment is named by `turn.partial`. A folder switch gives the same result. With nothing written and nothing run the card closes. The time a cooperating agent takes to end is reported (e2e spec above).
6. **Ends without the person; one agent (A).** Given a waiting request and no wiki check running. When the agent process is killed: the card reads `endedTitle` and the file is unchanged. When the map's conversation is opened for the same folder, or another agent is chosen in Library: the turn is not cancelled, exactly one agent process exists for the folder throughout, and that conversation shows `folderBusy`, resumes nothing and sends nothing until the turn ends. When the parked turn then asks with another agent chosen in Library: the card stands in Library and **Review** shows the asking agent's request (e2e spec above).
7. **Two waiting, one seat, bounded cost.** A: given a wiki check with unread findings and a writing turn waiting, the Library tile shows the waiting badge and names both, and the count returns once the request is answered. B: given a wiki check asking under one agent and a typed request asking under another, the card names the first to ask with "1 more waiting", the list marks both, and answering one moves to the other. At 1040×720, 1512×900 and 1920×1080 the card overlaps no control (nine-point hit test). Over a 10-source compile the card redraws at most 4 times a second and retained heap grows by at most 2 MB; peak footprint is reported (`tests/e2e/design-audits/work-card-seat.spec.ts`).
8. **Smooth (A, again for B's list).** Given running, waiting, running, stopping and finished recorded per frame in the static build. Then no frame interval exceeds 50 ms, the card's box never moves, the ring and the bar stop and resume from the value last drawn, and the Runs list changes height once per request. Under reduced motion nothing moves and every fact still reads (`/ui-proof`).

### Risks

1. **An answer given away from Library is given with less care (B).** Design: the same card, inputs and first focus, one request once, a 600 ms hold under a moving press. Falsifier, in the decision record: a file whose bytes changed before **Allow once**, or the owner allowing from the list what they then undo; then **Review** stays on the Library conversation, which A ships.
2. **The wait is never seen, so "background" stalls for an hour.** Design: a hidden card returns for a request, the tile badge stays, the card shows the real time waited. Probe: criterion 1 records every wait; one over five minutes with the window hidden is the falsifier the 2026-08-24 hold names and moves the notification slice up. Also measure whether Claude and Codex end a turn left waiting 30 minutes.
3. **A standing choice writes what the person no longer wants** because the mode, the folder or the turn changed after they left. Design: everything is read at the request; Stop and a folder switch refuse instead of asking. Falsifier, in the decision record: a page that lands under a standing choice after the mode was switched to ask, or after Stop; then writing turns end with the screen again.

### Later

1. **Parked map, project and Harness conversations take the same card and Runs list.** Next when B's criteria pass in the installed app; closes 387a3c17's dissent everywhere.
2. **A system notification or Dock badge for a request waiting unseen.** One-way: a record overturning the 2026-08-24 hold. Next on the first recorded wait over five minutes.
3. **The folder list says a turn is writing before a switch ends it.** Next on the first report of a turn lost to a switch.
4. **A log line for a turn that ended early**; **a second conversation that only reads beside a writing turn**. Next when a person asks what a stopped turn left, or asks the map's agent a question during a compile.

### Owner question

None. Decided: a request ends up answered in the Runs list, once, with the conversation's own card, because it is the only choice that keeps both the facts and the person's place; A ships the Library door first so the second surface is built on evidence. To reverse: stop after A; nothing in A depends on B.

## Revisions

- 2026-11-20: first draft, written read-only in the session scratchpad.
- 2026-11-20: accepted and committed; slice 1 is being built.
- 2026-11-20: corrected Today and Problem: the Library dock does not keep its conversation, so leaving Library stops the check rather than only losing its result.
- 2026-11-20: slice 1 built; added the edge cases for a parked read-only check, a folder switch mid-run and a write asked for during a check.
- 2026-11-20: added the right-hand dock and tab-change edge cases after the owner asked that the work keep running and stay in view on every screen.
- 2026-11-20: review round: the read-only flag belongs to the running turn, a write it asks for never takes an automatic approval, only the check is parked when Library goes, a re-check keeps the last findings until a new report arrives, and "Writing Library turns keep running" joined Later. The card's line names only what the agent does, and its found and unreadable states got sentences that fit its two lines.
- 2026-11-20: Later 1 built. The store keeps the check's run and a separate counted run of kind `meaning`, which an app-layer adapter fills from the folder's preparation events. The card opens only for a press in this launch, a preparation that continues by itself draws only the ring, and an update of changed files draws the ring from ten files and nothing below. While the Wiki desk's meaning line is on screen, the card stands down. "1 more running" stands at the right of the title row rather than in the action row, because the check's found state fills the action row in English; the title gives way beside it, and no press moves when it appears. Minutes left stand beside the title, so a long file name keeps its own line. The dialog lists only the two kinds that exist today: a third operation adds its own row and detail. Nothing else from Later 1 is unbuilt.
- 2026-11-20: Later item 2 built: a scheduled check takes the same card and seat everywhere but Automations, where a stage in the page shows it; the Automations tile rings while it runs and counts finished runs; **Stop** leaves the schedule on; two runs at once open the centred list. Edge cases updated to match.
- 2026-11-20: Later item 6 specified as its own section after the owner asked that background work never stop while the person moves around: any Library turn that may write keeps running away from Library, a permission request waits in the notice seat and is answered once in the Runs list with the conversation's own card, and a conversation opened elsewhere for the same folder waits instead of ending the turn. One-way; the section names the decision record it needs.
- 2026-11-20: review round on the item 6 section. Built in two steps: A keeps the turn and its record alive with **Review** opening the Library conversation, B moves the answer into the Runs list only after A's capture. The write mode and the judge are read at each request; Stop and a folder switch refuse later requests and end the process after 5 s; a conversation opened elsewhere starts no agent; question-desk answers, reports and refreshes still end with Library; "files written" names its evidence; the list holds a new request's buttons for 600 ms. States added for a return mid-turn, a switched agent, the check's own request and a tile with both marks. Decision 475f5a7e covers it.
- 2026-11-20: step A built. A turn that may write keeps running away from Library with its card, its request waits on the card with **Review**, Stop holds against an agent that ignores it, and a dock opened elsewhere for the same folder waits. Edge cases added for the index doors, Stop in any conversation, which conversations wait and how the card names a file. Criterion 1's installed-app capture is not done yet.
- 2026-11-20: Later 1 joined to item 2's run model. Meaning preparation is one more kind of the seat's runs (`kind: 'meaning'`, one per folder), so the separate counted slot, its own Runs dialog and its reserved "1 more running" slot are gone: the card names the latest of the runs it holds, "N more running" sits at the end of the action row, and the Runs dialog lists the preparation with its files prepared, its line and its Stop. Its figures still reach the card, the dialog and the rail at most four times a second without redrawing the shell.
- 2026-11-22: only the code cites moved, to follow the split of `use-acp-session.ts` and its former line numbers; no statement changed.
- 2026-11-22: corrected the Stop line of Today: Stop now answers the waiting and every later request `cancelled`, asks the agent to cancel and ends the process after the grace, instead of leaving the request unanswered.
- 2026-11-22: the wiki write-mode cite names `library-preferences.ts`, where the split appearance preferences put it; no plan changed.
- 2026-11-22: the transcript-state cite names `transcript-states.tsx`, renamed because it holds several state parts; no plan changed.
- 2026-11-22: the agent doctor cite names `use-agent-doctor.tsx`, renamed because the file holds a hook; no plan changed.
