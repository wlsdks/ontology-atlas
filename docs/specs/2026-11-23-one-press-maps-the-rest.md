---
title: One press maps the rest of the code
doc_type: spec
status: draft
area: desktop
date: 2026-11-23
decisions: []
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
   for the decision, since it lands after the turn ends. The line gone after having been there
   is "finished".
5. **Stop rules.** A request that does not lower R; more requests than twice the estimate plus
   two; no update from the agent for ten minutes outside a permission wait; an agent error; a
   usage limit; the folder switched; the person's Stop; the person's own message (text in the
   composer at a request boundary, or a turn they send). Every stop says why and offers
   Continue, which is a new run from the folder's state.
6. **A waiting permission card is never answered by the app.** The run waits on it with no
   clock. With the folder's Auto-approve on, the request's additive writes pass as they do for
   any turn; the control says which holds before the press.
7. **One control.** A row above the composer of the map conversation shows whenever the folder
   has abilities off the map or a run exists: it starts, shows the running state, stops and
   continues. The one-request suggestion row is removed. Leaving the map or closing the dock
   keeps the run; the work card and the map tile's ring carry it on every other screen.
8. **Any Stop ends the whole run**: the row, the composer's Stop, the card, the Runs list.
9. **The estimate is requests and minutes, never money**: `ceil(R / 24)` requests at two
   minutes each before the first request (measured: 31, 18 and 24 abilities gained per
   request, 97 to 129 seconds each), then the run's own rate.
10. **Motion.** The count moves once per request, the activity line at most once a second, and
    nothing ticks per second while a request reads: the installed app pays about 0.7 percent
    CPU per update per second.
11. **Nothing is persisted.** After a quit the folder's line is the resume point; the row
    offers to continue from it.

## States and copy

`{mapped}` is T minus R. Korean uses the app's polite voice. Japanese and Chinese carry the same
keys. Keys live under `workCard.mapping`; reused keys are named.

| State | English | Korean | Control |
|---|---|---|---|
| Not started | **Map the rest of the code** · {mapped} of the {total} abilities found in the code are on the map ({percent}%). About {requests} requests to your agent, about {duration}. | **코드의 나머지를 지도에 올리기** · 코드에서 찾은 기능 {total}개 중 {mapped}개({percent}%)가 지도에 있어요. 에이전트 요청 약 {requests}번, {duration} 정도 걸려요. | the row |
| Not started, Auto-approve off | Each change waits for your answer. With Auto-approve on, it runs by itself. | 바꿀 때마다 답을 기다려요. 자동 승인을 켜면 혼자 진행해요. | — |
| Running | **Mapping the rest of the code** · Request {part} · {mapped} of {total} abilities on the map ({percent}%) · about {duration} left | **코드의 나머지를 지도에 올리는 중** · 요청 {part}번째 · 기능 {total}개 중 {mapped}개({percent}%) · 약 {duration} 남음 | `workCard.stop` |
| Waiting for an answer | **Waiting for your answer** · {agent} asked before changing something. Mapping goes on when you answer. | **답을 기다리는 중** · {agent}가 바꾸기 전에 물었어요. 답하면 이어서 진행해요. | `library.check.review`, `workCard.hide` |
| Stopping | `workCard.turn.stoppingTitle`, `workCard.turn.stoppingBody` | same keys | — |
| Stopped by the person | **Stopped at {percent}%** · What is already on the map stays. Continue picks up from here. | **{percent}%에서 멈췄어요** · 지도에 올라간 것은 그대로 남아요. 이어서 하면 여기서부터 진행해요. | **Continue** / **이어서 하기** |
| Stopped for a message | Stopped so you can ask. Continue picks up from here. | 물어볼 수 있게 멈췄어요. 이어서 하면 여기서부터 진행해요. | Continue |
| Stopped: no progress | **Stopped: the last request put nothing new on the map** · It stays at {mapped} of {total}. The conversation shows what the agent did. | **멈췄어요: 마지막 요청에서 새로 올라간 것이 없어요** · {total}개 중 {mapped}개 그대로예요. 에이전트가 한 일은 대화에 있어요. | Continue, `library.check.openConversation` |
| Stopped: past the estimate | **Stopped: this is taking more requests than estimated** · {sent} requests sent, {mapped} of {total} on the map. | **멈췄어요: 예상보다 요청이 많이 들고 있어요** · 요청 {sent}번을 보냈고 {total}개 중 {mapped}개가 지도에 있어요. | Continue |
| Stopped: agent error | `workCard.turn.endedTitle` · {mapped} of {total} are on the map. What was already written stays. | same title key · {total}개 중 {mapped}개가 지도에 있어요. 이미 쓴 것은 그대로 남아요. | Continue, open the conversation |
| Stopped: usage limit | `acpChat.trouble.limit.title` · {mapped} of {total} are on the map. Continue when the limit resets, or pick another agent and continue. | same title key · {total}개 중 {mapped}개가 지도에 있어요. 한도가 풀리면 이어서 하거나, 다른 에이전트를 골라 이어서 하세요. | Continue |
| Finished | **Every ability found in the code is on the map** · {total} abilities, {sent} requests, {duration}. | **코드에서 찾은 기능이 모두 지도에 올라갔어요** · 기능 {total}개, 요청 {sent}번, {duration} 걸렸어요. | `workCard.close` |
| Folder switched | `workCard.turn.switchedTitle` · {agent} was mapping {folder}. {mapped} of {total} are on the map there. | same title key · {agent}가 {folder} 폴더를 지도에 올리고 있었어요. 그 폴더는 {total}개 중 {mapped}개가 지도에 있어요. | `workCard.close` |

`acpChat.folderBusy` no longer names the Library: "Another conversation is working in this
folder" / "다른 대화가 이 폴더에서 작업 중이에요".

## Out of scope

- A new conversation on the same agent process instead of a restart.
- Answering a permission request from the Runs list.
- A Git checkpoint before a run, grouping a run's conversations in History, a system
  notification.

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
