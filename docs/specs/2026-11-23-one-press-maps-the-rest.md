---
title: One press maps the rest of the code
doc_type: spec
status: draft
area: desktop
date: 2026-11-23
decisions: [a24bde01]
---

# One press maps the rest of the code

The lead wrote this on 2026-11-23 from a planner's reading of the code the same day. It replaces
the one-request step of `2026-11-23-map-grows-area-by-area.md` (decision 6) as what the person
presses; that spec still owns the measure and the request.

## Person and moment

A person has built a first map of a large repository. Nodes point at the code of about a fifth of
the abilities found in it. The owner tried the step that maps one more part per press and said
that pressing each time is poor usability; the measured repositories needed three presses to pass
half and thirty or more to finish. The person wants to press once, do something else, and see how
far it has come.

## Decisions

1. **One press starts a run.** It sends the request of the area spec, waits for that turn to
   end, reads the project note from disk, and sends the next request, until no ability is left
   off the map or a stop rule fires. Nothing starts a run but a press; nothing scheduled may.
2. **The run lives in the map conversation's panel.** A driver hook in the agent panel widget
   (`useMappingRun`) holds the loop, because only the panel holds send, stop, status and the
   pending permission. Its pure rules and what is shown live in the work-run feature, whose
   store already carries the work card and the rail ring.
3. **Each request runs in a new conversation.** The server's measure is written for a process
   that served no reads, the measured requests ran that way, and a growing context is the main
   cost of a long run. One long turn told to repeat was rejected: two builds asked for fifty
   calls stopped themselves at a quarter (`2026-11-20-first-map-at-scale-and-by-hand.md`).
4. **Progress is the project's summary line**, read from the file at each turn's end:
   T abilities counted, R not on the map. The manifest follows by the watcher and is not read
   for the decision, since it lands after the turn ends. The line gone, or reading R = 0, is
   "finished" only when the last R read was at most 31 (the most one measured request mapped);
   a line gone with more left, or a note that cannot be read, stops as `lineLost`.
5. **Stop rules.** A request that does not lower R; more requests than twice the estimate plus
   two; no update from the agent for ten minutes outside a permission wait; an agent error; a
   usage limit; the folder switched; the person's Stop; the person's own message (text in the
   composer at a request boundary, or a turn they send); the line lost; a request cancelled
   that nobody stopped. Every stop says why and offers Continue, which is a new run from the
   folder's state; a run with no line sends its request without the count sentence.
6. **A waiting permission card is never answered by the app.** The run waits on it with no
   clock. With the folder's kept Auto-approve on, adding and changing pass as they do for any
   turn (`15443720`); a delete, merge, overwrite, commit or finalize still waits. The row reads
   the kept choice itself, not the on-screen conversation's mode, since every request opens a
   new conversation, and says which holds before the press.
7. **One control.** A row above the composer of the map conversation shows whenever the folder
   has abilities off the map or a run exists: it starts, shows the running state, stops and
   continues. The one-request suggestion row is removed. Leaving the map or closing the dock
   keeps the run; the work card and the map tile's ring carry it on every other screen.
8. **Any Stop ends the whole run**: the row, the composer's Stop, the card, the Runs list.
9. **The estimate is requests and minutes, never money**: `ceil(R / 18)` requests at four
   minutes each before the first request (measured on two eighteen-file chains: 17.8 and 18.3
   abilities gained per request, 181 to 242 seconds each), then the run's own rate. One press sends at
   most `min(2 × estimate + 2, 100)` requests.
10. **Motion.** The count moves once per request, the activity line at most once a second, and
    nothing ticks per second while a request reads: the installed app pays about 0.7 percent
    CPU per update per second.
11. **Nothing is persisted.** After a quit the folder's line is the resume point; the row
    offers to continue from it.

## States and copy

`{mapped}` is T minus R. The English below is the source; the other three catalogues carry the
same keys in the app's voice. Keys live under `workCard.mapping`; reused keys are named.

| State | English | Control |
|---|---|---|
| Not started | **Map the rest of the code** · {mapped} of the {total} abilities found in the code are on the map ({percent}%). About {requests} requests to your agent, about {duration}. | the row |
| Not started, Auto-approve off | Each change waits for your answer. With Auto-approve on, it runs by itself. | — |
| Running | **Mapping the rest of the code** · Request {part} · {mapped} of {total} abilities on the map ({percent}%) · about {duration} left | `workCard.stop` |
| Waiting for an answer | **Waiting for your answer** · {agent} asked before changing something. Mapping goes on when you answer. | `library.check.review`, `workCard.hide` |
| Stopping | `workCard.turn.stoppingTitle`, `workCard.turn.stoppingBody` | — |
| Stopped by the person | **Stopped at {percent}%** · What is already on the map stays. Continue picks up from here. | **Continue** |
| Stopped for a message | Stopped so you can ask. Continue picks up from here. | Continue |
| Stopped: no progress | **Stopped: the last request put nothing new on the map** · It stays at {mapped} of {total}. The conversation shows what the agent did. | Continue, `library.check.openConversation` |
| Stopped: past the estimate | **Stopped: this is taking more requests than estimated** · {sent} requests sent, {mapped} of {total} on the map. | Continue |
| Stopped: agent error | `workCard.turn.endedTitle` · {mapped} of {total} are on the map. What was already written stays. | Continue, open the conversation |
| Stopped: usage limit | `acpChat.trouble.limit.title` · {mapped} of {total} are on the map. Continue when the limit resets, or pick another agent and continue. | Continue |
| Finished | **Every ability found in the code is on the map** · {total} abilities, {sent} requests, {duration}. | `workCard.close` |
| Folder switched | `workCard.turn.switchedTitle` · {agent} was mapping {folder}. {mapped} of {total} are on the map there. | `workCard.close` |
| Stopped: line lost | **Stopped: the project note no longer says what is left** · It last said {mapped} of {total}. Continue reads the code again. | Continue |
| Stopped: cancelled | **Stopped: the request was cancelled before it finished** · Continue picks up from here. | Continue |
| Not started, Auto-approve on | Adding and changing go through by themselves. Deleting, merging and overwriting wait for your answer. | — |
| Collapsed | the title, "{percent}% mapped", "Asks first" or "Adds and edits alone", Start; pressing the title restores the row | Start |
| Each finished request in the transcript | Request {part} · {gained} abilities put on the map · {duration} | opens that conversation |
| A run in History | Map the rest of the code · {count} requests | opens the list of its requests |

`acpChat.folderBusy` no longer names the Library: "Another conversation is working in this
folder".

## Out of scope

- A new conversation on the same agent process instead of a restart.
- Answering a permission request from the Runs list.
- A Git checkpoint before a run, a system notification.
- Showing a run's request in a conversation reopened from History: reopening replays no
  rows the person sent.

## Acceptance

- Each stop reason and "finished" follow from scripted request ends (unit tests of the pure
  rule).
- With a planted agent in the browser: one press sends request after request; Stop ends within
  five seconds; a waiting card is never answered by the app; a typed draft stops the run; the
  run survives leaving the map, closing the dock, and opening the Library for the same folder.
- The card overlaps no control at 1040×720, 1512×900 and 1920×1080 and redraws at most once a
  second.
- A headless chain on two repositories nobody in the session has read, with each agent the app
  offers: the line equals the server's count after every request, no concept is deleted, no
  earlier cited rule is lost, and the estimate at the press is within half of the requests used.
- In the installed app, by hand, with the agent this machine is signed in to: one press, the
  second request starting by itself, the card and ring on another screen, a permission card
  waited on and answered, Stop then Continue, quit mid-request then reopen.

## Risks

1. **Runaway cost.** Probe: the chain's ledger of abilities gained and cost per request; a
   request gaining none must end it.
2. **A request damages earlier concepts.** Probe: the chain commits the vault after each
   request and reports concepts deleted, capabilities that lost a cited rule, duplicate titles
   and `validate_vault` errors.
3. **A second agent behaves differently.** The measured runs used one agent with writes
   approved ahead; this machine's app uses another, which that day declined to write wiki
   pages it was allowed to write. Probe: the chain and the installed-app walk run with it.
4. **A usage limit arrives as an ordinary answer** and reads as "no progress". Probe: read the
   first real limit; reword if it misleads.

## Revisions

- 2026-11-23: first version.
- 2026-11-24: after an independent review and two chains with a real agent. A missing line
  ends a run as finished only when the last count was within one request's reach; otherwise
  it stops as `lineLost`. A ceiling of 100 requests per press; counts that are not safe
  integers read as no line on both the app and the server. Every driver phase has an exit on
  Stop, on the session going idle and on unmount. The rail ring and folder switches use the
  folder's root path. The transcript keeps one line per finished request with the full
  request on demand, and History shows a run as one row. The estimate moved from 24 to 13
  abilities and from two to three minutes per request: the Go chain mapped all 50 left in four
  requests, the Java chain 158 of 361 in twelve, no concept deleted; one split lost a cited
  rule, so the request now tells the agent to carry rules to the concept that holds the code.
- 2026-11-24: after a second review, the row reads the folder's kept Auto-approve and states
  what it passes (adding and changing); an unreadable note stops as `lineLost`; Continue after
  it adopts the line it reads; a cancel nobody pressed has its own reason.
- 2026-11-24: one request now names at most eighteen files across seven areas and asks for at
  most eighteen capabilities, and the estimate moved from 13 to 18 abilities and from three to
  four minutes per request. Two arms on the same Java map (Apache Fineract, Claude Opus, four
  requests each, from 203 of 376 abilities off the map): twelve files mapped 48 abilities, 12
  per request, in 691 s for $6.62 ($0.138 per ability), all 27 new capabilities citing read
  lines; eighteen files mapped 71 ($8.11, 35 of 38 new capabilities cited) and 73 (18 per
  request, 861 s, $7.89, $0.108 per ability, all 42 cited), 181 to 242 s per request. An
  earlier 24-file arm cited 62 percent, below the 80 percent bar. No eighteen-file request
  mapped more than 20, so 31 stays the most one request was measured to finish.
- 2026-11-25: decision 3 (a new conversation per request) held against the host's prompt cache.
  Two arms from the same Java map (203 of 376 abilities off the map, Claude Opus, four requests
  each): a new conversation per request mapped 67 for $6.03 ($0.090 per ability); every request
  resumed in one conversation mapped 72 for $6.54 ($0.091). The resumed arm read up to 325,000
  earlier tokens from cache at each request's start, but each request reads code no earlier one
  read, so new writes fell only from 125,000 to 90,000 tokens while cached re-reads grew. Nothing
  was deleted and no cited rule was lost in either arm. Falsifier: a request whose areas share
  most of their files with the previous request's.
