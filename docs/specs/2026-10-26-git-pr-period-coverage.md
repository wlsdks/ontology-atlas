---
title: Explain a collected period across bounded source requests
doc_type: spec
status: current
area: git
date: 2026-10-26
decisions: [6b3b0cb5-a44f-4f5e-a240-6894c5a5ff2a]
---

# Explain a collected period across bounded source requests

## Person and moment

The owner delegates frequent commits to agents and wants daily, weekly, monthly, yearly and custom catch-up without first maintaining an ontology.
In the installed app's 2026-10-19–25 run, they could see 28 commits and 39 PR descriptions, but the explanation used only four of each.
The preview named 59 excluded records; two resulting themes could not account for the selected week.
Evidence: `/tmp/atlas-git-pr-build/80-author-status-preview.ax.txt` and `/tmp/atlas-git-pr-build/83-author-status-final.png`.
The lost ability is to understand the period's work without reconstructing dozens of originals or repeatedly shrinking its dates.

## Today

Before this slice, the installed app used one fitting packet and replaced its result on regeneration. The baseline captures above preserve that behavior and its 59-record omission.
The implementation now partitions complete records in `model/period-run.ts`, checkpoints sequential work in `model/period-execution.ts` and holds run identity/session recovery in `model/use-period-narrative.ts`, all under `src/views/change-briefing/`.
`ui/PeriodPlanDialog.tsx` discloses the workload; `ui/PeriodRunStatus.tsx` separates processing, citations and selected overview evidence. Runtime acceptance remains subject to the criteria below.
`src-tauri/src/llm/chat/source.rs` retains loopback-only text requests, individual cancellation, app-owned receipts and before/after source checks, with expected capacity checked before and after each request. Its current request ceiling remains 24 KiB and timeout 240 seconds.
`model/author-evidence.ts` and `ui/BriefingNarrative.tsx` preserve recognized author checks/limits as original quotations. These records do not independently verify current behavior.
Standing decision [b1a09b49](../records/decisions/2026-10-25-git-pr-source-first-briefing-b1a09b49-2a38-4d3a-b913-c59186a58761.md) permits source-first explanation and rejects misleading coverage; the baseline observes its omission falsifier.
The fully read `capabilities/vault-git-history` excludes product-source history; this remains the separate Changes job. Complete historical collection, general explanation quality and owner comprehension remain unproved.

## Problem and alternatives

Rank: (1) account for the collected period, (2) make its main work understandable together, (3) extend collection beyond current limits.
The first two return the requested ability; more records collected would deepen the present omission problem.
The product direction calls for inspectable explanations and uncertainty, rather than reconstruction from file lists (`docs/PRODUCT-DIRECTION.md:24`).

| Option | Value and usability | Cost, feasibility and local-first fit | Decision |
|---|---|---|---|
| Keep one fitting packet; ask for narrower dates | Fast first answer; misses the chosen period and repeats manual work | Lowest cost; existing local path | Reject as the period workflow |
| Sequential packets with only separate results | Reads every fitting record; reader still assembles the period's story | Moderate state/queue work; existing local requests | Keep as recovery/navigation, not the sole result |
| Sequential packets, then an overview from original cited passages | Restores breadth and a short entry point with inspectable limits | Adds explicit progress, preservation and excerpt coverage; no new service | Choose |
| Put all originals into one larger context | Simple when it fits; does not handle arbitrary histories or guarantee useful output | Model/resource changes and existing 24-KiB ceiling | Optional model choice, not the solution |

Retain the source-first cards, calendar, evidence reader, author quotes and code comparison. Replace one-packet generation with a disclosed period run.
Existing users lose the assumption of one request per click; the preview states the workload before any repository text is sent.
First slice covers every readable collected record that individually fits, including the measured 67-record period, with no arbitrary packet-count cap.
Collection limits remain separately visible; this does not claim that a large year was fully collected or that every sent record was explained.
Route: observed/explain/substantial-investment; truth/transfer affected; agent-write/human-correction unchanged; review/record required.
Lenses: moment, evidence, boundaries, smallest-slice and spec. The linked decision retains the selected source-first shape and records the latency/selection falsifiers.

## Flow

1. When the person chooses a repository and period, Atlas retains the existing local dates, first-parent snapshot and optional PR read.
   Read sources remains useful before generation. PR unrequested, partial, unavailable and unlinked remain distinct; no extra network lookup is implied.
2. When they prepare an explanation, Atlas plans every collected complete record in existing history order into whole-record parts that fit the measured request limits.
   A record occurs in exactly one reading part; global source IDs, full commit SHA, PR identity/digest and original passage IDs never change between parts.
   Empty/incomplete and individually oversized records are named unsent gaps with originals reachable. Do not clip text, skip older fitting records, or silently cap the number of parts.
3. When the plan opens, Atlas shows collected and planned commit/PR counts, each part's bytes/records, total reading bytes, model/address,
   excluded records and reasons, and the exact expandable originals for every part. For multiple parts, disclose one additional overview request and its maximum bytes.
   One part reuses its result as the overview, without an extra request. No send occurs on preparing or changing scope. Runtime has no promised ETA.
4. When they choose `periodStart`, Atlas sends the disclosed reading parts sequentially, with at most one request active.
   Show current/total parts and completed count; each accepted part becomes readable immediately in a compact list. Do not append dozens of open cards.
   Part options lead with the first supported theme title, retaining ordinal/status and the empty-part fallback. One selected part shows the retained cards and originals; returning restores selected part, citation focus and scroll. Open originals precede the live explanation and offer the same return action at both their start and end. Completing an explanation must not move focus or scroll away from an open original reader.
5. When a part returns, Atlas validates its response against only that part's original passage IDs and the existing language/author-evidence rules.
   Accepted claims link source records; uncited records remain explicitly unexplained. Valid empty output completes a part as read-but-unexplained and allows the queue to continue.
   Invalid JSON/citations/language, output truncation, timeout, transport or receipt failure pauses the queue at that part. Show the specific existing error plus `periodPartFailed`.
   Rejected output is inspectable under the existing rejection notice; it never becomes an accepted result or evidence for the overview.
6. When they stop, Atlas cancels the active request and starts no later request. Completed validated parts, originals, inputs and plan survive in session memory.
   Ignore late responses. `periodContinue` retries the interrupted part and then continues; `periodRetryPart` retries only the failed part before continuing.
   There is no automatic retry, repair request, skip or resending of completed parts. Closing the app clears this session's results and progress.
7. When all planned reading parts finish, Atlas creates one overview request using exact original passages cited by accepted part claims, never generated claim text as evidence.
   Deduplicate by original passage identity. Select one supporting change passage per part first, choosing the shortest supporting passage and cycling oldest-to-newest;
   then add recognized unresolved-limit passages, reason passages, remaining change passages and check passages in the same fair part order, until the request fits.
   Whole passages only. A passage too large for the remaining space is left out with a reason; keep trying other candidates. Retain original titles, attribution and IDs.
   This selection rule is disclosed in `periodOverviewSelection`; list selected and unselected candidates, bytes, represented parts and record identities.
   Author-recorded limits omitted from the overview stay flagged in that list and reachable in their completed part; never silently classify them as resolved.
8. When the overview returns, Atlas validates against only the passages actually sent for that overview, even if other valid IDs exist in the full originals.
   Show at most the existing three compact themes, exact author checks/limits, selection coverage and overall run coverage above part navigation.
   An overview covers selected evidence, not every record's meaning. If candidates/parts were omitted, show `periodOverviewPartial` with a direct route to those parts.
   No supported candidate means `periodNoOverview` and no overview send. Overview failure or Stop preserves every part; retry/continue only the overview.
9. When the model is wrong or misses a reason, the person opens the original passage or part result without accepting meaning or writing files.
   Preserve the recorded 53/57-ms first-frame failures against 50 ms and their qualification; fixed failures and browser checks do not become open failures or desktop proof.
   Source versions are author observations, not current repository health. Structural acceptance is never semantic verification.
10. When repository identity, HEAD/snapshot, applied period/timezone, PR association/coverage/version, model/address/effective capacity or locale changes, Atlas stops the active run.
    Completed parts remain readable as the old run with their original settings; they cannot populate or resume the new run. Prepare and review a fresh plan.
    Revalidate source identity and capacity before every resumed/next send; a change pauses before sending or accepting a late answer.
    Draft custom dates do not change the applied period until Apply. Models navigation and return preserve the unchanged run in session memory.

Coverage is explicit at three levels: collection/PR lookup, reading-part work, and selected overview evidence.
`sent` counts unique records with a confirmed model response, not retry attempts; active or interrupted requests without a confirming response remain delivery-unknown, distinct from records never attempted; `linked` counts unique records cited by accepted part claims, not independent verified meanings.
Unsent records include pending/failed-before-send, incomplete and oversized; sent-but-unexplained includes records whose response was rejected or has no accepted citation.
Confirmed, delivery-unknown and unattempted counts reconcile to the collected set; a record described by both commit and PR remains two source records, not two proven changes.
All parts finished is a workload state. Any collection/PR gap, delivery-unknown or unsent/unexplained record, unsupported author classification or overview omission keeps the explanation partial.
No new cloud/auth/API/tool path, ontology/source write, background schedule or acceptance authority is introduced. Each request keeps its local transfer receipt and existing timeout.

## States

Keys are in `gitBriefing` unless prefixed. Every web cell uses the truthful installed-app boundary; no fixture history is presented as native evidence.

| State | Web | macOS app |
|---|---|---|
| First run / no repository or model | `webTitle`, `webBody`; `navRail.getApp` | `sourcePrompt`, `chooseRepository` / `modelUnavailable`, `chooseModel`; choose and return |
| Local loading / empty / invalid dates | `webBody`; `navRail.getApp` | `loading` / `empty` / `changeBriefing.invalidRange`; stop or adjust/apply dates |
| Unreadable, moved or replaced repository | `webBody`; `navRail.getApp` | `sourceUnavailable`; choose again; dates kept |
| PR absent/unrequested/partial/offline | `webBody`; `navRail.getApp` | `prNotRequested`, `noPr`, `prPartial`, `prUnavailable`, `prUnlinked`; local-only plan or explicit PR retry |
| Preparing / capacity failure | `webBody`; `navRail.getApp` | `preparing` / `modelLimit`; stop, read originals or choose model and prepare again |
| Plan / single part | `webBody`; `navRail.getApp` | `periodPlanTitle`, `periodPlan`, `periodReadingBytes`, `periodOverviewPlan` or `periodSinglePart`, `periodSessionOnly`; inspect, start or close |
| Oversized / incomplete source | `webBody`; `navRail.getApp` | `periodUnsendable`, `periodOverlarge` / `periodIncomplete`; original, refresh or new preview |
| Queued / working / completed part | `webBody`; `navRail.getApp` | `periodPart`, `periodPartSummary`, `periodPartQueued`, `periodPartWorking`, `periodPartDone`, `periodProgress`; stop or select result |
| Read, no useful claim | `webBody`; `navRail.getApp` | `periodPartNoExplanation`, `periodUnexplained`; original; queue continues |
| Part failure / rejected response | `webBody`; `navRail.getApp` | Specific `analysisFailed`, `invalidAnalysis`, `languageMismatch`, `incompleteAnalysis` or `auditFailed` plus `periodPartFailed`; `periodRetryPart`, originals/rejected response |
| Stopping / stopped reading | `webBody`; `navRail.getApp` | `periodStopping` / `periodStopped`; `periodContinue`, completed parts |
| Overview running / failed / stopped | `webBody`; `navRail.getApp` | `periodSynthesizing` / `periodOverviewFailed` / `cancelled`; stop, `periodRetryOverview` or `periodParts` |
| No supported overview | `webBody`; `navRail.getApp` | `periodNoOverview`; original sources or another period |
| Finished / partial / selection gaps | `webBody`; `navRail.getApp` | `periodFinished`, `periodCoverage`, `periodGaps`, `periodPartial`, `periodOverviewCoverage`, `periodOverviewPartial`; `periodOverviewSelection`, `periodOverviewPolicy`, `periodParts` |
| Wrong claim / source reader | `webBody`; `navRail.getApp` | `claimsNote`, `sourceHeading`, `sourceVersion`, `prVersion`, `sourceUnavailableInline`; original/code then `back` restores part/overview focus |
| Stale run / changed settings | `webBody`; `navRail.getApp` | `periodStale`; old parts or `periodNewPlan`; no mixed settings |
| Largest measured period | `webBody`; `navRail.getApp` | `periodPlan`, `periodCoverage`; all 28 commits + 39 PRs accounted for across parts, not a newest-record sample |

## Copy

Exact strings are added to `messages/en/gitBriefing.json` and `messages/ko/gitBriefing.json`.
The table lists English; Korean is catalogue data. Existing source/transfer/error/calendar strings remain in use as named above.
`periodOverviewSelection` contains `periodOverviewPolicy` and the actual selected/excluded passage list; no model-generated policy explanation.

| Key | Where it appears | English |
|---|---|---|
| `periodPlanTitle` | Plan preview | Explain this period |
| `periodPlan` | Plan preview | Send {commits} commit messages and {prs} PR descriptions in {parts} reading requests, one at a time. |
| `periodReadingBytes` | Plan preview | Reading requests send {bytes} bytes in total. |
| `periodOverviewPlan` | Plan preview | One final request will use up to {bytes} bytes of selected original passages to create the overview. |
| `periodSinglePart` | Plan preview | This period fits in one reading request. Its explanation will be the overview. |
| `periodSessionOnly` | Plan preview | Completed parts stay available during this app session. Closing the app clears this progress. |
| `periodUnsendable` | Plan preview | {count} source records cannot be sent. Read their reasons below; the other records remain in the plan. |
| `periodStart` | Plan preview | Create period explanation |
| `periodProgress` | Part list / progress | Reading part {current} of {parts} · {completed} completed |
| `periodPart` | Part list / progress | Part {number} of {parts} |
| `periodPartSummary` | Part list / progress | {commits} commits · {prs} PR descriptions · {bytes} bytes |
| `periodPartQueued` | Part list / progress | Waiting to be read |
| `periodPartWorking` | Part list / progress | Being read |
| `periodPartDone` | Part list / progress | Explanation ready |
| `periodPartNoExplanation` | Part list / progress | Read, but not explained |
| `periodStopping` | Stop / recovery | Stopping the current request. Completed parts remain available. |
| `periodStopped` | Stop / recovery | Stopped after {completed} of {parts} parts. Continue to read the remaining parts; completed explanations are kept. |
| `periodContinue` | Stop / recovery | Continue remaining parts |
| `periodPartFailed` | Stop / recovery | Part {number} failed. Completed parts, sources and dates are kept. Retry this part to continue. |
| `periodRetryPart` | Stop / recovery | Retry part {number} |
| `periodSynthesizing` | Overview / coverage | Creating the overview from selected original passages… |
| `periodOverviewFailed` | Stop / recovery | The overview failed. Completed part explanations remain available. Retry only the overview or read the parts. |
| `periodRetryOverview` | Stop / recovery | Retry overview |
| `periodParts` | Overview / coverage | Read part explanations |
| `periodOverviewCoverage` | Overview / coverage | Overview request sources: {selected} of {candidates} original passages · {represented} of {parts} parts included. |
| `periodOverviewPartial` | Overview / coverage | Some supported passages are outside this overview. Read the completed parts for the remaining work and author-recorded limits. |
| `periodCoverage` | Overview / coverage | {completed} of {parts} parts completed · {sent} of {collected} source records sent · {linked} cited in part explanations. |
| `periodGaps` | Overview / coverage | {unexplained} sent records remain unexplained · {unsent} records not sent · {uncertain} delivery unconfirmed. Sending a record does not mean it was fully explained. |
| `periodFinished` | Overview / coverage | All planned parts are finished. Check coverage and the original records for omissions. |
| `periodPartial` | Overview / coverage | This period explanation is partial. Some history, PR lookup, records or explanations are missing. Read the coverage details. |
| `periodOverviewSelection` | Overview / coverage | Review overview sources |
| `periodOverviewPolicy` | Overview source selection | The overview selects one change passage per part first, then recorded limits, reasons, other changes and checks. Passages that do not fit stay listed below. |
| `periodOverlarge` | Original record status | This complete record exceeds the current request limit. It was not sent; read the original source. |
| `periodIncomplete` | Original record status | The complete source text is unavailable. It was not sent; refresh the sources or read the available original. |
| `periodUnexplained` | Original record status | Sent, but not cited in a completed part explanation. Read its original source. |
| `periodStale` | Stop / recovery | The sources, period, model, model capacity or screen language changed. Completed parts stay under their original settings. Prepare a new plan before continuing. |
| `periodNewPlan` | Stop / recovery | Prepare new plan |
| `periodNoOverview` | Overview / coverage | The completed parts did not produce supported claims for an overview. Read the original sources or choose another period. |

| `periodDeliveryUnknown` | Original record status | Delivery is not yet confirmed. |
| `periodOverviewSelected` | Overview source list | Included in the overview request |
| `periodOverviewOmitted` | Overview source list | Outside the overview request limit |
| `periodPrevious` | Stale result heading | Explanation from the previous run |

| `periodPreviewPart` | Plan source picker | Choose reading request to inspect |
| `periodSelectionPart` | Overview source picker | Choose part for overview evidence |

| `auditFailed` | Transfer record failure | The transfer record could not be completed, so this result is not shown. This request may have been sent. Check disk space and recording-folder access before retrying. |

## Edge cases

- Zero records means no plan/send. One fitting record/part means no overview call. The measured maximum is 28 commits + 39 PRs; synthetic probes exceed one context, 200 commits per packet and collection limits.
- A complete record larger than the native/model limit is a named gap, even if it is the only record. Do not promise that another model or narrower dates makes that record fit.
- First run/no ontology, Hangul text/paths, Monday weeks, DST/leap years and inclusive custom dates retain existing semantics; locale changes create a new plan.
- Folder move/rename/replacement, unreadable permission, branch/HEAD change and PR digest change preserve old results as stale; working-file edits remain outside source history.
- Offline Git/local model works. PR errors or current collection bounds stay visible; local reads never fetch missing Git objects or infer inaccessible PR absence.
- Repeated Stop/Continue, failed overview, malformed or empty output and Models round trips keep completed results exactly once. New app sessions have no resume promise.

## Out of scope

- Raising/streaming Git or PR collection limits, private providers and new credentials: separate collection gaps from this first analysis fix.
- Fragmenting oversized records, model-selected extra reads and cloud/ACP execution: preserve complete records and the existing transfer boundary.
- Independent behavior/test verification, accepted ontology meaning, code/source writes and health/risk verdicts: author descriptions cannot establish them.
- Persistent run storage, background work, notifications and redesigning the calendar/map/tours: session recovery and the chosen source-first shape are sufficient here.

## Acceptance criteria

1. Given the actual installed-app 28-commit/39-PR snapshot and current local model, when preparing and completing a run, then every complete individually fitting record appears once in reading parts and no older fitting record is omitted. Record exact plan/request counts, elapsed time and final coverage; native preview/result captures and transfer receipts must show more than the prior 4+4 sample. All 67 must be planned unless a named measured record is individually unsendable.
2. Given zero/one/multiple parts, Hangul and oversized/incomplete records, when planning with measured limits, then `narrative.test.ts` partition fixtures prove whole original bytes, unchanged global IDs/passages, byte/record bounds, stable ordering and complete accounting with no arbitrary part-count cap. One part adds no overview request; individually oversized originals stay readable and unsent.
3. Given multiple parts with one deliberately failed/slow response, when stopping, retrying and continuing, then focused `git-pr-briefing.spec.ts` plus native cancellation/receipt probes prove at most one active request, no late acceptance, retained accepted results, no completed-part resend and retry of only the interrupted/failed stage. A pre-transfer receipt failure prevents that send; a post-transfer receipt failure pauses the run with delivery unconfirmed and no newly accepted result.
4. Given accepted part results across old/new work and #2925 adverse evidence, when making the overview, then final-input/validator fixtures and a live source audit prove exact selected original passages, rejection of unsubmitted IDs, explicit selection omissions and direct citations. A generated summary used as source, fixed failure shown as open, browser result called desktop proof or omitted measurements/target fails. The native walkthrough must make supported old/new work and the retained limit findable without opening individual commits; owner comprehension remains unclaimed without their response.
5. Given uncited/rejected records, collection/PR partial states, all-parts-finished and selected overview excerpts, when reading coverage, then partition/response tests and e2e assert reconciled unique-record counts, separate part/overview coverage and visible partial status. Merely sending every record, citing one passage, or finishing all requests must never assert every record was fully explained.
6. Given a changed root/HEAD/snapshot/applied dates/PR version/model/address/capacity/locale, when the next send or late response occurs, then identity tests and focused e2e prove cancellation/stale rejection, old-result attribution and a required fresh plan; unchanged Models navigation preserves progress. Offline/unavailable PRs retain local sources and their gaps, with no new auth or outbound destination.
7. Given every state row, when using keyboard and inspecting the routed full matrix, then changed-path e2e, design audit and actual installed-app external-display captures at 2560 and 1920 widths plus narrow/zoom checks prove bounded parts navigation, overview-to-original-to-back focus/scroll and readable progress/coverage. Web shows the installed-app boundary. The earlier screenshot is before-state evidence, not proof of this slice.
8. Given the completed implementation and locale integration, when the lead runs `pnpm checks:changed -- --run`, then every recommendation completes and the actual installed build matches current source. This spec/catalogue-only change establishes no runtime, cancellation, security or explanation-quality acceptance by itself.

## Risks

1. The final overview hides important older work or adverse evidence: fair original-passage selection, visible omitted-candidate/part counts and the cross-part #2925 native audit.
2. Many slow local calls make catch-up impractical: disclosed workload, sequential progress, immediate readable parts and Stop/Continue without losing completed work; record actual total runtime.
3. Mixed settings or refreshed sources misattribute a plausible result: immutable run identity, per-send revalidation, retained old attribution and no reuse across changed contexts.

## Later

1. Resumable Git/PR collection beyond existing bounds, when a real daily/monthly/yearly run stops at those bounds; preserve pinned identity and explicit incomplete collection.
2. Further source-grounded overview stages, when measured high-volume runs omit important candidate passages from the single overview; preserve original evidence and disclose total workload.
3. Disk-backed resume, when observed session loss outweighs local storage/privacy complexity; only after session recovery and utility pass.

## Owner question

None — the owner authorized period catch-up and the existing local model path. The plan makes repeated transfers concrete before the person starts; model/period choices are reversible.
