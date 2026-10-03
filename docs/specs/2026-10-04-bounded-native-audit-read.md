---
title: Bounded native reads of the sent log
doc_type: spec
status: draft
area: agents
date: 2026-10-04
decisions: [b8e1b4cb-a6f8-4fa0-ba5a-a861d9db7518]
---

# Bounded native reads of the sent log

## Person and moment

The owner authorized efficient CPU/memory across growing local ontology, wiki,
harness, analysis and automation history without broken behavior. Retention is
pending; the lead observed whole-file audit reading after #2470/#2472. Proposed app behavior is unmeasured.

The outcome is **judge**: inspect the actual transfer count and latest evidence
without a read that buffers the entire accumulated log or turns interrupted
reading into evidence that nothing was sent. The supplied PO route is observed /
substantial-investment / rollback-cheap; review, one-way, risk scope, record yes,
with moment/evidence/smallest-slice. Truth, transfer, agent-write and
human-correction boundaries remain constraints to prove, rather than assumptions.

## Today

- JSONL uses `TauriFileHandle.getFile()`, which receives all binary bytes before
  constructing a File (`src/shared/lib/tauri-vault-fs.ts:103-125`).
- Native binary reading allocates the file length plus its eight-byte stamp and
  reads to EOF (`src-tauri/src/lib.rs:2468-2495`). The lead's 10MiB/64MiB probe
  returned 10,485,768/67,108,872 bytes with equal buffer capacities. These are
  allocation-capacity measurements, not peak RSS or installed-app latency.
- The shared reader admits v1 rows with string `at` and `provider`, skips broken
  rows, preserves unknown/legacy fields, counts all admitted rows and retains a
  requested tail (`src/shared/lib/llm-audit-log.ts:114-154,170-211`). It decodes in
  64KiB pieces with cooperative yielding; cancellation and errors currently return
  zero (`src/shared/lib/llm-audit-log.ts:156-168,214-270`).
- Settings asks for five entries and suppresses abandoned results
  (`src/widgets/app-settings-menu/model/use-ai-connection.ts:108-128`). The screen
  withholds unread counts, renders zero as nothing sent, reverses the tail for
  display, and offers Finder only for a positive count
  (`src/widgets/app-settings-menu/ui/ModelConnectionsPanel.tsx:1302-1374`).
- Reservation appends before transmission; finalize truncates and rewrites the
  same inode's reserved tail (`src-tauri/src/llm_audit.rs:336-420`). Thus an open
  descriptor and a frozen length alone do not establish an immutable snapshot.
- Current secure audit-write decisions retain no-follow directory/file opening,
  single-link verification, reservation locking and fsync: 2026-08-17 (52),
  plus `59f33326-5629-4cb7-8601-33c3b2f005fd`. This read changes none of them.
- Concepts read: `docs/ontology/ontology-atlas.md`, `docs/ontology/elements/bounded-source-read.md`
  and `docs/ontology/elements/llm-provider-adapter.md`; no second data store is authorized.
  Shared fixture: `tests/fixtures/llm-audit-log.sample.jsonl`.

## Problem and alternatives

Priority: (1) remove native whole-file buffering while preserving trustworthy
readback; (2) measure other growing read paths; (3) decide retention with the
owner. Deletion is not needed to restore the first ability. Exact counting still
requires scanning all bytes; this slice bounds transport and retained records,
not total scan work or the maximum size of one existing record.

| Option | Value / usability | Feasibility / cost | Local-first fit and disposition |
|---|---|---|---|
| Keep current behavior | Same facts when a read succeeds; accumulated native allocation remains | No new work; observed full-file allocation persists | Fits disk authority; reject for this observed resource issue |
| Stateless fingerprint/range reads | Bounded delivery, no retained descriptor; needs validation across every reopened range | Repeated safe opens and identity checks; mtime-only tokens miss finalize and replacement | Fits; reserve as fallback if descriptor cleanup cannot be proven |
| Short-lived held-descriptor pull read | Same count/five facts, bounded transport, explicit source-change and retry states | Session ownership and cleanup cost; descriptor is not a snapshot and still needs generation checks | Select for first slice; no writer or storage change |
| Compute summary natively | Only count/five entries cross IPC | Duplicates permissive JS admission/normalization and Unicode/number semantics; parity unproven | Fits disk authority, but reject the extra parser contract in this slice |

Existing users retain every original record and schema. They lose acceptance of
a changed, failed or expired scan as a fresh zero; instead they can retry. Web
FSA transport and file permission behavior remain; shared failed-read presentation
must also avoid a false zero. No new audit-history size or record-admission cap.

## Flow

1. When the person opens Agents → Models with a folder, Atlas starts one owned
   sent-log read and withholds a count until the whole result is verified. Web
   uses ordinary FSA; the app uses the granted folder's fixed audit path only.
2. When the app reads, it pulls at most 1MiB of raw bytes per response, with one
   pull in flight and no whole-file prefetch, aggregate Blob or native buffer.
   Renderer decoding stays in 64KiB pieces; choose transport size through actual
   IPC measurement. JS admission counts all valid rows and retains the last five
   in file order; the screen continues newest-first display, not timestamp sorting.
3. When the source remains stable through completion, Atlas publishes count and
   tail together. Empty/confirmed missing logs retain existing empty behavior;
   absence means no local log, not proof about provider-owned transfers.
4. When an agent appends or finalizes, or another actor edits, truncates, moves or
   replaces the source during reading, Atlas discards that read's entire result,
   shows `auditChanged`, and offers Retry. It never combines old and new generations
   or automatically loops while a writer keeps changing the file.
5. When evidence is missing because access fails, Atlas shows `auditReadFailed`
   and Retry. It reports neither partial counts nor zero. Previously read rows
   must not appear as current evidence under the new failed read or another folder.
6. When the person retries, Atlas starts a new source generation. When they leave,
   change folders, dismiss the owner or supersede the read, Atlas cancels only
   that read and closes it; a late response cannot enter its successor's state.
7. When a read is abandoned without cancellation, its native lease expires after
   30 seconds without a pull, or five minutes total, and closes. If its owner is
   still present, show `auditReadExpired` and Retry. These cleanup policies are
   not performance guarantees; no automatic retry or surviving queue.

The source contract is a **validated stable generation**, not an OS-atomic
snapshot: retain opened identity, initial length and high-resolution modification
and change metadata; validate descriptor and safe path identity before/after each
pull and again before accepting completion. Append invalidates too. Truncation,
short read, same-length edit, same-inode finalize and path/root replacement must
fail closed. Unsupported identity/change detection is unavailable, not assumed
stable. Metadata checks cannot prove immutability against an adversarial filesystem
that hides changes; this limitation must not be described as a snapshot guarantee.
Unix identity supports the bounded path. Other native platforms explicitly return
an unsupported capability and retain existing file transport, preserving Windows
reads until stable identity APIs are proved. Errors on the bounded path never fall
back. This exception follows the owner's behavior-preservation constraint.

Native commands derive caller identity from Tauri's injected webview, never a
frontend-supplied owner ID; each live webview owns at most one audit slot bound to
its granted vault. A process-wide atomic admission limit of **four slots** covers
pending begins, active sessions, pulls and retirement until their resources close.
Four supports a small multiwindow workbench and bounds simultaneously executing
source-read allocations to 4MiB. Tauri owns returned response buffers after each
command; queued transport responses and browser-retained bytes are outside this
bound. Sequential bridge pulls prevent application prefetch, but do not establish
an aggregate IPC or RSS cap. Reserve before I/O; each owns one descriptor and pull. Reject saturation without opening a descriptor, retaining
an entry/queue, evicting another owner or publishing count/tail: use the failed-read
state and Retry. Cleanup releases capacity only after all owned resources settle.
Completion, cancel, error, owner retirement, lease expiry and app exit reclaim
slots, including begin/pull cancellation races. Reject arbitrary paths, cross-owner
IDs, invalid/repeated cursors and terminal pulls; IDs confer no grants. No writer
lock is acquired. Verify raw Tauri IPC, never assume `Vec<u8>` is an ArrayBuffer.

## States

| State | Web | macOS app |
|---|---|---|
| No folder / first run | `agents.models.auditNoVault`; open folder | Same key/action |
| Loading | Existing silent unread-count state; wait or leave | Same; leave cancels its owned read |
| Empty / confirmed missing | `agents.models.auditEmpty`; initiate an existing model workflow in app | Same key; use existing model workflow |
| Complete / single row | `agents.models.auditSummary`, `auditRecent`; inspect supported facts | Same; `auditOpen` selects actual file in Finder |
| Partial scan | Silent loading; no provisional evidence | Same; no count/tail until verified completion |
| Source changed | FSA failure uses `auditReadFailed`; Retry | `agents.models.auditChanged`, `auditRetry`; new read |
| Unreadable / unsafe / admission rejected | `agents.models.auditReadFailed`, `auditRetry`; check access and retry; no native admission | Same; retry starts fresh after capacity frees; no outside-file read |
| Expired | Out of scope — no native lease | `agents.models.auditReadExpired`, `auditRetry`; new read |
| Cancelled / replaced owner | No message; destination owns current state | Same; cleanup with no replacement-state mutation |
| Largest measured input | No measured FSA scalability claim; existing facts | 64MiB native allocation probe; 50,000-row renderer fixture separately; same complete/error states |

## Copy

Only the recovery state needs new copy. Add these keys under `models` in
`messages/en/agents.json` and `messages/ko/agents.json`; their Korean translations
live in the catalogues. Add matching translations in `messages/ja/agents.json`
and `messages/zh/agents.json` for existing locale key parity. Reuse `auditTitle`, `auditSummary`, `auditRecent`,
`auditEmpty`, `auditNoVault`, `auditOpen` and outcome labels unchanged.

| Key | Where it appears | English |
|---|---|---|
| `agents.models.auditChanged` | Sent log after invalidated native read | The sent log changed while it was being read. Retry to read the current file. |
| `agents.models.auditReadFailed` | Sent log after failed read | Could not read .ontology-atlas/llm-audit.jsonl. Check access to this folder, then retry. |
| `agents.models.auditReadExpired` | Sent log after native lease expiry | Reading the sent log expired. Retry to start a new read. |
| `agents.models.auditRetry` | Recovery control beside failed log | Retry |

## Edge cases

- Empty, one, 50,000 rows and 64MiB: assert correct completed count/tail; do not
  conflate separate renderer/native probes or invent a node-capacity claim.
- Hangul/emoji split across bytes, CRLF, EOF without newline, malformed rows,
  future v/outcome, legacy missing host/tools: existing admission and facts remain.
- One record larger than a chunk: count/normalize it correctly; working memory
  can grow with that record and the five retained typed entries, never all rows.
- First run with missing sidecar/log: confirmed absence is empty; permission,
  unsafe path, moved/renamed folder and interrupted reads are failures.
- Concurrent reserve/finalize, append during EOF and same-size replacement:
  invalidate the whole scan; a stable reserved line still reads outcome unknown.
- Offline: reading needs no network or credentials; failed reading changes no
  transfer, approval, secret, document or audit-write eligibility.

## Out of scope

- Retention, archival, deletion, compaction and new ledger versions: owner policy
  is pending and original history must remain intact.
- A general file-stream API, other log migrations or a new backend/cache: only
  the native sent-log read has the measured full-file transport issue here.
- Writer/fsync/lock changes and stronger atomic-snapshot claims: independent
  trust contracts; a bounded reader cannot silently change send eligibility.
- Agent provider traffic coverage, model/parser policy and accepted ontology
  meaning: this log measures Atlas-owned transfers only.

## Acceptance criteria

1. **Given** the shared fixture plus empty, single, malformed/legacy/unknown and
   Unicode boundary rows, **when** both FSA and native pulls complete, **then**
   count and latest five equal the existing parser's admitted records in file
   order. Extend `llm-audit-summary.test.ts` and the shared audit contract fixture;
   also cover CRLF, final unterminated row and an oversized record without a cap.
2. **Given** 10MiB/64MiB files and the 50,000-row fixture, **when** native reading
   runs, **then** each raw response is at most 1MiB and no file-sized native/IPC/
   renderer aggregation occurs. Native/bridge regression probes record allocation
   capacities, retained chunks, rows and elapsed work, including actual IPC
   round-trip counts/latency; installed-app process
   measurements report their method separately, without converting capacity to RSS.
3. **Given** a read paused at begin, middle and EOF, **when** reserve/finalize,
   append, same-size edit, truncation, replacement or folder movement occurs,
   **then** the result is unavailable with no partial/zero publication. Native
   generation-race tests and `use-ai-connection.test.tsx` verify discard and a
   subsequent stable Retry returns only the current generation.
4. **Given** simultaneous begins from repeated/supplied owners and five native
   webviews, **when** admission/pulls race, **then** at most four slots, four audit
   descriptors and four executing source reads exist, each allocating at most 1MiB,
   with one slot/pull per trusted caller;
   saturation retains nothing, publishes no partial/zero facts and preserves others.
   Native admission/ownership and bridge tests also cover cancellation during
   begin/pull, same-name folder switches and ignored late results.
5. **Given** saturation and abandoned sessions, **when** cancellation, retirement
   or injected-time lease expiry settles cleanup, **then** capacity is freed and
   a subsequently admitted read succeeds while other owners survive. Native tests
   reject expired/stale/cross-owner IDs, use a controllable clock rather than sleep,
   and repeat cycles to prove no growing registry, descriptor or buffer population.
6. **Given** granted and unsafe/missing/unreadable paths, **when** reading runs,
   **then** only the fixed audit file is reachable, no external bytes are returned,
   only confirmed absence is empty, and reading does not acquire the writer lock
   or alter files, modes, send guards or fsync. Native planted symlink/hardlink/FIFO
   and grant-revocation probes plus existing audit-writer tests provide evidence.
7. **Given** a person with the installed app and a fixture knowledge state,
   **when** they inspect, invalidate and Retry the sent log without a whole-file
   fallback on the supported bounded path, **then** they can judge the exact count/latest five and distinguish
   unavailable evidence from no transfers, citing displayed facts and disk rows.
   Codex Computer Use captures/recovery readback fail this proof if a false zero,
   stale row, lost history or unresponsive cancellation/retry appears.
8. **Given** ordinary browser FSA and the static web surface, **when** the final
   checks run, **then** no native session is opened on web and existing permission,
   count/order, unknown-outcome and transfer boundaries remain. Run the selected
   `pnpm checks:changed -- --run` recommendations and web smoke for runtime work;
   actual Tauri raw-response and installed-app proof are separately required.

## Risks

Tauri response ownership outlives the registry operation. A staged-response probe
must retain responses across cancellation/re-admission to make that distinction
observable; four slots are not a transport-buffer cap. This narrowed claim replaces
the draft's unproven aggregate-buffer statement after independent review.

1. In-place finalize or replacement escapes source validation. Probe same-length
   edits and races at every boundary; do not label descriptor ownership a snapshot.
2. Cancel/begin races or missing owner cleanup leak descriptors or cross folders.
   Probe terminal-path accounting, cross-owner IDs, expiry and repeated cycles.
3. Hidden buffering or parser drift makes bounded delivery look sufficient.
   Measure all layers, reuse JS admission, and disclose largest-record memory and
   full-scan CPU rather than claim constant total memory or instant counting.

## Owner question

None — preserve history; budgets are proposed policies, not benchmarks. Reversion needs no migration; the lead records the reviewed decision.
