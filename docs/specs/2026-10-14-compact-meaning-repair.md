---
title: Compact meaning repair carries its first step and names the steps it omits
doc_type: spec
status: current
area: agents
date: 2026-10-14
decisions: [63de1347-e419-4943-9264-7505d8ee84ca]
---

# Compact meaning repair carries its first step and names the steps it omits

Line numbers refer to `ccea6cf45`. "Probe" is an uncommitted measurement: a scratch copy of
`mcp/`, `cli/` and `scripts/` run against a copy of `docs/ontology` connected to that
checkout. It ran on one machine with a 71-character `sourceFingerprint`, so CI sizes may
differ by a few tens of bytes.

## Person and moment

Someone who already uses a coding agent asks it to change Atlas. The agent follows the tool
description (`mcp/src/server/tool-definitions/graph.mjs:329`): `connection_info`, then compact
`agent_brief` with the task "Change the task-scoped compact agent brief projection.". It gets
an error telling it to use `detail:"full"` (`mcp/src/agent-brief-compact.mjs:1021-1023`), a
response of 111,830 text characters instead of at most 12,000 bytes (probe).

Evidence: `mcp/src/integration.test.mjs:10735-10786` makes this exact call; the brief reports
it failing PR #2765's train; `ontology-atlas agent-brief --compact` exits 2 with the same error
(probe). How someone still learning agents reads the error has not been observed.

## Today

- **The minimum projection fails.** It is 12,396 bytes and throws. This is after every
  qualifier unit and optional uncertainty unit has been dropped
  (`agent-brief-compact.mjs:983-1024`; probe `baseline-throw`). The largest fields are
  focus 4,965, meaningRepair 2,428 and handoffPrompt 2,344.
- **Compact passes `meaningRepair:v2` through unchanged** (`:924`). Inside it, workflow
  takes 1,096 bytes (step 1 alone is 483), `stopWhen` 246, questions 447 and provenance 211.
- **Only step 1 carries guards.** Steps 2-6 are project-slug templates
  (`mcp/src/meaning-repair.mjs:120-168`). `stopWhen` is the same nine-entry constant in
  every state (`:11-21`, `:71`, `:484`).
- **Only full `agent_brief` returns the workflow and `stopWhen`**; `meaning_repair_review`
  pages carry neither (`:398-461`).
- **The navigation path rewrites the packet** to blocked with
  `stopWhen: ['source_changed_during_navigation']` (`agent-brief-compact.mjs:853-864`).
  The compact prompt has no repair line (`:708-778`).
- **The CLI accepts only full v2.** It calls `validMeaningRepair`
  (`cli/src/lib/query-result-contract/agent-brief/agent-brief-compact.mjs:102`), which
  requires exact v2 keys and all six steps
  (`cli/src/lib/query-result-contract/project-source-meaning.mjs:194-270`, `:296-339`).
  `REPAIR READ` reads `repair.workflow` (`cli/src/commands/diagnosis/agent-brief.mjs:629-630`), and
  `OATLAS_MCP_PATH` can point the CLI at another server build (`cli/src/lib/mcp-bridge/mcp-call.mjs:28-37`).
- **No vault node says compact repeats the workflow**: neither
  `capabilities/task-agent-brief.md` nor `elements/task-scoped-agent-brief-projection.md`
  mentions repair.
- **No in-repo consumer reads compact `workflow` or `stopWhen`** besides the CLI `REPAIR READ`
  line; `mcp/scripts/verify.mjs:335` reads the full brief only.
- **Unknown:** why #2762's own checks passed (main's post-merge MCP lane was inactive), and
  whether any consumer outside this repository reads `compact.meaningRepair.workflow`.

## Problem and alternatives

Compact has no room left at its minimum projection. `meaningRepair` is its largest block
that does not depend on the task.

Ranked by value against cost:
1. **This task fails today.** This slice fixes it.
2. **About 110 bytes of headroom remain** after the fix. See Later 1.
3. **Vault-only changes do not run the wire test.** See Later 2.

| Option | Value | Feasibility and fit | Choice |
|---|---|---|---|
| Status quo | Error; fallback is 111,830 chars | Free; defeats 2026-08-30 | Reject |
| Raise the budget | Fixes today | Barred by 2026-08-30 falsifier, 2026-09-05 dissent | Reject |
| Truncate units | Fixes today | Barred by 2026-09-14 falsifier | Reject |
| `meaningRepair:v2` with a one-step workflow | Same bytes | CLI would then accept a malformed full packet | Reject |
| `omitted.recovery` as an exact call | Self-contained | 11,978 bytes with a same-length line (probe `S1-L2`): 22 bytes of headroom, repeating the call already at `fullDetail` | Reject |
| `meaningRepairCompact:v1`: `firstStep` + `omitted` + `fullDetail` reference | Step 1 runs as-is; steps 2-6 named, recovered by one call | 11,890 bytes, wire 20,954 (probe `F-F1`) | **Choose** (owner) |

**Why `firstStep`, not `workflow: [step1]`:** a one-element `workflow` reads as the whole
workflow to a reader who ignores the contract id. An absent key cannot be read as "empty".

**Why the top level stays `agentBriefCompact:v2`:** only the nested object changes, and it
carries its own id. A v3 would touch eight dispatch sites (for example
`cli/src/lib/mcp-bridge/mcp-call.mjs:333` and `mcp/src/server/rpc.mjs:44`), and older CLIs would reject
the whole response.

## Flow

Compact `meaningRepair`, in key order:

```text
contract                "meaningRepairCompact:v1"
status, projectSlug, blockedBy, primaryQuestion, questionsNeedingReview,
provenance, reviewRevision, questions                  identical to the v2 packet
firstStep               v2 workflow[0], byte-identical; null when the v2 workflow is empty
omitted.steps           ids of v2 workflow[1..] in order; [] when the v2 workflow is empty
omitted.stopConditions  stopWhen.length of the packet full agent_brief returns (>= 1)
omitted.recovery        "fullDetail" (the top-level exact call, validated at CLI :190-199)
writePolicy             identical to the v2 packet
```

Key order follows the v2 packet (`meaning-repair.mjs:471-485`): `firstStep` and `omitted` take
the places of `workflow` and `stopWhen`, and `writePolicy` stays last.

`workflow` and `stopWhen` are absent from compact. Full `agent_brief` is unchanged.

**CLI validation** dispatches on `meaningRepair.contract`. `meaningRepairCompact:v1` gets a
new validator: the shared v2 rules, `omitted` with exactly three keys and
`recovery === "fullDetail"`; for `human_review_required`, `firstStep` passes the step-1 rules
(`:316-338`) and `omitted.steps` equals the five v2 ids in order; otherwise `firstStep` is
`null` and `omitted.steps` is `[]`. `meaningRepair:v2` goes to the unchanged strict validator
(legacy compact). Anything else is rejected. The full validator still accepts only v2.

1. When the agent calls compact for a known task, Atlas returns at most 12,000 bytes with
   `meaningRepairCompact:v1`.
2. When review is required, Atlas puts the exact `meaning_repair_review` call and guards in
   `firstStep`, and adds the repair line just before `Next read:` in both prompt branches.
3. When the agent runs `firstStep`, Atlas returns the first review page
   (`meaning-repair.mjs:494-528`, unchanged).
4. Before asking the person to approve, the agent calls `fullDetail.arguments`; Atlas returns
   `meaningRepair:v2` with all six steps and nine stop conditions.
5. When the agent skips step 4 and writes from compact alone, Atlas cannot detect it; writes
   still need `expected_mtime` and stay manual (`writePolicy`, `safety`). See Risk 2.
6. When the vault or source changed after compact, the review call returns
   `blocked`/`provenance_changed` (`:501-508`); a full packet with a different
   `reviewRevision` wins.
7. When the source changes during navigation, Atlas returns `blocked`/
   `source_changed_during_navigation` with `firstStep` `null` and `stopConditions` at the full
   count, not 1. The next action is `remeasure_source`.
8. When the retained fields alone exceed 12,000 bytes, Atlas throws the existing error.

**Changes together:** `mcp/src/agent-brief-compact.mjs` (projection, navigation-path packet,
prompt line); `project-source-meaning.mjs` (new validator sharing the step-1 check),
`agent-brief-compact.mjs:102` and `agent-brief-fixtures.mjs` (`humanMeaningRepairCompact`);
`cli/src/commands/diagnosis/agent-brief.mjs:629-630` (`REPAIR READ` reads
`repair.firstStep?.calls?.[0] ?? repair.workflow?.[0]?.calls?.[0]`, so a legacy v2 compact from an
older MCP still prints it); `graph.mjs:329/385/388/391`; `mcp/README.md:753-754`, `:1030` (say
"the v2 manifest" so it cannot be read as compact `agent_brief`) and after the paragraph that
starts at `:1047`; `cli/README.md:188`; `docs/features/mcp-server.md:263`; one decision record
and one `changes` record.

**Unchanged:** `docs/.generated/mcp-surface.json` (names and arguments only;
`pnpm docs:surface:check`), `mcp/scripts/verify/checks/meaning-repair.mjs` (full output only,
`agent-brief.mjs:104`), `mcp/src/meaning-repair.mjs`, and the vault (`/ontology-sync` should
find nothing to write).

## States

| State | MCP compact (structured + prompt) | CLI `agent-brief --compact` | Web | macOS app |
|---|---|---|---|---|
| Partial: `human_review_required` | `firstStep` is the review call; `omitted` names 5 steps and 9 conditions; prompt line present. Next: run `firstStep`, then `fullDetail` before step 2 | `MEANING REPAIR`, `REPAIR READ` (from `firstStep`), `REPAIR OMITTED`. Next: the `FULL DETAIL` call | Out of scope — static build serves no MCP | Same payload from the bundled MCP; no screen renders it |
| Empty: `not_needed` | `firstStep` `null`, `omitted.steps` `[]`, no line. Next: the task's next read | `MEANING REPAIR not_needed …`; no repair lines | Out of scope — no MCP | Same payload; no screen |
| Error: `blocked` (first run, stale source) | `blockedBy` kept, `firstStep` `null`, no line. Next: `currentness.source.nextAction` | `MEANING REPAIR … · blocked <reason>` (unchanged) | Out of scope — no MCP | Same payload; no screen |
| Error: `source_changed_during_navigation` | As blocked, plus navigation is blocked. Next: `remeasure_source` | As blocked | Out of scope — no MCP | Same payload; no screen |
| Error: still over budget | Existing error naming the largest fields. Next: `detail:"full"` | Exit 2 with that error | Out of scope — no MCP | Same error |
| Loading | Out of scope — one synchronous call | Out of scope — same | Out of scope — no MCP | Out of scope — same |
| Largest measured vault | This repo (36 review targets, 23 qualifier units, 4 uncertainty documents): 11,890 bytes, wire 20,954 | Same payload | Out of scope — no MCP | Same payload |

## Copy

No `messages/` entries: this is protocol and terminal text, and MCP output is English.

| Key | Where it appears | English |
|---|---|---|
| Prompt repair line | `handoffPrompt`, `human_review_required` only, just before `Next read:` | `Meaning repair: human_review_required; step 1 of 6 is meaningRepair.firstStep; steps 2-6 (human_semantic_approval to finalize) and 9 stop conditions omitted; read detail=full before step 2.` (built from `status` and `omitted`) |
| `REPAIR OMITTED` | CLI human output, after `REPAIR READ`, when `omitted.steps` is non-empty | `REPAIR OMITTED steps 2-6 (human_semantic_approval to finalize) and 9 stop conditions; read FULL DETAIL before step 2` |
| `query_ontology` description | `graph.mjs:329`, after "a `detail:"full"` follow-up." | `Its meaningRepair is meaningRepairCompact:v1: status, conflict guards and the first repair step verbatim, plus the omitted step ids and stop-condition count that only detail:"full" carries; read it before repair step 2.` |
| Guard parameters | `graph.mjs:385/388/391` | Replace `from meaningRepair:v2` with `from meaningRepair (v2 or compact v1)` |
| README compact clause | `mcp/README.md:753-754` | Replace `` `meaningRepair:v2`, approval `` with `` `meaningRepairCompact:v1` (repair status, conflict guards, the first step verbatim, and the ids of the steps only `detail:"full"` repeats), approval `` |
| README repair paragraph | `mcp/README.md`, after the paragraph starting at `:1047` | `Compact agent_brief carries meaningRepairCompact:v1 instead: the same status, questions, provenance, reviewRevision, write policy and first step, with omitted.steps, omitted.stopConditions and omitted.recovery:"fullDetail" naming what only the full packet repeats.` |
| CLI README | `cli/README.md:188`, after "an exact full-detail follow-up." | `Its meaning repair keeps the first step and names the approval-to-finalize steps only the full brief repeats.` |
| Features | `docs/features/mcp-server.md:263` | Replace `the compact meaning-repair and human-approval guards` with `the meaning-repair guards and first step, the names of the repair steps it omits, and the human-approval guards` |

## Edge cases

- **Zero (`not_needed`):** `omitted.steps` is `[]` and the prompt is unchanged.
- **One question:** the same five step ids are omitted.
- **Largest measured:** this repo, at 11,890 bytes. The 501-node test
  (`integration.test.mjs:10788`) still passes.
- **First run:** `blocked`, with its existing reason.
- **Hangul task:** mixed and Hangul-first phrasings select the same capability at 11,911
  and 11,918 bytes (probe `hangul-F`, `hangul2-F`). The repair line is ASCII.
- **Moved or unreadable source:** Flow step 7.
- **Two edits at once:** Flow step 6.
- **Offline:** unaffected; everything runs over local stdio.

## Out of scope

- **Budget change:** barred by the 2026-08-30 and 2026-09-05 decisions.
- **Truncating any unit:** barred by the 2026-09-14 decision.
- **Changes to full `meaningRepair:v2` or `meaning_repair_review`:** the full packet is
  what recovery reads.
- **Compact-by-default:** needs its own trial (2026-08-30).
- **Vault meaning writes:** no vault node states the old behaviour.
- **A prompt line for blocked states:** Later 3.
- **Prompt/structure duplication:** Later 1.

## Acceptance criteria

1. **Recovery proof** (`mcp/src/integration.test.mjs`, known-task test). Given a copy of this
   repo's `docs/ontology` connected to this checkout, when compact is called for the known
   task, then it returns a result (not `isError`) of at most 12,000 bytes (11,890 measured)
   under 22,000 wire characters (20,954 measured); `firstStep.calls[0]` is
   `meaning_repair_review` with guards equal to `provenance` and `reviewRevision`; and
   `fullDetail.arguments` returns workflow ids 2-6 equal to `omitted.steps` and a
   `stopWhen.length` equal to `stopConditions`. The message reports bytes and headroom.
   Fails if it throws or an omitted step is absent from the full call.
2. **Full unchanged** (`meaning-repair.test.mjs`; branch-vs-main probe in the PR). For one
   vault and receipt, full `meaningRepair` is v2 with six steps and nine `stopWhen`,
   byte-identical to main (2,428 bytes; probe-checked). `meaning-repair.mjs` has no diff.
3. **States** (`mcp/src/agent-brief-compact.test.mjs`, extending `:260-285`). Given
   `blocked`, `source_changed_during_navigation` or `not_needed`, then `firstStep` is `null`,
   `omitted.steps` is `[]`, `stopConditions` is the full count, and there is no repair line.
   Given `human_review_required`, the exact line precedes `Next read:` in both branches.
4. **False omission claims are rejected**
   (`cli/src/lib/query-result-contract/agent-brief/agent-brief-compact.test.mjs`): `blocked`
   or `not_needed` with any omitted step; `human_review_required` with a missing, extra,
   renamed or reordered step; `stopConditions` of 0 or a non-integer; `recovery` other than
   `"fullDetail"`; `firstStep` guards that differ from `provenance` or `reviewRevision`. The
   new fixture passes.
5. **Malformed full packets are rejected** (same file). A v2 with only step 1 fails both the
   full and the compact validator; `meaningRepairCompact:v1` inside a full brief fails; a
   legacy compact carrying a complete v2 passes.
6. **Oversized still throws** (`agent-brief-compact.test.mjs:1595-1640`). The tests at
   `:1597`, `:1605`, `:1618` and `:1626` inflate `stopWhen`, which no longer reaches compact,
   so each moves to a retained lever (`blockedBy` on a blocked packet, or
   `provenance.sourceMeasuredAt`) and keeps what it proves: pretty JSON is measured
   (`:1597`), a near-budget packet passes intact, now compared with the expected v1
   projection rather than the v2 packet (`:1605`), retained fields over 12,000 bytes throw the
   existing error (`:1618`), and multibyte text is counted in bytes (`:1626`).
7. **Qualifiers and uncertainty unchanged** (`agent-brief-compact.test.mjs`, the CLI compact
   test, `integration.test.mjs:10704-10706`). Every existing qualifier and uncertainty test
   passes without assertion edits, and the known-task text keeps the exact full-body
   recovery call.
8. **CLI human output** (`cli/src/integration.test.mjs`). A review-required packet prints
   `REPAIR READ` from `firstStep` and the exact `REPAIR OMITTED` line; a legacy v2 compact
   still prints `REPAIR READ` from `workflow[0]`; blocked output still passes `:6889`.
9. **A compact-only reader does not act on step 1 alone** (source-hidden reader, before the
   merge; result in the PR). Given only this task's compact response, a reader that has not
   seen the code names the five omitted steps and the `fullDetail` call, and says it would
   not approve, write or finalize before reading it. Fails if it treats step 1 as the whole
   repair or proposes a write or approval from compact alone.

## Risks

1. **The next edit to the selected documents eats the ~110 bytes.** The concrete trigger: a
   third `Focused test:` coordinate in `docs/ontology/elements/task-scoped-agent-brief-projection.md`
   (two listed, three allowed) adds about 300 bytes across structure and prompt and breaks
   main again. Answer: AC 1 reports headroom on every run, the PR names this trigger, and
   Later 1 ranks first.
2. **A reader treats step 1 as the whole repair.** Answer: both channels state the omission
   with "before step 2", and AC 9 makes the source-hidden reader a pass condition.
3. **CLI and MCP come from different builds.** New CLI with old MCP passes (legacy v2 is
   accepted). Old CLI with new MCP fails closed with `must preserve the action-first human
   review packet` (probe). Answer: test both directions via `OATLAS_MCP_PATH` in the PR and
   say so in the `changes` record.

## Later

1. **Remove the prompt/`focus.taskNavigation` duplication** (about 1 KB of restated
   coordinates and IN/OUT). Next because headroom is ~110 bytes; it needs a text-only reader
   trial.
2. **Let a `docs/ontology` change select the known-task wire test** (`/gate-probe`). Next if a
   vault-only PR breaks main unnoticed again.
3. **Add a `Meaning repair: blocked (<reason>).` prompt line.** Next if a trial shows agents
   miss the block reason from text alone.

## Owner question

None. Measured: `meaningRepair` saves 697 bytes and the prompt line adds 191, so the net is
506 bytes and the response is about 11.9 KB. The expectation was about 850 bytes and 11.5 KB.
This is still the only route inside the standing decisions, so the slice proceeds. To
reverse it, emit v2 in compact again once Later 1 frees the space.

## Decision record (for `pnpm record:new`)

```md
## 2026-10-14 — Compact meaning repair carries its first step and names the steps it omits

**Why**: On Atlas's own vault, compact `agent_brief` for a known task failed at its minimum projection (12,396 bytes, meaningRepair 2,428) after richer documents landed, so the bounded handoff became an error.
**Prior**: Overturns only the `meaningRepair:v2`-mandatory clause of 2026-08-30 "Compact v2 spends 12 KiB on exact evidence" and the every-fact condition of 2026-09-05 "Budget compact handoffs by transmitted JSON, preserving every fact", for compact's repair steps 2-6 and the stop-condition names; accounting, the 12,000-byte budget, conflict guards and approval state stand. Upholds the 2026-08-16 manifest/review split, whole units (2026-09-14), full default and compact opt-in.
**Decision**: Compact carries `meaningRepairCompact:v1`: status, blockedBy, questions, provenance, reviewRevision, writePolicy and the first workflow step verbatim, plus `omitted` with the remaining step ids, the stop-condition count and `fullDetail` as recovery; its prompt says to read detail=full before step 2. Full `meaningRepair:v2` stays byte-identical. CLI validates each contract separately; legacy compact passes only the strict v2 check.
**Dissent**: Planner: the slice frees 506 net bytes, leaving about 110 bytes on this task, so the next document edit can fail again. The 2026-08-16 dissent, sharpened: a reader who skips `omitted` may approve from step 1 alone.
**Falsifier**: Reopen if a reader given only compact approves, writes or finalizes without reading detail=full; if `omitted` disagrees with the full workflow; if full `meaningRepair:v2` changes; or if this known task exceeds 12,000 bytes again. Never answer by raising the budget or cutting a unit.
**Owner**: Project owner; chose to condense only the repair procedure after unit truncation was shown to conflict with the 2026-09-05 and 2026-09-14 records.
```
