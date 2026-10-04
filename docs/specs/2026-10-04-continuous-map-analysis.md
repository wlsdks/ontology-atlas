---
title: Optional next analysis from the map with scoped evidence and review status
doc_type: spec
status: current
area: agents
date: 2026-10-04
decisions: [d4c00b25-124a-44fe-8159-91e36663ea3a, 6d8081e5-aa63-4599-93af-29a57f09f3c4]
---

# Continue analysis from the map

## Person and moment

The owner wants enrichment after initial construction: each use should reveal what analysis remains, without forcing work, and a simple action in a map popup should send the next bounded investigation to ACP. This follows the observed incomplete ACP/local construction and handoff results; it is not a request to claim a complete ontology or launch paid analysis whenever the map opens. The person is judging whether a useful next read exists and whether an improvement deserves acceptance. Route: observed/judge/public-contract with surface-inventory; transfer and human-correction affected. The isolated native control run observed source recovery, explicit inspection, one ACP analysis and a retained dated result; improvement/write/reuse acceptance remains pending.

## Baseline before this slice

- Reviewed meaning, inspected code, human acceptance and later-task reuse are separate stages; useful unknowns and correction are product value (`docs/PRODUCT-DIRECTION.md:30-41,43-57,59-75`).
- The current map-linked action exists only with a selected concept/set; this does not satisfy status on every map use. Its inspector closes when its vault or scope changes (`src/views/home/model/gray-area/use-topology-gray-area.tsx:39-70,82-92`). It has no project-wide completeness measure.
- Opening previews the bound folder; reading waits for Inspect. Source recovery must match the canonical connected folder and binding digest; actions recheck snapshot freshness (`src/features/gray-area/ui/GrayAreaInspector.tsx:48-69,86-114,159-168`).
- Findings are imports, source drift and recorded uncertainty, not verified semantic defects. Three cards and omitted counts are deliberate (`src/features/gray-area/model/candidates.ts:75-102`; `messages/en/grayArea.json:11,62-69`).
- The present action prepares an editable, unsent draft; its packet requests investigation, refuses effectful work in prose, and admits that this is not enforced read-only execution (`src/features/gray-area/model/investigation.ts:4-12`; `src/views/home/ui/HomePage.tsx:468-476`; `messages/en/grayArea.json:53-54`).
- ACP already has an explicit-button send-on-ready request with nonce and scope identity, alongside ordinary prefill (`src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx:393-412,551-561`). Guarded usable runtimes are checked before chat opens (`src/widgets/acp-chat-panel/model/use-vault-agent-runtime.ts:31-60`).
- ACP conversation history already exists (`src/widgets/acp-chat-panel/ui/AcpChatPanel.tsx:2799-2845`). Analysis capture carries evidence and parent-run context; task review separates unknown, unreviewed and accepted meaning (`src/features/acp-session/model/analysis-capture.ts:38-65,79-94`; `src/widgets/acp-chat-panel/model/use-task-meaning-review.ts:27-43`). History and agent plan completion alone do not establish semantic completeness.
- Current Home analysis capture has empty targetSlugs and null sourceFingerprint (`src/views/home/model/use-topology-analysis-review.tsx:55-70`); history initially filters project/profile and selects its latest run (`src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx:133-153`). Neither establishes that a saved answer belongs to the displayed question or selected evidence.
- Native local source construction is not available. The parked preflight patch and its three tests are not shipped source access or a finished local construction trial.

Preserve map-linked inspector/few-card decision **83ae5afc-2d54-49d8-b901-e5c8ffb14e1a** and source-recovery decision **90154cfa-a838-4a23-ad93-9a09af2d9e92**. Narrowly supersede only editable-unsent-only on an explicitly pressed Analyze next button after exact scope, runtime and transfer are visible. Keep Prepare editable draft for people who want to edit. Dissent: immediate send reduces a text-review opportunity; retain expandable exact request and the editable path. Falsifier: opening, stale scope, runtime change or double-click sends unintended evidence or duplicate work.

## Problem and alternatives

Rank: (1) make the next useful analysis and its uncertainty visible in the existing map context; (2) make the explicitly chosen analysis run and retained result easy to revisit; (3) allow reviewed improvement and later-task reuse; (4) compare model/worker strategies after the same loop can complete. Adding a completion percentage would hide unknown scope rather than restore judgment.

| Option | Value/usability | Feasibility/local-first | Cost/choice |
|---|---|---|---|
| Keep unsent draft only | Preserves editing and permissions | Existing | Requires the owner to rebuild the next step; retained alternative |
| Stable map-chrome status/entry plus existing inspector and Analyze next | Visible reason, exact scope and one deliberate send; existing conversation keeps results | Existing local evidence, guarded ACP, review/history | Selected smallest useful loop; no new primary surface |
| New global analysis popup/dashboard and completeness score | Prominent | Needs new navigation, denominator and acceptance model | Deferred; no truthful global denominator or owner-selected structural direction |
| Automatic analysis on every open | Appears fresh | Repeated paid calls/source transfer | Rejected; contradicts optionality and informed control |

Design change: interaction/layout/agent-handoff/journey, with one quiet stable map-chrome entry reusing the prior approved inspector/frame, not a new primary surface. The entry stays visible without a selected node; it is not hidden exclusively in a More menu or constellation. The inspector remains the primary shape already selected by the owner. A new dedicated primary popup would require design directions and owner selection; this slice does not introduce it. Existing folding, focus, source excerpts, copy, editable draft and permission review remain available.

## Flow

1. Whenever a person uses the map, one stable map-chrome analysis status/entry remains visible even with no node/set selected. A selected valid scope is labeled; otherwise exactly one unambiguous recorded project is visibly named as the scope, including its recorded members, not all code behavior. Multiple/ambiguous projects require Choose scope/project; an empty vault offers the existing first-construction door. The entry shows Not inspected, known scoped suggestions, prior result, or review waiting only from already loaded, correctly associated evidence. Nothing blocks map use. No source scan, ACP session start or paid model call happens merely to display it. Recorded gaps are explicitly unverified; absent source freshness remains unknown.
2. When the person opens the existing inspector, Atlas shows selected concept/set/project, bound source root, runtime/model if known, transfer notice, bounded inspection ceiling, previous result date and omitted/unsupported scope. A selected project includes its recorded members, not every code behavior. Unknown denominator gets no percentage. Source recovery and Inspect remain separate explicit steps.
3. When local inspection is current, Atlas shows up to three reasons to investigate and the evidence scope. Evidence coverage, requested task state, authored questions and human review are distinct rows. Source-hidden questions answered and human acceptance are reported only when actual evaluation/decision receipts exist; otherwise they are unknown. No candidates means no observed candidates in this bounded inspection; it never means complete, correct or safe. The person can choose one card; Analyze next targets only that displayed question, not a hidden full-project audit.
4. When the person presses Analyze next, Atlas rechecks bound source, bodies/graph, selection and ready runtime identity, then opens the existing ACP conversation and sends that exact visible request once. Source excerpts and ontology text go to the chosen coding agent/provider; it may charge. Runtime/model unknown is displayed honestly. Current busy/approval-waiting conversation gets no injected request. No delayed send after a scope/runtime change; the person must choose again.
5. When ACP investigates, Atlas shows actual tool activity and elapsed time; optional agent-reported plan tasks are labeled reported tasks, and changes to their total produce an explicit replanned notice. Stop and existing runtime timeout/cancellation remain available; the requested question and captured-packet inspection limits remain visible. Those native scan/excerpt ceilings bound the packet only: ordinary ACP may make additional source reads or incur further cost, with no new enforced source-byte, tool-round or spending cap. Actual observed activity is labeled recorded activity; unavailable cost or tool evidence remains unknown. The request asks for investigation without writes; this is requested behavior, not a new enforced read-only mode. Unexpected writes still pause at existing allow_once/reject_once checkpoints for the person to reject or review separately; the button grants no write approval. Unsupported permission guards cannot start the action. A runtime refusal, missing evidence or limit produces a visible partial/unknown outcome, not success.
6. When the answer arrives, extend existing capture/history with an explicit result association: vault/project identity, target UIDs and slugs, question digest/candidate identity, sent request/turn and saved run identity, runtime, snapshot source identity/fingerprint, binding digest, graph/body basis and witness hashes. Only an associated saved result can populate this question’s status; generic project/profile history and old records missing these fields stay inspectable but get Match unknown. Closing/reopening or A → B → A restores A’s associated dated result, never B’s; freshness remains unchecked until explicit current inspection compares the evidence basis. Stale results remain historical and cannot authorize writes. Failed save keeps the visible transcript but shows Save unavailable, never persisted-result credit. Result available does not mean Gap resolved.
7. When the person chooses to improve recorded meaning, Atlas prepares a separate editable improvement request from that result. Sending and each write retain existing permission and meaning-review checkpoints; Analyze next never approves writing. Waiting, rejected, deferred and accepted/applied states remain distinct. Unsupported review cannot become accepted merely because execution was allowed.
8. When the person returns after an accepted/applied change, a new explicit local inspection checks current evidence and exposes remaining questions. It may corroborate, contradict or leave the answer unknown. The previous run remains history and parent context, not a permanent completion credit. A later independent task tests whether the changed map helps without source access.

## States

| State | Web | macOS app |
|---|---|---|
| No selected/usable scope | Stable entry with `continuation.chooseScope` or `emptyVault`; existing map reading remains | Stable entry names `scopeLabel` for exactly one recorded project, else `chooseScope`; `emptyVault` opens existing first construction |
| Not inspected/recorded gaps | Existing native limit copy | `continuation.notInspected`; open inspector/Inspect; no model call |
| Unbound/source grant missing | Existing native limit copy | Existing connect/recovery copy; recover correct bound root, then Inspect |
| Current bounded findings/no candidates | Out of scope — no native scan | `continuation.scopeBoundary` plus existing findings/empty limits; choose a question |
| ACP unavailable/local selected | Out of scope — no guarded native session | `continuation.agentUnavailable`/`localUnavailable`; choose ready ACP or prepare terminal recovery |
| Ready | Out of scope — no model send | `continuation.transfer` and `analyze`; expand request, analyze, or prepare editable draft |
| Busy/approval waiting | Out of scope — no model send | `continuation.busy`; return to current conversation; no queue/duplicate request |
| Running/stopping | Out of scope — no model send | Existing ACP activity/elapsed/Stop; `continuation.reportedTasks` where plan exists |
| Partial/failed/cancelled | Out of scope — no model send | `continuation.partial` or existing failure/cancel notice; inspect result or retry explicitly |
| Result/review/match/save unknown | Stable entry with native limit; no native result | `continuation.result`/`review` or `matchUnknown`/`saveUnavailable`; open matching result or generic history; no unsupported status credit |
| Stale/scope/runtime changed | Out of scope — no native result | Existing stale copy plus `continuation.previousResult`; inspect again before a new analysis |

## Copy

New strings are owned by `messages/{en,ko,ja,zh}/grayArea.json` under
`continuation`; all four catalogs carry the same keys. Reuse existing recovery,
Inspect, stale, limits, Stop, permission and history strings. `entry` remains
visible; `chooseScopeAction`, `emptyVaultAction` and `localFolderAction` name
recovery. `questionCount` describes observed scoped questions;
`previousResultAction` labels historical analysis, while `previousResult` gives
its date and asks for reinspection. `result`, `partial`, `matchUnknown` and
`historyLimited` distinguish saved association and its limits. `analyze` and
`transfer` name the explicit ACP handoff; `packetLimits` distinguishes captured
bounds from later reads/cost. `prepareImprovement` and `improvementLead` name a
separate editable proposal, without the investigation-only lead. `reportedTasks`
and `replanned` describe agent-reported task counts, never semantic coverage.
`requestDetails` discloses the exact sent packet; `modelUnknown` names absent
model confirmation; `narrowScope` offers scope selection after a bounded refusal.
No invented percentage, quality badge or fake countdown.

## Edge cases

Sample without an open vault: the stable entry offers Open a folder and cannot label the visible sample empty. Empty vault: visible stable entry links existing explicit ACP first construction; scoped enrichment unavailable until concepts/source binding exist. No selection: visibly use exactly one unambiguous recorded project, otherwise request project/scope choice. The project label never implies all implementation was inspected. Mature vault: analyze one displayed question around a selected scope; no forced rebuild. Single concept and groups up to current selection cap work; oversized/ambiguous project/set must narrow, not truncate identity silently. Largest measured scope is unknown in this planning pass; capped files/reads/unsupported languages are named, not completeness. No selected scope/no candidates: show unknown/bounded-empty and allow map use; no speculative model call. Unbound/stale/moved source: recover binding/grant or refresh; never guess parent. Hangul: preserve labels/questions/citations. Offline/unsupported runtime/local provider: retain input and offer recovery, no automatic provider substitution. Cancel/close/current-vault or runtime switch: cancel pending one-shot send and reject late scope-bound results. Concurrent approval: no queue or bypass. A → B → A: only exact question/targets/request/run/evidence association recovers A; changed basis is stale, missing provenance is Match unknown. Saved analysis/capture failure: transcript remains visible, mark durable save unavailable; do not claim retained result. After apply: refresh/reinspect, retain prior dated result without completion credit.

## Out of scope

Global percent/ontology score/model self-grade — no verified denominator or semantic metric. Automatic runs/scheduler/autonomous writes — owner requested optional actions. New primary route/popup design — reuse prior selected inspector. Native local source construction — parked, separate delivery; label unavailable. Full repository audit or automatic gap resolution — bounded current question only. Subagent fan-out — separately measured ACP option, not shipped default or proven faster; compare read-only workers, one integrator and independent source audit against a single agent on identical sealed tasks, including coordination cost and failures.

## Acceptance criteria

1. Given the map with no selection, one/multiple projects, an empty vault or selected concept/set, when it opens, then a stable visible map-chrome analysis status/entry names the exact scope or offers scope choice/first construction without blocking use, scanning source or starting ACP/model work; it is not confined to More/constellation. The inspector/frame is reused. Proof: hook/panel no-send-on-open tests and installed-app walk.
2. Given empty/mature/unbound/stale/unsupported/oversized scopes, when status and inspection render, then counts are scoped observed facts, source and semantic unknowns remain explicit, no global percentage appears, and correct binding/grant recovery/narrowing is offered. Proof: Gray Area fixtures and rendered recovery captures.
3. Given a current displayed question and ready guarded runtime, when Analyze next is pressed, then exact selected root/question/runtime/transfer was visible, one rechecked request sends once through existing ACP history; double-click, approval waiting, scope/runtime/vault change cannot queue or send stale work. Proof: one-shot openingRequest identity/injection tests and actual ACP native walk.
4. Given an analysis turn or captured packet ceiling, when activity, additional ACP reads/cost or a write request occurs, then packet scan/excerpt ceilings are not labeled ACP source/cost/round enforcement; actual activity is recorded, unknown costs stay unknown, and Stop/ordinary runtime timeout remain available. The button grants no write approval: existing checkpoints pause writes, rejection leaves disk unchanged and separately allowed writes are reported as that decision. No enforced read-only mode is claimed. Proof: existing permission allow/reject and cancellation probes with disk readback; unsupported guard action is disabled.
5. Given a mechanically valid answer containing a wrong semantic claim, a reported finished plan or a changed task denominator, when results render, then Result available/reported tasks never mean semantic completeness or gap resolution, a denominator change is labeled replanning, and semantic scores/acceptance are unknown without receipts; exact evidence, disagreement and unknowns remain reviewable. Proof: valid-citation/wrong-claim fixture and independent source audit.
6. Given A/B scopes and saved, stale, failed-save or provenance-missing results, when the person moves A → B → A or reopens history, then only target UID/slug + question/candidate + request/run + source/binding/graph/body/witness association earns matching-result status; fresh basis is confirmed only by explicit inspection, stale/missing association stays historical/unknown, failed saves get no persisted credit and no old answer authorizes writes. Proof: capture provenance/matching tests and installed-app A/B/A recovery walk.
7. Given a person wants an improvement, when they prepare/send/review it, then a separate editable request preserves existing allow_once/reject_once and meaning acceptance; accepted/applied changes trigger new inspection only on request and do not mark all work done. Proof: permission rejection/approval/readback and repeat-after-apply native walk.
8. Given one unfamiliar fixture, when the actual ACP loop completes analysis, reviewed enrichment and next-task reuse, then tool/time/bytes/cost-availability/failures, source-hidden answers and source-audit errors are reported separately; README/FEATURES/ontology boundaries name ACP availability and local unavailability accurately and changed-path checks pass. Proof: ontology field-trial/benchmark artifacts and `pnpm checks:changed -- --run`; no quality promotion from graph health.

## Risks

1. A progress label becomes false completeness: scope-bound facts, no unknown-denominator percentages, reported-plan labels and planted wrong-claim probe.
2. Immediate send crosses consent or write authority: visible exact scope/provider, nonce plus resource/runtime identity, retain existing allow_once/reject_once checkpoints, label no-write as requested behavior and probe actual disk state.
3. Generic project history becomes false question/result credit: persist target/question/request/run/evidence association, make missing association unknown, and prove A/B/A plus stale/failed-save recovery and fresh optional inspection after changes.

## Later

1. Native local-model source construction/comparison when the actual bridge and approval path can finish; preserve unsuccessful attempts.
2. Broader project questions only when scoped repeat-use evidence demonstrates missed value and a truthful denominator can be defined.
3. ACP read-only worker/integrator strategies only after a measured single-agent baseline; backend capabilities differ and coordination can cost more.

## Owner question

None — reuse the previously selected map-linked inspector and keep paid analysis optional. A new primary popup would reopen structural design selection, which this slice avoids.
