---
title: Native Model Stop
doc_type: spec
status: draft
area: agents
date: 2026-10-02
decisions: [db6d6efa-8686-4433-891a-8ec43d9f61f5]
---

# Native Model Stop

## Person and moment

A developer using a direct model in Atlas decides that its current work is
unhelpful, presses Stop, and starts a corrected request. The owner asked for
resource and memory improvements covering people using local models without
ACP. No observed Stop incident or installed capture exists for this slice;
the first acceptance criterion captures that moment before claiming recovery.

The outcome is **correct**: the person can reject the current request and
continue without its eventual answer changing the replacement. The new ability
also ends Atlas's rejected connection. It does not promise that a model server
stops inference or forgets bytes it already received.

## Today

Source baseline: `112127a49`. These are source facts, not runtime measurements.

- The agent panel replaces Send with Stop while running
  (`src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx:857`). Stop aborts its
  frontend controller and clears the running state
  (`src/widgets/vault-agent-panel/model/use-vault-agent.ts:165`). Local Compile
  similarly returns to idle (`src/features/vault-agent/model/use-local-compile.ts:162`);
  its running card has Stop (`src/views/library/ui/parts/LocalCompileCard.tsx:39`).
- Both callers invoke `llmChat` without cancellation
  (`src/widgets/vault-agent-panel/model/use-vault-agent.ts:217`,
  `src/features/vault-agent/model/use-local-compile.ts:235`). The loop's normal
  and closing requests have no cancellation parameter
  (`src/features/vault-agent/model/agent-loop.ts:31`, `:182`, `:311`).
- The bridge has no cancellation argument (`src/shared/lib/tauri-llm.ts:74`),
  and native chat waits for a child to finish
  (`src-tauri/src/llm/http_output.rs:45`). Local and named-provider deadlines
  remain 60 and 180 seconds (`src-tauri/src/llm/chat.rs:24`).
- Native sends reserve an audit entry before transmission, then finalize it
  (`src-tauri/src/llm/chat.rs:111`). The audit allows one reservation per vault at
  a time and refuses changed tail bytes (`src-tauri/src/llm_audit.rs:336`, `:367`).
- Aborted results cannot produce a new proposal in either caller
  (`src/widgets/vault-agent-panel/model/use-vault-agent.ts:244`,
  `src/features/vault-agent/model/use-local-compile.ts:255`). Local Compile only
  writes after its separate Allow action (`use-local-compile.ts:277`).

Standing decisions: [2026-08-01 address connection](../DECISIONS.md#2026-08-01--the-fourth-connection-is-a-door-not-a-vendor-open-a-keyless-connect-by-address-branch-that-absorbs-ollama-lm-studio-and-llamacpp-into-one-place)
and [2026-08-02 local-agent limits](../DECISIONS.md#2026-08-02--the-local-agent-forces-an-answer-after-3-rounds-of-evidence-gathering-and-closes-at-60-seconds).
Their keyless opt-in branch and local/provider deadline distinction remain.
Their tool-support and meaning-quality falsifiers have not been tested here.
The 2026-08-16 ACP decision cites and retains the address branch; ACP remains a
separate transport. The ontology's `elements/llm-provider-adapter` excludes
transport and auditing; this spec does not assign those responsibilities to it.

## Problem and alternatives

Inference: Stop currently ends frontend participation without requesting that
its native connection end. A rejected request can retain transport resources
and the vault's audit reservation until completion or deadline. Neither CPU
cost nor elapsed resource retention has been measured.

Priority: (1) make existing rejection control reach the owned request, because
it restores intervention for both direct callers; (2) inspect other lifetime
boundaries after this proof; (3) evaluate model quality separately, because
cancellation cannot establish useful meaning or better tool support.

| Option | Value and usability | Cost, feasibility and local-first fit | Decision |
|---|---|---|---|
| Keep frontend-only Stop | Preserves existing controls; rejects visible late work | No implementation cost; leaves transport and audit reservation active | Reject: does not restore request control |
| Shorten all deadlines | Bounds waiting without new controls | Simple but discards useful slow answers and changes established provider policy | Reject: cannot express this person's rejection |
| End only the rejected Atlas request | Existing Stop gains transport effect; corrected work can follow | Requires race and audit proof in both callers; leaves files and provider choice under existing authority | Select |

First slice: cancellation for vault-agent and local Compile direct-model turns,
including their closing request. Existing users lose only unfinished work they
stopped or superseded. Completed conversation history, completed proposals and
approved writes retain their existing behavior. No screen redesign is needed.

## Flow

1. When the person starts a direct-model turn, Atlas keeps the existing model,
   transfer disclosure, audit-before-send rule and Stop control.
2. When the answer is delayed, unhelpful or lacks evidence, the person can press
   Stop. Atlas ends further work for that turn, closes its owned in-flight
   connection and keeps already displayed context. It offers no new proposal
   from the rejected turn and writes no proposed content.
3. When the person starts a corrected request immediately, Atlas accepts it without freezing the controls and
   finishes the prior request's audit cleanup before transmitting the replacement
   for the same vault. A normal Stop must not make the replacement fail merely
   because the rejected request still owns that reservation.
4. When cancellation races with completion, Atlas keeps the truthful terminal
   audit outcome already established; Stop never rewrites a completed send as
   unsent. An answer arriving after frontend rejection cannot overwrite or add a
   proposal to the replacement. Repeated Stop has no additional effect.
5. When the person changes the active folder or the owning caller goes away,
   Atlas retires its unfinished request. The former request cannot cancel work
   belonging to another caller or window. Hiding a retained caller is not
   unmounting it; this slice does not change existing panel persistence.
6. When ordinary network or audit failure occurs, Atlas keeps existing failure
   behavior and the person's context. If audit finalization itself fails, Atlas
   preserves the reserved evidence and reports failure rather than claiming a
   complete terminal record or sending without a writable audit.

## States

| State | Web | macOS app |
|---|---|---|
| No open folder | `vaultAgentPanel.degraded.noVaultTitle`; open a folder; direct transport remains unavailable | Same key; open a folder |
| Direct request unavailable | `vaultAgentPanel.degraded.webTitle` / `library.stage.blockedWeb`; use the installed app | Existing connection prerequisite messages; configure the chosen model |
| Running | Out of scope — no direct model transport | `vaultAgentPanel.stop` / `library.localCompile.stop`; Stop rejects this turn |
| Stopped | Out of scope — no direct model transport | Agent: `vaultAgentPanel.notice.aborted`, then `send`; Compile returns to existing idle Library, with `library.stage.compile.title` available; request corrected work |
| Replacement running | Out of scope — no direct model transport | Same running keys; Stop now belongs only to the replacement |
| Completed before Stop | Out of scope — no direct model transport | Existing answer or `library.localCompile.title`; inspect evidence and use existing proposal controls |
| Failed | Out of scope — no direct model transport | Existing `vaultAgentPanel.notice.networkFailed` / `auditBlocked` / `failed`, or `library.localCompile.failed`; retain context and retry after correcting the reported problem |
| Caller retired | Out of scope — no direct model transport | No new message; destination retains its own current state and actions |
| Largest measured vault | Out of scope — no direct model transport | No measured count yet; same running/Stop keys; acceptance records fixture counts without a scalability claim |

## Copy

Reuse existing catalogue entries and their existing Korean translations. No
new or changed copy; Stop does not state that remote inference has stopped.
The UI's next action is in the States table, rather than extra explanatory copy.

| Key | Where it appears | English |
|---|---|---|
| `vaultAgentPanel.stop` | Agent composer | Stop |
| `vaultAgentPanel.send` | Agent composer after Stop | Send |
| `vaultAgentPanel.notice.aborted` | Stopped agent turn | Stopped here. |
| `vaultAgentPanel.degraded.webTitle` | Web agent panel | Available in the desktop app only |
| `vaultAgentPanel.degraded.noVaultTitle` | Agent panel without folder | Open a document folder first |
| `library.localCompile.stop` | Running local Compile | Stop |
| `library.localCompile.title` | Completed local Compile proposal | Ready to write |
| `library.localCompile.failed` | Failed local Compile | Could not finish writing. {reason} |

The native cancellation code uses `nativeErrors.cancelled` (English: "The request
was stopped.") when it reaches the generic native-error boundary. Normal Stop
continues to use the existing aborted-turn copy.

## Edge cases

- Empty folder/source list: existing eligibility gates remain; Stop creates no
  request. One request is the minimum probe. Largest measured fixture counts and
  bytes are unknown until captured; no new global vault or prompt cap is added.
- First run and Hangul: connection setup remains required; cancellation preserves
  the person's Unicode question and source names just as the existing turn does.
- Moved, renamed or unreadable folder: stop the owned connection even if the audit
  cannot finalize; preserve any reserved evidence and existing failure semantics.
- Concurrent document edits: no stopped proposal becomes applicable; completed
  proposals still use their existing currentness and consent checks.
- Offline: Stop can retire an awaiting connection; normal failure and timeout
  remain distinct from intentional rejection. Cancel before transmission sends
  nothing; cancel after transmission cannot retract bytes.
- Stop during response delivery or the closing request: the same ownership and
  late-result rules apply. A duplicate or stale Stop cannot terminate its successor.
- Repeated Stop/start: each rejected request settles and releases its owned
  resources; no growing collection of cancelled requests or retained callbacks.

## Out of scope

- Remote inference shutdown, billing refunds or unsending: Atlas controls its
  connection, not the model server's internal work.
- ACP behavior, model installation/selection, prompt quality, timeout changes and
  adapter normalization: independent policies and transports.
- Undoing approved writes, deleting history, changing consent or local-first
  transfer rules: Stop governs unfinished direct-model work only.
- A new audit ledger format or parallel-send policy: preserve the current
  reserve-before-send contract and honest error evidence.

## Acceptance criteria

1. **Given** an installed app and fixture vault, **when** a person starts a
   deliberately delayed/unhelpful direct turn, **then** capture its model, folder,
   source/node counts, bytes, existing Stop control and request lifetime through
   Codex Computer Use plus an owned local transport probe. Record the baseline;
   current runtime behavior and largest measured fixture remain unproven until then.
2. **Given** that running fixture, **when** Stop is pressed and corrected work is
   started, **then** the old owned connection ends, its child is reaped, the UI
   permits the replacement and late data produces neither a proposal nor a
   replacement-state change. Check both callers with installed Codex Computer Use
   captures and native delayed-response regression tests; report measured cleanup
   duration, without inferring remote inference shutdown.
3. **Given** cancellation before send, during response, during the closing
   request, after completion and repeated twice, **when** each race is exercised,
   **then** only the owned unfinished work ends and no later round is sent after
   rejection. Cover in `agent-loop.test.ts`, `tauri-llm.test.ts` and native tests.
4. **Given** two independently owned requests, **when** one is stopped or its
   caller/folder is retired, **then** the other survives and old results do not
   enter the new folder. Cover `use-vault-agent.test.ts`,
   `use-local-compile.test.tsx` and native request-ownership tests.
5. **Given** writable audit storage, **when** cancellation follows reservation,
   **then** the send retains one truthful terminal record and the next same-vault
   request can reserve normally. A send completed before cancellation keeps its
   completed outcome. Given failed/tampered audit storage, preserve evidence and
   fail closed. Check native audit tests and fixture audit readback.
6. **Given** stopped work with proposed writes and existing completed work,
   **when** cancellation and replacement occur, **then** no rejected proposal
   writes files; completed history and existing approval/currentness guards remain
   intact. Check caller regression tests and installed fixture file readback.
7. **Given** repeated Stop/start cycles, **when** every owned request settles,
   **then** no active owned child, request entry or callback remains from the
   completed cycles. Native/bridge tests record cycle count and retained counts;
   retain output bounds and deadlines without claiming measured RSS improvement.
8. **Given** the static web surface and both direct callers, **when** targeted
   source recommendations and web smoke run, **then** web opens no direct-model
   transport and existing connection/approval gates remain. `pnpm checks:changed
   -- --run` selects final checks; installed proof is separately required before
   landing this desktop behavior.

## Risks

1. Stop targets a replacement or another window. Probe stale/duplicate cancellation
   and independent owners, including rapid Stop/start.
2. Cancellation loses audit evidence or blocks the next turn. Probe every
   reserve/send/finalize boundary, tampered storage and immediate same-vault retry.
3. UI appears stopped while resources or a late proposal survive. Correlate real
   Stop captures with owned transport lifetime, callback cleanup and file readback.

## Later

1. Other active-request lifetimes: inspect ACP and navigation ownership after the
   direct-model control proof reveals the remaining distinct gaps.
2. Local-model quality: compare task evidence and tool behavior if observed model
   failures justify changing policy; cancellation is not that evidence.
3. Broader memory profiling: measure repeated real workflows before changing
   storage or adding caches.

## Owner question

None — use the existing Stop control and preserve established transfer, audit and
write boundaries. The routed review decides this bounded behavior; reverting its
transport implementation does not migrate or delete user data.
