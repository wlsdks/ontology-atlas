---
title: Compact Uncertainty Recovery
doc_type: spec
status: current
area: agents
date: 2026-10-11
decisions: [266b7d25-6b6e-400f-b7ab-c37c285b72b5]
---

# Compact Uncertainty Recovery

## Person and moment

The owner asked to continue with larger improvements after three compact-handoff fixes. The first user is a coding agent receiving a known-task handoff before changing code; the person supervising it needs the recorded limits to survive that handoff. This matches `docs/PRODUCT-DIRECTION.md:24` and `:37`.

No live human-user failure has been captured for this slice. A local replay clips a concurrency qualification and later writer/project unknowns, omits the meaning gap after three strings, and excludes the project from recovery. In the lead's 2026-10-11 source-hidden MCP baseline capture, a fresh agent checked the connection, requested compact, and executed its exact full-body read for capability/writer. It then reported the project's verification limits unavailable because the fragment lacked a source slug and the supplied call omitted the project. This is one hand-authored fixture proving a delivery/recovery failure, not general user benefit or construction quality.

## Today

The following source line references describe the captured pre-change baseline
at commit `a3d9f0dca`; final behavior is specified below and documented in the MCP/CLI READMEs.

- `mcp/src/agent-brief-compact.mjs:600` caps `focus.unknowns` at three strings and clips each beyond 96 characters. Lines 958–974 supply capability, anchor, project and system uncertainty to that same limit; list content can survive the excerpt fallback but is still clipped.
- `mcp/src/agent-brief-compact.mjs:664` already preserves whole qualifier units for the selected capability and anchors. Its full-body call at `:776` excludes the project; `nextReads` selection at `:975` also omits the project when a capability matches.
- `mcp/src/agent-brief-compact.mjs:1093` budgets the complete serialized object. `cli/src/lib/query-result-contract/agent-brief/agent-brief-compact.mjs:37` instead counts pretty-printed JSON, so CLI can reject a valid MCP object. Its `:157` requires string unknowns; `:163` permits at most six full-body slugs.
- `cli/README.md:177` keeps compact v2 opt-in and full detail the default. `docs/DECISIONS.md:923` owns the 12,000-byte transmitted-JSON accounting; `:1517` keeps selection separate from proof and default promotion. The current combined wire guard is 22,000 characters (`mcp/src/integration.test.mjs:10610`); the historical 20,000 figure is not the current gate.
- Full MCP reads of `capabilities/task-agent-brief` and `elements/task-scoped-agent-brief-projection` retain explicit unknowns and exclude host enforcement/source-behavior proof (`docs/ontology/capabilities/task-agent-brief.md:18`; `docs/ontology/elements/task-scoped-agent-brief-projection.md:31`). Their historical performance claims were not remeasured and are not evidence for this slice. No screen or message catalogue is involved.

## Problem and alternatives

Rank 1 is preserving uncertainty through the existing handoff: a missing qualification can change the next decision, and one bounded read-side contract restores inspection and recovery. Rank 2 is broader qualifier selection only after this recovery is proven. Rank 3 is cross-repository usefulness, which needs separate trials. None is chosen for code cleanup alone.

The cause is lossy projection without per-document omission evidence, combined with an incomplete recovery target and divergent transport accounting. Existing users must keep string unknowns, exact follow-ups, fail-closed currentness/meaning, and the fixed budget.

| Option | Value and usability | Feasibility and local-first fit | Cost and decision |
|---|---|---|---|
| Leave the projection unchanged | Existing clients work; agents cannot distinguish complete limits from fragments | No changes; local reads only | Lowest cost, but retains the observed loss; rejected |
| Return every uncertainty section unbounded | All recorded text is immediately readable | Local reads fit, fixed transport budget does not | Can reject useful large handoffs or force a new default/budget; rejected |
| Whole units with typed coverage and exact recovery | Agents can cite what is shown and recover what is omitted | Uses the existing operation and local full-body read | Adds validation and budget selection; selected |

The selected slice adds `focus.uncertainty` without a new contract version or input:

```ts
{
  scope: "selected_task_documents",
  sources: [{ slug, status: "recorded" | "not_recorded",
    totalUnits, omittedUnits, unknownIndexes: [0] }],
  system: [{ code: "source_changed_during_navigation" | "meaning_gap",
    unknownIndex: 1 }]
}
```

`focus.unknowns` remains a string array: each entry is a whole recorded Markdown unit or a whole existing system warning. The new block stores no text copies. Indices are zero-based references to that string array; recorded provenance and system origin are disjoint. Equal recorded units may share an index across source rows, but count once per document. Existing qualifier fields and their recorded/not-accepted semantics remain compatible; rendering need not repeat identical text already shown as a qualifier. Prompt/human output names each source slug or system code and JSON-quotes recorded strings, so embedded newlines or `Next read:` text stay quoted data rather than a new instruction line.

Sources are exactly the selected project, selected capability if any, and selected anchors, deduplicated. Refused candidates remain unselected and keep their existing next reads. A top-level bullet with its continuation/nested lines is one unit; prose-only or mixed prose/list sections remain intact where splitting could detach a qualification. Counts describe units, never facts. `not_recorded` means no nonempty Uncertainty section was recorded for that document; it never means the document or project has no unknowns. No global completeness claim is added.

For each source, `totalUnits = unknownIndexes.length + omittedUnits`; indices are valid and unique within that source. Whole units longer than the available budget are omitted, never shortened. Deterministic projection preserves system warnings, coverage and recovery first. Existing qualifiers use their whole-unit budget policy; then at most eight recorded uncertainty units, chosen in document round-robin order, are considered for remaining space. An oversized candidate does not prevent a later short candidate from fitting. All units are counted even when not considered for delivery. Any text removal updates counts and indices together. If mandatory data still exceeds the ceiling, the existing compact-budget failure points to full detail.

The existing first `get_concepts` next read always includes every source slug, including the project, plus existing refusal candidates where relevant. Matched scope has at most five slugs; refusal scope has at most four. The call retains `body:"full"` and survives all budget reductions. Qualifier recovery remains valid within this broader call. MCP and CLI use UTF-8 bytes of `JSON.stringify(result)`, including `handoffPrompt` and every field, at the unchanged 12,000-byte ceiling.

## Flow

1. When the agent requests the existing compact brief for a project and task, Atlas returns the existing selection and trust state with whole recorded unknowns, source coverage and distinct system gaps.
2. When recorded units do not fit, Atlas reports their omission under their document and keeps the exact full-body recovery call; the text handoff gives the same limits and action.
3. When the agent follows that call, Atlas uses the existing full-body read API. Recovery is complete only for rows with `ok:true` and `bodyInfo.truncated:false`; capped, missing or failed bodies remain incomplete/unknown. The reader may quote an omitted qualification only when the returned body actually contains it. This slice adds no pagination or larger body cap.
4. When the agent is wrong about the task match, or a section/evidence is missing, Atlas preserves refusal or `not_recorded`, currentness and meaning gaps; it does not manufacture certainty or approve a write.
5. When a CLI user requests JSON, human output or the prompt, Atlas delivers the same valid bounded handoff; display indentation does not change acceptance.

## States

| State | Web | macOS app |
|---|---|---|
| Recorded units returned | Out of scope — MCP/CLI response only | Out of scope — no workbench state changes |
| Units omitted; full-body read required | Out of scope — MCP/CLI response only | Out of scope — no workbench state changes |
| Empty section or first-run absence | Out of scope — existing read response only | Out of scope — no first-run UI changes |
| Refusal or currentness/meaning gap | Out of scope — existing contract preserved | Out of scope — no review/approval UI changes |
| Read or mandatory-budget failure | Out of scope — existing tool error | Out of scope — no app error UI changes |
| Largest measured fixture | Out of scope — transport proof only | Out of scope — no layout changes |

## Copy

None — no web/macOS copy or catalogue entries change. English machine output reports source slug, returned/total/omitted units, absence as unknown, system gaps and the existing exact call; it introduces no localized screen string.

## Edge cases

- Empty or first-run vault: preserve existing selection/error behavior; absent uncertainty is `not_recorded`, not an assurance. Single unit: include it whole or count one omission.
- More than three units, multiline bullets, nested lists, mixed prose and Hangul: preserve complete text and count omissions using UTF-8 serialization. Largest observed replay has three scoped documents; also measure the supported five-document scope and oversized units before landing, without claiming a largest-vault benchmark.
- Folder moved, document renamed or unreadable between calls: the existing read may fail; retain the gap and use existing discovery/retry, never report an unreturned body as recovered. The full-body API caps each body at 40,000 characters (`mcp/src/vault.mjs:348`); a later limit beyond that cap remains unknown. No snapshot guarantee is introduced.
- Concurrent source edits retain the existing source-change warning and withdrawn coordinates. Concurrent vault edits mean a follow-up is a fresh read, not proof of the earlier body. Offline local reads need no network service.

## Out of scope

- New tools, public inputs, vault kinds, writes, acceptance states or construction rules: this restores read-side evidence only.
- New source access, host enforcement, automatic recovery execution or semantic approval: agents and people retain the existing boundaries.
- Web/macOS UI, compact-by-default, budget expansion and speed/quality superiority claims: none is needed to recover recorded limits.

## Acceptance criteria

1. Given the captured baseline recovery failure, when a fresh source-hidden reader uses actual read-only MCP on the same fixed hand-authored fixture, then its compact request and returned full-body call recover the project's trailing thread-safety limit and omitted qualifications, and its answer cites them while leaving unsupported behavior unknown. Store before/after transcripts in the session scratchpad; report one-fixture delivery/recovery evidence, not construction qualification.
2. Given short fourth/later units, long qualifications, Hangul, multiline/bulleted/mixed sections and embedded `Next read:` instruction text, when compact is projected, then units are whole, provenance/counts are exact and quoted output preserves the instruction as data; oversized units are omitted intact. Verify positive and omission cases in `mcp/src/agent-brief-compact.test.mjs` without adding a general Markdown parser.
3. Given recorded, empty and absent Uncertainty sections, when coverage is returned, then all scoped documents have honest status/counts and no project-wide completeness claim; system source-change and meaning-gap warnings survive regardless of recorded text volume. Verify in the same projection tests.
4. Given matched scope or refusal, when any recorded text is removed for budget, then the existing full-body next read still covers the project and every scoped document, while refused candidates stay unselected. Execute the returned call in `mcp/src/integration.test.mjs`; a missing row or a limit beyond the existing full-body cap must retain `ok:false` or `bodyInfo.truncated:true` and must not count as complete recovery. Include that capped negative case in the source-hidden reader proof.
5. Given a response below 12,000 serialized UTF-8 bytes but above 12,000 pretty bytes, when MCP and CLI validate it, then both accept the same object; a serialized oversize and multibyte negative control fail. Verify producer and CLI contract tests plus the unchanged combined wire guard in `mcp/src/integration.test.mjs`.
6. Given malformed source counts, out-of-range/duplicate indices or missing recovery targets, when CLI consumes the new field, then validation fails before output; legacy valid v2 payloads without the additive field remain readable. Verify `cli/src/lib/query-result-contract/agent-brief/agent-brief-compact.test.mjs`.
7. Given ready, partial and refused compact responses, when delivered as MCP text, CLI JSON/human output or `--prompt`, then uncertainty coverage, system gaps and the exact recovery call agree; MCP `content.text` equals `structuredContent.handoffPrompt`. Verify MCP/CLI integration tests without changing full-default behavior or existing string unknowns.
8. Given all proofs pass, when the lead runs `pnpm checks:changed -- --run` and its recommendations, then the final diff preserves currentness, meaning repair, approval, qualifiers and selected-project boundaries, documents the public MCP/CLI contract, and records the decision. Passing tests alone is not meaning acceptance.

## Risks

1. Budget trimming leaves stale indices or loses a system gap. Probe shrinking with multibyte/oversized text, validate the final object, and reserve warnings, counts and the recovery call before optional units.
2. A reader treats `not_recorded` or zero omissions as complete knowledge. Keep scope explicit, distinguish absence from recorded text and require the fresh reader to name an unsupported conclusion.
3. Project recovery or CLI rendering diverges from typed data. Execute the exact returned full-body call and compare MCP/CLI outputs, including the pretty-versus-transmitted byte boundary.

## Later

1. Improve which recorded qualifier is shown first only if the recovery trial reveals a wrong first decision despite intact uncertainty.
2. Run cross-repository repeated-task handoff trials before any claim of broader usefulness or a compact-default change.

## Owner question

None — preserve the existing operation, v2 and budget; additive coverage is the smallest reversible change. If it fails the recovery proof, retain full detail as the current escape path and do not promote the compact behavior.
