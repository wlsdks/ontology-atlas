---
title: "Work status: states, design and copy"
doc_type: spec
status: draft
area: git
date: 2026-11-22
decisions: []
---

# Work status: states, design and copy

What the person sees in slices 1 to 11 of Work status, split on 2026-11-22 from `docs/specs/2026-11-21-work-status-destination.md`
("the Work status spec" below), which holds the concept, why Atlas, each slice's behaviour and the
slice list. Section names used here without a file (Progress, The check queue, What a room
changes, The room panel, Time left, Flow) are that spec's; criteria are in
`docs/specs/2026-11-22-work-status-criteria.md`.

## Person and moment

None — in the Work status spec.

## Today

None — in the Work status spec.

## Problem and alternatives

None — in the Work status spec; the board's own alternatives are under its "The board".

## Flow

None — in the Work status spec.

## States

| State | Web | macOS app |
|---|---|---|
| No repository chosen | `workStatus.web.title`, `.web.body`, Get the app | `workStatus.choose.title`, `.choose.action` opens the picker |
| Loading: first read | as above | the board draws at once; rooms arrive as each worktree is read, `workStatus.reading`; input never waits |
| Error: git missing or the folder unreadable | as above | git missing reuses `atlasGit.install.*`; unreadable says `workStatus.unreadable` with Choose repository folder |
| Empty: only the main checkout | as above | `workStatus.empty.title`, `.empty.body` |
| Worktree folder missing | as above | a dark room with `workStatus.chip.missing` and `workStatus.row.missing`, with `git worktree prune` as text |
| No lock; stale lock; zero commits | as above | `workStatus.holder.noLock`; a stale lock is a dark room with `workStatus.chip.lockLeft` and `workStatus.row.lockLeft`; `workStatus.row.noCommits` |
| On this Mac only (no host connected) | as above | each conveyor is dashed after push with `workStatus.conveyor.notConnected`; slice 10 adds `workStatus.connect.offer` as its button |
| On the server only | as above | a mini room on the No session floor with `workStatus.side.notOnMac` |
| A worktree with no PR | as above | `workStatus.git.unpushed`, or `workStatus.git.pushed` with `.side.noPr` |
| Uncommitted files; operation in progress; no branch | as above | `workStatus.git.uncommitted`, `.git.operation`, `.git.detached` on the monitor's last line |
| Moving; quiet; stalled; idle | as above | `workStatus.progress.changed`; `.quiet`; `.stalled` with `.stalledWhy` or `.stalledCommand`, on the stage, where pressing the room opens the panel; `.idle` |
| A session whose subagents are moving; files changing with no agent Atlas recognises | as above | `workStatus.progress.subagents`; a dark room with its activity line and `.noAgent` |
| Progress cannot be watched on this volume | as above | `workStatus.progress.eachMinute`; no pulse; the time of the last change, read each minute |
| More moving rooms than the stage holds; stalled rooms while another screen is open | as above | `workStatus.stage.more`; the rail tile's count, `navRail.workStatusStalled` |
| A check waits for a slot: by load, by slots, first in line | as above | a ticket in the machine room and on the room's parcel; `workStatus.queue.place` with `.whyLoad` or `.whySlots`, and `.starts` or `.noEstimate`; pressing the ticket moves it first |
| A check holds a slot; a holder ended without finishing | as above | a lit bay with `workStatus.queue.running`; the bay goes dark and `.released` shows for 5 s |
| A ticket moved first; the queue has no ticket | as above | toast `workStatus.queue.moved` with Undo; the machine room shows the load and `.empty` |
| No script in this repository asks for a slot yet | as above | the machine room shows the load and `workStatus.queue.unused` |
| A room with a capability; shared with another room; files no concept names | as above | `workStatus.meaning.changes` on the wall sign; `.shared`; `.unmapped` in the panel |
| The open folder does not describe this repository | as above | rooms show Git facts; the panel's Changes tab lists files by folder with `workStatus.meaning.noFolder` and Choose folder |
| The panel: reading; no change yet; the worktree vanished while it was open | as above | `workStatus.panel.reading` with the head already drawn; `.noChanges`; `.gone` with Close |
| Open in editor or terminal: first press; opened; refused; none installed | as above | `workStatus.open.choose` with the installed applications; the application comes forward; toast `.refused`, nothing opened; `.none` with Copy folder path |
| Find: no match | as above | `workStatus.find.none`; Escape clears the field and keeps focus in it |
| A check running: time known, under 90 s, unknown, late | as above | `workStatus.eta.range`, `.eta.about`, `.eta.unknown`, `.eta.slow` |
| The session list: read; some sessions not in it; unreadable; switched off | as above | `workStatus.sessions.status` in the agent state popover; `.missing` with Add another settings folder; `.unreadable` with its reason, rooms keeping their words from beats; `.off` with the switch |
| Hook entries: not added; confirm | as above | `workStatus.agentState.offer` with Add to Claude Code and Not now; `.confirmTitle`, `.confirmBody` and each listed file with its entries and Add another settings folder, where Cancel changes nothing |
| Hook entries: added; Codex not yet trusted | as above | `workStatus.agentState.status` with Remove; when sessions stay silent, `.silent` with Add another settings folder; `.codexTrust` |
| Hook entries: blocked, or the file refused | as above | `workStatus.agentState.managed` with no button; `.invalid`, `.changed`, `.linked`, `.unwritable`, `.pickRefused`, nothing written |
| Waiting for approval; waiting for an answer; thinking; finished replying; the session failed | as above | `workStatus.room.asking.*` first on the stage, `.asking.answer` for an answer; `.room.thinking.*`; `.room.replied`; `.room.failed.*` in the second class |
| The remote base was fetched over 3 min ago | as above | `workStatus.fetch.stale` with Fetch now and `.fetch.auto` (slice 10) |
| pre-push passed; stopped; result unknown | as above | `workStatus.hook.passed`; `.stopped` with `.stoppedLanes`, in the stage's second class until the head moves or a new run starts; `.unknown` |
| Ready to merge | as above | `workStatus.status.ready` with `.readyDetail`, the parcel standing at the hatch |
| CI time left while reading is slowed, paused or offline | as above | the last read's range, not counting, with `workStatus.eta.frozen` |
| `gh` not installed; signed out; no access (404) | as above | `workStatus.gh.missing`, `.signedOut`, `.noAccess`, each with Check again |
| Connecting | as above | `workStatus.connect.body`; Cancel leaves the conveyors dashed |
| Connected; stop reading | as above | `workStatus.connected.line`; `.stop`, `.stopNote` |
| Throttled | as above | `workStatus.throttle.slowing`, `.paused`, `.secondary`; data keeps its read time |
| Offline; no remote; host without a provider | as above | `workStatus.offline`, `.noRemote`, `.unsupportedHost` |
| Largest measured: 34 worktrees (2026-11-21); fixtures of 40 and 60 | as above | six large rooms, every other worktree a mini room on its floor or a shelf count; floors scroll, the header, stage and shelf stay |
| Windows app | Out of scope: same web card | "this computer" variants; rooms from locks and Git, no session by process; beats from file changes and commits only; the queue by its limit alone, with no load gauge; the panel with Copy folder path and no Open buttons; `workStatus.agentState.windows` in place of the Add button; PRs and CI as on macOS |

The web card follows `.claude/rules/surfaces.md:116-119` and joins `DEGRADED_SURFACES`.

## Design direction

Rooms in one building, the owner's choice of 2026-11-22 (Today). This section fixes structure and
behaviour; ink, light and pixel styling follow the approved renders. Sources are principles, not
assets: GitHub Actions' run graph and merge queue, Linear's gliding states, the Git clients under
What a room changes. Kept: one ink per session (`--work-session-1` to `-5`), the stations, push as the
crossing, help popovers. Retired: the bands and seam, rows on a ruler, the headline and summary.

**Header.** Title, `repoLine`, Find, Choose repository folder. Nothing else leads the page.

**A room** is one worktree and one button: pressing it opens the room panel. It is one scene with
one floor line and one light (direction A, "a screen on a console", 2026-11-22): Moru on the floor
faces a screen on a console, and the screen is the room's only light and only words. Its head is
the branch and, from slice 5, the capability it changes; under it the newest commits beyond the
base branch, three at most, each one ellipsised line with its age, newest on top; at its foot what
is not committed with the file changed last, and the commit count. A bezel under the screen names
the tool and session number and the state with how long it has worked, beside a light that is
green while something runs. The screen lights the wall and floor in the session's ink while a
session is live there and is dim when none is; it pulses once in a second that had a beat and is
never on a timer. A room narrower than `WIDE_ROOM_W` hangs its screen on the wall above Moru with
the newest commit only. A large room also draws a track in its floor that leaves through a hatch
in the side wall marked `main`: stations pre-push, push, PR, CI along it, a cart standing where the
branch is, and a pill over the cart with the time left. The cart rides between two stations only
while a timed check runs, stops short of the next when the check runs late, and enters the hatch
only on the fact. Where Atlas cannot see (no remote, no host connected) the track is dashed from
there on and says why.

**Three tiers by attention.**

1. **Front stage:** at most six large rooms, by class: waiting for approval; CI failed or pre-push
   stopped; ready to merge; stalled, or slower than usual; a check waiting for a slot, pre-push or
   CI running, and a merge for its moment; moving, thinking or two tools; lock left behind or
   folder missing. Quiet and idle rooms stay on their floors. Equals keep the order they
   arrived in, so a room moves only when its class changes: up at once, down after the lower state
   has held 5 s. Rooms beyond six lead their floors, and `stage.more` counts those that are moving.
2. **Session floors:** one floor per session and one for worktrees no session holds. Its label
   gives the session, its start, its worktree count and at most three counts (`floor.sum.*`). Mini
   rooms are equal in size: a corner where a small Moru holds still or a crate stands, the branch,
   one status line, the newest commit subject with its age, and a track filled as far as the
   branch has come. With six or fewer, the floors merge into one row under one heading, **Floors
   below**, with how many are working; the heading is a plate beside one row, a line above more,
   and carries what `stage.more` said. A mini room with a floor to itself spreads its newest
   commits and what is not committed into columns.
3. **Quiet shelf:** counts that open a list (merged into the base branch; unchanged for over 7 days
   with no session), then the latest merges with their times.

**The machine room** (slice 4) is the building's ground floor, in one row with the shelf, and stays
while floors scroll. It is where the Mac's load and the line of checks are things to look at.

- **The load gauge:** one cell per core, filled to the 1-minute load, with the number beside it
  (`queue.load`). Load beyond the cores fills a second row in warning ink, so 20 on 12 cores reads
  as twelve full and eight over. Cells change only at a read, every 5 s.
- **Bays:** one per slot of the limit. A bay a check holds is lit in its session's ink and carries
  the branch, the kind of check and its elapsed time; an empty bay is dark.
- **The line:** tickets to the right of the bays, numbered from 1 in the order they will start,
  each with its branch. Five show, then `queue.more`. The same number hangs on the parcel in that
  check's room, which stands before the pre-push station until it starts.
- **A ticket is a button.** Its help gives the reason in numbers (`queue.whyLoad`, `.whySlots`)
  and what a press does; pressing it moves it first.

Nothing here moves on a timer: a cell fills when load was read higher, a ticket moves when the
line changed, a bay lights when a grant was written. With no ticket and no holder the machine room
draws the gauge and one line, and no frame between reads.

**Moru is drawn only where a session is evidenced and loops only while a measured state runs,**
which keeps `brand.md:31` and `:260`: state comes from the signals in Cases, never from the figure,
and a room with no running state is still. Only clips that exist are used, named by their row
`public/brand/mascot-<name>-row-128.png`: `code` (the brand guide's `laptop-code`), `think`,
`pondering`, `read` (`source-read`), `waiting` (`blink`), `await-permission` and `uncertain`.
The last two are reserved to the permission card (`brand.md:209`); slice 2 changes that row and
adds a Work status row to the table. Each room's loop starts at an offset taken from its worktree
id, so six rooms never move in step. Session identity rests on the bezel and the screen's light, never on
Moru's ink.

**Sizes.** The stage shows as many large rooms as fit at their minimum width, at most six: six
across at 1920, three at 1040×720. Floors scroll; the header, the stage, the machine room and the
shelf stay. Room
minimum sizes are new tokens in `app/styles/work-status-tokens.css` (new tokens needed). **Empty:**
one lit room with Moru's `waiting` loop, `empty.title` and `empty.body`. **Web:** the degradation
card, no rooms. **Reduced motion:** still states: figures hold a pose, a tier change cross-fades in
place over `--motion-fast`, digits swap, lamps are steady, the parcel is placed at each read.

### Cases

"Large" is a state's class on the stage; such a state also has a mini form for the seventh room on.
"Dark" is a room with its lamp off and no figure. Any room's last monitor line carries Git facts.

| State | Large | Mini | Shelf | Scene (existing clips) | Signal | Slice |
|---|---|---|---|---|---|---|
| Waiting for approval | first | yes | no | `await-permission` loop; the lamp and monitor turn amber and breathe | the session list: `waiting` for a `permission prompt` or `sandbox request`; or the agent-state file: PermissionRequest or `permission_prompt`; with a live session | 7, 9 |
| Waiting for an answer | first | yes | no | `await-permission` loop; the lamp and monitor turn amber and breathe | the session list: `waiting` for `input needed`, `dialog open` or `worker request`, or `state` `blocked`; with a live session | 7 |
| CI failed | second | yes | no | `uncertain` once, then held; the monitor takes danger ink | host: a failed job | 11 |
| pre-push stopped | second | yes | no | `uncertain` once, then held; the monitor names the lanes that failed | a hook-run record that ended with a failed lane, or a `pre-push` that ended with the remote-tracking ref unmoved; until the head moves or a new run starts | 8 |
| The session failed | second | yes | no | `uncertain` once, then held; the monitor takes danger ink | the session list: `state` `failed` | 7 |
| Ready to merge | third | yes | no | `waiting`, held; the parcel stands at the hatch | host: an open PR that is not a draft, with every check passed and no conflict | 11 |
| Stalled | fourth | yes | no | `pondering`, held; the lamp at half, the monitor in warning ink, a flat activity line | a live session and no beat for 10 to 60 min (Progress) | 3 |
| Slower than usual | fourth | yes | no | `pondering` loop | elapsed past the usual longest time (Time left) | 8, 11 |
| A check waits for a slot | fifth | yes | no | `waiting`, held; a numbered ticket on the parcel, which stands before pre-push; the same ticket in the machine room's line | a ticket in `slots/tickets/` with a live pid and no grant | 4 |
| A check holds a slot | fifth | yes | no | `read` loop; the parcel leaves for push; its bay is lit | a grant in `slots/grants/` with a live pid | 4 |
| pre-push running, by lane | fifth | yes | no | `read` loop; lanes on the monitor | hook-run record | 8 |
| CI running | fifth | yes | no | `waiting` loop | host: a run in progress | 11 |
| CI queued | no | yes | no | `waiting`, held | host: a run queued | 11 |
| Merged just now | keeps its place 3 s | no | then counted | held pose; the parcel enters the hatch and the lights go out | the base ref moved (Flow 4), or the host says merged | 2, 11 |
| Moving | sixth | yes | no | `code` loop; the lamp pulses in a second that had a beat; the activity line gains a mark | a beat under 2 min old (Progress); `busy` from slice 7; PreToolUse from slice 9 | 3, 7, 9 |
| Thinking | sixth | yes | no | `think` loop; a cursor blinks on the monitor | the session list: `busy` with no command seen; or the agent-state file: UserPromptSubmit or PostToolUse | 7, 9 |
| Two tools in one worktree | sixth | yes | no | two figures, each under its tag | processes of two tools in one folder (shipped) | 2 |
| Finished replying | no | yes | no | `waiting`, held | the session list: `idle` or `state` `done`; or the agent-state file: Stop or `idle_prompt` | 7, 9 |
| Quiet | no | yes | no | `waiting`, held; a steady lamp | a live session, the last beat 2 to 10 min old | 3 |
| Idle | no | yes | no | `waiting`, held; the lamp at half | a live session, no beat for over 60 min | 3 |
| A session whose subagents are moving | no | yes | no | `waiting`, held; a steady lamp | no beat in its own room, a beat under 2 min old in a worktree it locked | 3 |
| Files changing, no agent Atlas recognises | no | yes | no | dark, no figure; the activity line gains marks | beats in a worktree with no session | 3 |
| Lock left behind; folder missing | seventh | yes | no | dark; a taped parcel, or its outline | a stale lock; a missing folder (shipped) | 2 |
| No session, changed within 7 days | no | yes | no | dark; a parcel | last commit time (shipped) | 2 |
| No session, unchanged over 7 days; merged | no | no | counted | none | last commit time; Flow 4 (shipped) | 2 |
| No remote; host not connected | dashed conveyor and its reason | status line | no | by its other state | `origin`; the connection | 2 |
| Pushed, no PR; commits not pushed | Git facts line | status line | no | by its other state | remote-tracking ref against the head; host | 5, 11 |
| Changes a capability; shares one with another room | wall sign's second line; a link mark toward the other room's sign | status line | no | by its other state | changed paths on the concept map (What a room changes) | 5 |
| Uncommitted files; merge, rebase or cherry-pick in progress; no branch | Git facts line | status line | no | by its other state | `git status` and Git's operation files | 5 |

### Motion

Every motion starts from the drawn value, moves only `transform` and `opacity`, yields to the next
read or input by retargeting from where it is, and never restarts mid-way. A loop runs only while
its state does and pauses when the screen is hidden or its room is off screen; a board with no
running state draws zero frames between reads. Returning to the screen places rooms without travel.

| Change | What moves | Time and curve | Reduced |
|---|---|---|---|
| A room enters | it fades in rising; neighbours make room | `--motion-base` on `--motion-ease`; neighbours on `SPRING.surface`; the first open staggers once (`useStaggerOnce`, within `--motion-expressive`) | appears |
| A room leaves | it fades where it stands; neighbours close | exit clock `calc(var(--motion-base) * 0.67)` on `--motion-ease-exit`; neighbours on `SPRING.surface` | disappears |
| A tier or place changes | one element glides from its drawn box to the new one (FLIP); the large and mini faces cross-fade at their own size, so no text is stretched; rooms changed by one read start together | `SPRING.surface`, retargeted from position and speed; faces over `--motion-base`. If the recording reads abrupt across 1920, a slower `SPRING` entry (new token needed) | cross-fade in place over `--motion-fast` |
| Time left changes | each digit rolls to its value; a change of shape ("3–5 min" to "About 50 s") cross-fades (`SwapText`) | `--motion-slow` on `--motion-ease`; a new primitive in `motion-work.css` on existing tokens | digits swap |
| A check runs | the parcel rides one linear transform across the estimate's upper bound; a new estimate changes its speed from where it is and never moves it back; running lanes breathe (`.motion-run-pulse`) | linear, for the check's length | placed at each read |
| Approval is asked | the room is promoted as above; lamp and monitor cross-fade to amber and breathe; the figure cross-fades | amber in over `--motion-base`; breath period `calc(var(--motion-base) * 9)`, a work-only loop listed in `infinite-motion` | steady amber |
| A check runs late | the parcel eases to rest short of the next station; words and ink cross-fade | `--motion-settle`; ink over `--motion-fast` | placed |
| CI fails | the monitor and job marks take danger ink and the figure changes; no shake | `--motion-fast` | same end state |
| A PR merges | the monitor's words swap, the parcel runs into the hatch, the lamp and the room's light go out; after 3 s the dark room glides into the shelf's count, which rolls up by one | parcel `--motion-expressive`; light out over `--motion-slow`; fold on `SPRING.surface`, opacity on the exit clock | the count swaps, the room disappears |
| A session ends and its lock stays | the figure fades and the lamp goes out, the parcel stays; then a demotion | figure on the exit clock; light over `--motion-slow` | same end state |
| A beat arrives | the lamp's glow rises and falls once; at the next 10-second step the activity line shifts one mark left and the new mark grows from its base | glow up over `--motion-fast`, back over `--motion-base`, at most once a second and never queued; the shift and the mark over `--motion-base` on `--motion-ease`, `transform` only | no glow; the mark appears |
| A room goes quiet, stalls, or moves again | the figure cross-fades between loop and held pose; on Stalled the lamp eases to half and the monitor's ink cross-fades, then the room is promoted as a tier change; on a new beat it returns the same way | figure and ink over `--motion-base`; lamp over `--motion-slow` | same end state |
| The load is read | the gauge's cells fill or empty one after another toward the new value; the number rolls | each cell's opacity over `--motion-fast`, 30 ms apart, the whole within `--motion-slow`; digits as Time left | cells and number swap |
| A ticket joins the line | it fades in rising at the line's end; the parcel in its room gains the ticket by cross-fade | `--motion-base` on `--motion-ease` | appears |
| The line moves up | every ticket glides one place toward the bays from where it is drawn (FLIP); its number rolls | `SPRING.surface`, retargeted from position and speed; digits as Time left | placed; numbers swap |
| A slot is granted | the first ticket glides into the free bay and becomes its tag; the bay's lamp cross-fades on in the session's ink; in the room the ticket leaves the parcel and the parcel starts for push; the rest of the line moves up in the same frame | glide on `SPRING.surface`; lamp over `--motion-base` | placed; lamp on |
| A ticket is moved first | it glides along the line to place 1 while the tickets it passes each glide one place back, together | `SPRING.surface`, retargeted; an Undo reverses from where each is | placed |
| A holder ends without finishing | its bay's lamp goes out and its tag fades; no shake | lamp over `--motion-slow`; tag on the exit clock | same end state |
| The panel opens, swaps or closes | it slides in from the right edge and the board's rooms glide to their places in the narrower width; a swap cross-fades its content in place; closing reverses | panel `--motion-base` on `--motion-ease`, exit clock out; rooms on `SPRING.surface` | appears; rooms placed |

**Checked per frame** (criteria 20, 35 and 37), on the static build with the desktop bridge stubbed in the
page and scripted snapshots of 6 and 40 rooms. Every moving box: `motionShares` with a first-frame
share `ffs` of at most 0.15 and a largest frame share `mfs` of at most 0.27, the eased bar of
`tests/e2e/motion-sampler.spec.ts:71-72`, and at least 8 frames between start and end, also when a
second change lands mid-glide; `smoothnessViolations` empty, so no layout property animates; zero
frames at rest. CI enforces those. `expectSmoothMotion` enforces the 50 ms frame interval only
under `MAP_PERF_BARS=1` (`tests/e2e/motion-sampler.ts:388`), so that bar is run headed on this Mac
with 40 rooms and its printed interval attached to the pull request.

## Copy

ko is in the pull request body, written to the Wording rules of
`docs/specs/2026-11-21-library-words-and-first-run.md`. Namespace `workStatus` unless noted. On
Windows each string that says "this Mac" uses its `.pc` variant, which says "this computer". Under
"Where it appears", Row now means a room's status or last monitor line, Station its conveyor, and
Band header or Server band the line beside the shelf. Retired with the bands: `summary`,
`headline.*`, `band.mac`, `band.server`, `ruler.checks`, `ruler.ready`, `group.*`, `session.counts`,
`session.quiet`; retired by slice 3: `room.working.*`, `room.quiet`, `room.silent`. No product's
name appears in a string: an application is `{app}`, filled with the name the OS gives it. This
revision edits no catalogue file, because `feat/work-status-rooms` is changing them; that branch's
catalogue names some slice 2 strings differently (`room.quietMinutes`, `monitor.running`), and
slice 3 moves them to the keys below.

| Key | Where it appears | English |
|---|---|---|
| `navRail.workStatus` | Rail | Work status |
| `title` | Page heading | Work status |
| `ruler.working` / `.prePush` / `.pr` / `.ci` / `.main` | Conveyor stations | Working / pre-push / PR / CI / main |
| `repoLine` | Heading right | {repo} · {count, plural, one {# worktree} other {# worktrees}} on this Mac |
| `band.seam` | A conveyor's push station | push |
| `side.notOnMac` / `.notPushed` / `.noPr` | Mini room; Git facts line | Not on this Mac / Not pushed / Pushed, no PR |
| `session.header` | Session header | {tool} · session {number} |
| `session.started` / `.subagents` | Session header | started {time} / {count, plural, one {# subagent} other {# subagents}} |
| `session.unlocked` | Session header | a {tool} process |
| `tool.acp` | Session header | Claude Agent in Atlas |
| `tool.claudeCode` / `.codex` / `.unknown` | Session header | Claude Code / Codex / An agent; slice 12 adds `.gemini` |
| `holder.locked` | Row tooltip | {tool} subagent {id} · locked at {time} |
| `holder.lockedUnnamed` | Row | Locked at {time} |
| `holder.process` | Row | {tool} is running in this folder |
| `holder.subagent` | Row | Subagent {id} |
| `holder.lastCommit` | Row | {ago} by {author} |
| `holder.noLockQuiet` | Row | No lock |
| `holder.noLock` | Row tooltip | No lock · last commit {ago} by {author} |
| `holder.staleLock` / `.ended` | Row tooltip / Row | Locked by a {tool} session that has ended / Session ended |
| `chip.missing` / `.lockLeft` | A dark room's large line | Folder missing / Lock left behind |
| `row.lockLeft` | A dark room's last line | The {tool} session that locked this worktree has ended. {count, plural, =0 {It has no commits beyond {branch}.} one {Its # commit beyond {branch} is not merged.} other {Its # commits beyond {branch} are not merged.}} |
| `holder.twoTools` | Row | {first} and {second} both have processes in this worktree |
| `row.noCommits` / `.commits` | Row | No commits beyond {branch} / {count, plural, one {# commit} other {# commits}} beyond {branch} |
| `row.unknown` | Row | Not measured against {branch} |
| `row.missing` | A dark room's last line | The folder {folder} is missing. git worktree prune removes its record. |
| `hook.passed` / `.stopped` | Station | {hook} passed / {hook} stopped |
| `hook.unknown` | Station | Push did not complete. The hook wrote no result, so Atlas cannot say which check stopped it. |
| `station.mergedInto` | Station | Merged into {branch} |
| `station.pr` / `.draftPr` | Station | PR #{number} / Draft PR #{number} |
| `station.ci` | Station | CI {done}/{total} |
| `status.ciRunning` | Row | CI running: {job} › {step} · {elapsed} |
| `status.ciFailed` | Row | CI failed at {job} › {step} |
| `status.ready` | Row | Ready to merge |
| `status.draftNoRuns` | Row | Draft PR · no CI runs |
| `integration.collects` | Git facts line of an integration branch's room | {branch} collects {count} branches |
| `connect.notConnected` | Help on a conveyor's dashed part, before a host is connected | {host} is not connected. Connecting shows PRs and CI. |
| `connect.offer` | A conveyor's dashed part, from slice 10 | Show PRs and CI from {host} |
| `connect.body` | Dialog | While Work status is open, Atlas runs gh to read this repository's open PRs, their CI runs and steps, and merges to main from {host}, at most 1,000 requests an hour. gh sends your {host} sign-in and the repository name; nothing from your files is sent. Each request is listed in Settings › Privacy · data. |
| `connect.confirm` | Dialog button | Read PRs and CI as {account} |
| `gh.missing` | Server band | Atlas reads PRs and CI through the GitHub CLI (gh), which is not installed on this Mac. Install it, run gh auth login, then press Check again. |
| `gh.signedOut` | Server band | gh is not signed in to {host}. Run gh auth login --hostname {host} in a terminal, then press Check again. |
| `gh.noAccess` | Server band | {account} cannot read {repo} on {host}. Ask for access, or sign gh in as another account. |
| `connected.line` | Server band | From {host} as {account} · read {ago} |
| `connected.stop` / `.stopNote` | Popover | Stop reading from {host} / Atlas stops sending requests. Your gh sign-in is unchanged; gh auth logout ends it. |
| `throttle.slowing` | Server band | {host} allows {remaining} more requests this hour, so Atlas now sends one request every 2 minutes and leaves the rest of the hour's allowance to gh and other programs signed in as {account}. |
| `throttle.paused` | Server band | Paused until {time}: the hourly limit for {account} on {host} is nearly used. PRs and CI show what was read at {readAt}. |
| `throttle.secondary` | Server band | {host} asked for fewer requests. Next request at {time}. |
| `offline` | Server band | Offline. PRs and CI show what was read at {readAt}. Everything read on this Mac stays live. |
| `noRemote` | Server band | No remote, so there are no PRs or CI to show. |
| `unsupportedHost` | Server band | Atlas does not read PRs and CI from {host}. Everything read on this Mac stays live. |
| `reading` | Band foot | Reading worktrees: {read} of {total} |
| `unreadable` | Stage | {repo} could not be read. Choose the repository folder again to grant access. |
| `notRepository` | Stage | {folder} is not a Git repository. Choose the folder that holds your project's .git. |
| `searchWidgets.goTo_workStatus` | Command palette | Go to Work status |
| `choose.title` / `.action` | Stage | Choose the Git repository your agents work in / Choose repository folder |
| `empty.title` / `.body` | Stage | {repo} has only its main checkout / Each worktree gets a room here. When Claude Code or Codex starts working in one, you see it in that room. |
| `web.title` / `.body` | Web card | Work status runs in the desktop app / A browser cannot run git or read this computer's processes. In this browser you can still open your folder's map and Library. |
| `find.placeholder` / `.none` | Header field / board | Find a worktree or branch / No worktree or branch matches "{query}". |
| `stage.more` | Under the front stage | {count, plural, one {# more is working on the floors below} other {# more are working on the floors below}} |
| `floor.worktrees` / `.noSession` | Floor label | {count, plural, one {# worktree} other {# worktrees}} / No session |
| `floor.sum.asking` / `.stalled` / `.ciFailed` / `.cleanup` / `.working` / `.checking` / `.none` | Floor label, at most three | Approval {count} / No activity {count} / CI failed {count} / Needs cleanup {count} / Working {count} / Checking {count} / Quiet |
| `shelf.merged` / `.old` | Shelf counts; pressing one opens its list | Merged into {branch} {count} / Unchanged for over 7 days {count} |
| `room.lastCommit` / `room.unheld` | Last line / mini room | last commit {ago} / Unchanged for {days, plural, one {# day} other {# days}} |
| `progress.changed` / `.command` | Monitor, large line; mini room | Changed {ago} / A command is running · {elapsed} |
| `progress.quiet` / `.idle` | Monitor, large line; mini room | Quiet for {duration} / No activity since {time} |
| `progress.stalled` | Monitor, large line; mini room | No activity for {duration} |
| `progress.stalledWhy` | Monitor, last line | No file changed, no commit was made and no command used CPU. Press the room to see what it did last. |
| `progress.stalledCommand` | Monitor, last line | A command has run for {elapsed} and used no CPU for {idle}. Press the room to see what it did last. |
| `progress.subagents` | Monitor, large line; mini room | {count, plural, one {Its subagent is working in # worktree} other {Its subagents are working in # worktrees}} |
| `progress.noAgent` | A dark room's last line | Files are changing here. No agent Atlas recognises is running in this folder. |
| `progress.eachMinute` | Monitor, last line | Atlas cannot watch this folder for changes, so it reads the time of the last change once a minute. |
| `progress.lineLabel` | Activity line, accessible name | Last {minutes} minutes: {count, plural, =0 {no file changed} one {# file change} other {# file changes}} |
| `navRail.workStatusStalled` | Rail tile, accessible name and count | Work status: {count, plural, one {# room has had no activity for over 10 minutes} other {# rooms have had no activity for over 10 minutes}} |
| `queue.title` / `.load` | Machine room | Check queue / Load {load} on {cores} cores |
| `queue.place` | Monitor, large line; ticket help | Waiting for a slot · {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} in line |
| `queue.whyLoad` | Monitor, last line; ticket help | Load is {load} on {cores} cores with {running, plural, one {# check} other {# checks}} running. The next check starts when load falls below {threshold}. |
| `queue.whySlots` | Monitor, last line; ticket help | {running} of {limit} slots are in use. The next check starts when one ends. |
| `queue.starts` / `.startsAbout` / `.noEstimate` | Pill over the parcel; ticket | Starts in {low}–{high} min / Starts in about {time} / No start time yet. Atlas estimates once 3 checks of this kind have run. |
| `queue.running` | Bay tag; monitor label | {kind} running · {elapsed} |
| `queue.kind.prePush` / `.e2e` / `.unit` / `.rustBuild` | Bay tag; ticket | pre-push / End-to-end tests / Unit tests / Rust build |
| `queue.moveFirst` | Ticket, button name and help | Move {branch} to the front of the line. It starts when the next slot is free. |
| `queue.moved` / `common.undo` | Toast | {branch} is now first in line. / Undo |
| `queue.more` / `.empty` | After the fifth ticket / machine room | {count} more waiting / No check is waiting. |
| `queue.unused` | Machine room, when no script has ever asked | No script in {repo} asks for a slot, so every check starts at once. |
| `queue.released` | Bay, for 5 s | The check in {branch} ended without finishing. Its slot is free. |
| `queue.limit` / `.limitNote` | Machine room popover | Checks at once: {limit} / At most {limit} checks run at once, and another starts only while load is under {threshold}. One check always runs. |
| `queue.printed.ceiling` | Printed by a script | Waited 10 minutes for a slot in Atlas Work status; running now without one. |
| `queue.printed.atlasStopped` | Printed by a script | Atlas stopped while this check waited for a slot; running now. |
| `meaning.changes` | Wall sign, second line; mini room | Changes {capability}{others, plural, =0 {} other { and # more}} |
| `meaning.shared` | Status line; panel | {branch} also changes {capability} |
| `meaning.unmapped` | Panel, group heading | {count, plural, one {# file no concept names} other {# files no concept names}} |
| `meaning.noFolder` / `.choose` | Panel, Changes tab | The open folder does not describe {repo}, so Atlas cannot say which capabilities these files belong to. Choose the folder that holds its ontology to see them. / Choose folder |
| `panel.tabs.changes` / `.activity` / `.commits` / `panel.close` | Panel | Changes / Activity / Commits / Close |
| `panel.reading` / `.noChanges` | Panel, Changes tab | Reading {branch} / No file differs from {base} yet. |
| `panel.group` | Panel, group heading | {capability} · {count, plural, one {# file} other {# files}} · +{added} −{removed} |
| `panel.documents` | Panel, heading | Documents this branch edits |
| `panel.activity.files` / `.commit` / `.command` | Panel, Activity tab | {count, plural, one {# file changed} other {# files changed}} / Committed: {subject} / A command ran for {duration} |
| `panel.activity.slotWait` / `.slotHeld` | Panel, Activity tab | Waited {duration} for a slot / {kind} ran for {duration} |
| `panel.activity.since` | Panel, Activity tab foot | Since Atlas opened at {time}. Earlier activity was not recorded. |
| `panel.commits.more` | Panel, Commits tab foot | {count, plural, one {# more commit} other {# more commits}} |
| `panel.gone` | Panel | The folder of {branch} is no longer a worktree of {repo}, so there is nothing to show. |
| `panel.copyPath` / `.copied` | Panel button / toast | Copy folder path / Copied {path} |
| `open.editor` / `.terminal` / `.change` | Panel buttons | Open in editor / Open in terminal / Change application |
| `open.choose` | Chooser title | Choose the application that opens worktree folders. You can change it here later. |
| `open.editorHelp` / `.terminalHelp` | Button help | Opens {folder} in {app}. / Opens a new {app} window in {folder}. Atlas types nothing into it. |
| `open.refused` | Toast | {folder} was not opened: {reason} Nothing was started. |
| `open.reason.gone` / `.notFolder` / `.appMissing` | Inside `open.refused` | It is no longer a worktree of {repo}. / It is not a folder. / {app} is no longer installed; press Change application. |
| `open.none` | In place of the buttons | No editor or terminal Atlas can open was found on this Mac. Copy the folder path to open it yourself. |
| `room.ended.label` / `room.missing.label` / `room.twoTools` | Monitor / last line | The session ended / The folder cannot be found / Their changes can mix. |
| `git.uncommitted` | Monitor, last line | {count, plural, one {# file changed, not committed} other {# files changed, not committed}} |
| `git.unpushed` / `.pushed` | Monitor, last line | {count, plural, one {# commit not pushed} other {# commits not pushed}} / Pushed |
| `git.operation` / `.detached` | Monitor, last line | {operation} in progress · {count, plural, =0 {no conflicts} one {# conflict} other {# conflicts}} / No branch: detached at {commit} |
| `conveyor.noRemote` / `.notConnected` | Where a conveyor turns dashed | No remote / {host} not connected |
| `room.prePush.label` | Monitor | pre-push checks |
| `eta.range` / `.about` / `.under` | Monitor, large line | {low}–{high} min left / About {time} left / Under {upper} left |
| `eta.usual` / `.slow` / `.slowDetail` | Monitor, last line / screen / last line | {elapsed} so far · usually {usual} / Slower than usual / {elapsed} so far · usually done in {usual} |
| `eta.unknown` / `.unknownDetail` | Monitor / last line | No estimate yet / {elapsed} so far. Atlas estimates once 3 runs have passed on this Mac. |
| `eta.pill.push` / `.ci` / `.main` / `.slow` | Pill over the parcel | push in {time} / CI done in {time} / main in {time} / Running late |
| `room.ci.label` / `.jobs` / `.queued` | Monitor / last line / mini room | CI running · PR #{number} / {done} of {total} jobs done / CI queued for {elapsed} · PR #{number} |
| `room.ciFailed.big` / `.pill` / `room.merged.detail` | Monitor / pill / last line | {count, plural, one {# job failed} other {# jobs failed}} / CI failed / {count} CI jobs passed · took {duration} |
| `room.asking.label` / `.big` / `.detail` | Monitor | {session} asks / Waiting for your approval / {elapsed} so far. Answer in that session. |
| `room.asking.answer` / `.answerDetail` | Monitor | Waiting for your answer / {elapsed} so far. Answer in that session. |
| `room.failed.big` / `.detail` | Monitor | The session failed / It ended with an error. Its own terminal shows why. |
| `sessions.status` | Agent state popover | Atlas reads {tool}'s own session list to show which sessions wait for you. It runs {command} at most every 10 seconds while Work status is open and changes nothing. |
| `sessions.switch` / `.off` | Agent state popover | Read {tool}'s session list / Atlas is not reading {tool}'s session list, so rooms show only when each folder last changed. |
| `sessions.missing` | Agent state popover | {count, plural, one {# running {tool} session is} other {# running {tool} sessions are}} not in the list Atlas read. If they use another settings folder, add it. |
| `sessions.unreadable` | Agent state popover | Atlas could not read {tool}'s session list: {reason} Rooms show when each folder last changed. Atlas reads again at the next change. |
| `sessions.reason.notFound` / `.timeout` / `.format` | Inside `sessions.unreadable` | {tool} was not found in the folders Atlas looks in. / {tool} did not answer within 5 seconds. / The list was in a form Atlas does not know; a newer {tool} may have changed it. |
| `room.thinking.label` / `.big` / `room.replied` | Monitor / mini room | Between commands / Thinking / Finished replying {ago} |
| `agentState.offer` / `.offerCodex` | Notice under the header, until added or dismissed | Rooms already show when a {tool} session waits for you. With Atlas's hook entries, {tool} also reports each step within a second: thinking, running a command, finished replying. / Atlas has no session list to read for {tool}, so its rooms show only when each folder last changed. With Atlas's hook entries, {tool} reports when it is thinking, waiting for your approval, or has finished replying. |
| `agentState.add` / `.addCodex` / `.another` / `.notNow` | Buttons | Add to Claude Code / Add to Codex / Add another settings folder / Not now |
| `agentState.confirmTitle` / `.confirmAdd` | Dialog / its button | Add Atlas's hook entries to {count, plural, one {# settings file} other {# settings files}}? / Add the entries |
| `agentState.confirmBody` | Dialog, above the entries | Atlas adds only the entries below to each file listed and changes nothing else in it. Each file's hooks are saved as a version first, so they can be restored. On each event {tool} runs Atlas's program without waiting for it. The program keeps the event's name, the session's id, its working folder and the time in Atlas's own data folder, and discards the rest: commands, file contents and the conversation. Nothing leaves this Mac. |
| `agentState.added` / `.status` | Toast / Agent state popover | Added Atlas's entries to {count, plural, one {# settings file} other {# settings files}}. A session started from now on reports its state. / {reporting} of {live} {tool} sessions report their state. |
| `agentState.silent` | Agent state popover | {count, plural, one {# running {tool} session has} other {# running {tool} sessions have}} sent no event. A session reports only once its folder is trusted in {tool}, only if it reads a settings file listed here, and only if your organisation's settings allow your own hooks. |
| `agentState.remove` / `.removed` | Button / toast | Remove Atlas's entries / Removed Atlas's entries from {count, plural, one {# settings file} other {# settings files}}. {tool} no longer runs Atlas's program. |
| `agentState.managed` | In place of the button | Your organisation's {tool} settings allow only its own hooks, so Atlas cannot add its entries. Rooms still show what Atlas reads without them. |
| `agentState.invalid` / `.changed` | Toast | {file} is not valid JSON, so Atlas changed nothing. Fix the file, then press Add again. / {file} changed after the entries were shown, so Atlas wrote nothing. Check the entries again. |
| `agentState.linked` / `.unwritable` | Toast | {file} is a link to another file, so Atlas changed nothing. Press Add another settings folder and choose the file it points to. / {file} could not be written, so nothing changed: {reason} |
| `agentState.codexTrust` | Toast and popover | Added {count} entries to {file}. Codex runs them only after you trust them: type /hooks in Codex. Atlas cannot do that for you. |
| `agentState.pick` / `.pickRefused` | File picker title / toast | Choose the settings.json in the folder that session uses / {file} is not an agent settings file Atlas can add to, so nothing changed: {reason} |
| `agentState.removedKept` | Toast, when the file holds hooks Atlas did not add | Removed Atlas's entries from {file}. Your own hooks in it were left as they are. |
| `agentState.windows` | In place of the offer, on Windows | On Windows, Atlas cannot yet tell which session an event comes from, so it adds no hook entries. Rooms show which session locked each worktree. |
| `hook.stoppedLanes` | Monitor, last line | Stopped at {lanes}. Nothing was pushed. |
| `status.readyDetail` | Monitor, last line | {count} CI jobs passed. Merge PR #{number} on {host}. |
| `eta.frozen` | Monitor, last line, while reading from the host is slowed, paused or offline | Read at {readAt}. The time left is not counting down because Atlas is not reading from {host} now. |
| `eta.noOrder` | Monitor, last line | {file} could not be read, so jobs are counted as running together. |
| `fetch.stale` / `.now` | Beside the shelf, from slice 10 | origin/{branch} was fetched {ago}. Merges made on {host} since then are not shown. / Fetch now |
| `fetch.auto` / `.autoNote` | Toggle / under it | Fetch from origin every 3 minutes while Work status is open / git fetch asks {host} with your Git sign-in and updates origin's branches in this repository. Your branches and files are not changed. |
| `term.worktree` | Help | Worktree: a separate copy of the project folder, so each agent changes files without touching the others. |
| `term.subagent` | Help | Subagent: a task an agent session starts, often in its own worktree. |
| `term.hook` | Help | Hook: a check Git runs on this Mac before a commit or a push. If it stops, nothing is committed or pushed. |
| `term.pr` | Help | PR (pull request): a request to merge a branch into main, where CI and people check it. |
| `term.ci` | Help | CI: checks the host runs on a PR, such as tests and lint. Many repositories require them to pass before a merge. |
| `term.merge` / `.load` | Help | Merge: the branch's changes become part of main. / Load: how many tasks are ready to use a CPU core at once. Above the core count, tasks wait. |

A GitLab provider swaps `PR` for `merge request` and `CI` for `pipeline` through per-host keys.

## Edge cases

None — in the Work status spec.

## Out of scope

None — in the Work status spec.

## Acceptance criteria

None — in `docs/specs/2026-11-22-work-status-criteria.md`: criteria 19 to 21, 35, 37, 39 and 42 check this file.

## Risks

None — in the Work status spec.

## Later

None — in the Work status spec.

## Owner question

None — the owner's answers are in the Work status spec.

## Revisions

- 2026-11-22: split from `docs/specs/2026-11-21-work-status-destination.md` for length, content
  unchanged: States, Design direction with Cases and Motion, and Copy.
- 2026-11-22: A room follows direction A, "a screen on a console": the wall sign, lamp, name tag
  and wall monitor become one screen on a console with the newest three commits and a bezel; the
  belt becomes a track through a hatch in the side wall; mini rooms show the newest subject; the
  "more below" line moves into the floors' heading. Rooms are no longer drawn mirrored.
- 2026-11-23: At the owner's 1512 px window Moru takes a half step (1.5) instead of 1; spare height
  becomes up to five commit rows; quiet screens are no longer dimmed (every word at least 4.5:1); a
  room that needs a person is framed in amber; the building ends under its content.
- 2026-11-23: The screen keeps its text and 400 px; Moru's scale gives way and a room is as tall
  as what it holds. Two tools stand apart at their own scale, and held mini rooms show their Moru.
