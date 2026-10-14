---
title: Recover meaning after a project document changes
doc_type: spec
status: current
area: ontology-model
date: 2026-10-14
decisions: [ef848ca4-61b9-4089-9024-7be978907647]
---

# Recover meaning after a project document changes

## Person and moment

An agent using Atlas on its own codebase needed a truthful next action before
adding this session's evidence to `docs/ontology`. On 2026-10-14, full and compact
`agent_brief` reported malformed assessment input although the project document's
five competency answers parsed. The lead then opened that vault in installed
Atlas 1.7.0 and remeasured its source: MCP confirmed current source at
`2026-10-14T04:27:28.716Z`, with 124/124 paths resolving, but meaning stayed invalid
and all five question results were unassessed. These are session observations,
not a claim that the source paths prove meaning or runtime behavior.

The person needs to distinguish an edited document from broken input and keep
control of its acceptance. This serves the repeated evidence-and-review loop in
`docs/PRODUCT-DIRECTION.md:52`; success is a usable recovery action, not green health.

## Today

Current-behavior references below describe the pre-change baseline `5d6536330`.

- `mcp/src/project-meaning-receipt.mjs:436` parses the current answers, then sends
  a whole-body digest mismatch through `invalidAssessment`, just like a parser failure.
- `mcp/src/meaning-assessment.mjs:376` maps malformed input to `invalid`,
  `assessment_input_invalid`, and `repair_assessment_input` before source checks.
- `mcp/src/tools/graph.mjs:413` describes every competency reevaluation as a graph
  change; `mcp/src/tools/graph.mjs:416` calls the assessment malformed.
- `mcp/src/tools/graph.mjs:632` independently parses answers for `meaningRepair`;
  this accounts for the observed human-review packet beside an invalid assessment.
- Full MCP reads of `ontology-atlas`, `capabilities/task-agent-brief`, and
  `capabilities/project-source-binding` preserve partial evidence and impact answers.
  Live `list_kinds` measured 98 nodes; broader vault completeness is unknown.
- Retain `docs/DECISIONS.md:4131` (meaning/structure separation),
  `docs/DECISIONS.md:3843` (source/competency provenance separation), and
  `docs/DECISIONS.md:1341` (authored-but-unfinalized answers receive a finalize hint).

## Problem and alternatives

First priority is correct receipt recovery: the cause is treating freshness as
malformation, and the symptom is a repair instruction that cannot restore trust.
Second is accumulating actual task evidence in existing ontology concepts;
it costs a bounded source review and cannot repair this diagnostic by itself.
The exact task "Diagnose competency assessment receipt recovery" returned no
focused capability; this observation does not establish a general matcher defect.

| Option | Value and usability | Feasibility, cost, and local-first fit | Choice |
|---|---|---|---|
| Keep current behavior | Preserves refusal but sends valid authors to input repair | No cost; local-only | Reject: no actionable recovery |
| Change only the malformed hint | Helps a reader infer what happened; typed agents still see invalid input | Small prose change; local-only | Reject: keeps the wrong machine decision |
| Distinguish changed body and retain review | Gives agents a cause and safe next action; keeps the person's answers | Bounded receipt/diagnostic change and consumer proof; no new storage or network | Choose |

Existing users retain parsing, receipt integrity, source checks, and approval.
A changed body's old receipt never establishes current meaning.

## Flow

1. When the person or agent reads health or `agent_brief`, Atlas validates receipt
   integrity and parses the current project document without writing either.
2. When a valid old receipt differs from a parseable current body, Atlas preserves
   existing malformed-input classification, including a missing or malformed
   witness inventory, and existing source repair priorities for well-formed inputs. With current verified
   source it returns `review_required`, `competency_body_changed`, and
   `reevaluate_competency`, before other competency freshness or answer gaps.
3. When the agent is wrong about source currentness, Atlas keeps the source gap
   and its existing remedy first. After successful remeasurement, reading again
   reveals changed-body review; it never accepts the answers automatically.
4. When the person reviews the document against ontology and source evidence,
   accepts actual meaning changes, validates, compiles, and explicitly finalizes,
   Atlas derives a fresh result. Partial answers still need evidence; only all
   existing requirements can yield current meaning.

## States

| State | MCP/CLI result and next action | Web | macOS app |
|---|---|---|---|
| Empty or no receipt | Existing missing-receipt behavior and authored hint | Out of scope — no new UI | Out of scope — no new UI |
| Loading | Existing tool execution; no persisted interim state | Out of scope — no new UI | Out of scope — no new UI |
| Parseable body changed | Review required; review answers and explicitly re-finalize | Out of scope — diagnostic-only slice | Out of scope — source UI already works |
| Source not current | Existing source remedy for well-formed inputs; missing or malformed inventory stays invalid | Out of scope — no source UI change | Out of scope — no source UI change |
| Malformed body or receipt | Existing invalid result; repair actual failure | Out of scope — no new UI | Out of scope — no new UI |
| Partial after finalization | Existing incomplete-question result; keep named gap | Out of scope — no new UI | Out of scope — no new UI |
| Current after finalization | Current only if every existing requirement holds | Out of scope — no new UI | Out of scope — no new UI |
| Largest measured here | 98 nodes, 124 source witnesses; same categorical rules | Out of scope — no layout change | Out of scope — no layout change |

## Copy

CLI/MCP diagnostics are English. No screen copy changes or unused catalogue keys.

| Key / selector | Where it appears | English |
|---|---|---|
| `competency_body_changed` | Health/workspace meaning hint when this is the top gap | The project document changed since its competency answers were finalized. Review its `## Competency answers` against the current ontology and source evidence. After any approved changes, validate the vault, compile the ontology, and call finalize_project_meaning again. |
| `reevaluate_competency` fallback | Existing graph/source competency freshness hints | The ontology or source evidence changed since the competency answers were finalized. Review the project document's `## Competency answers` against the current ontology and source evidence. After any approved changes, validate the vault, compile the ontology, and call finalize_project_meaning again. |

## Edge cases

- Empty vault and one project: preserve missing-receipt semantics; do not invent an old receipt.
- 98-node measured vault: retain bounded full/compact output; no larger-scale claim.
- First run or authored answers without a receipt: retain the existing finalize hint.
- Hangul answers remain valid content; digest comparison is byte-exact and locale-independent.
- Moved, renamed, unreadable, or offline source: preserve source/currentness priority for well-formed assessment inputs; missing or malformed inventory retains its existing invalid classification. No network fallback.
- Concurrent edits: reads do not overwrite; finalization retains existing `expected_mtime` protection.
- Edits outside competency answers also change the digest; say document changed, not answers changed.
- Corrupt, duplicate, future-version, or unsafe-path receipts stay invalid; partial answers never auto-promote.

## Out of scope

- Web/macOS UI changes: observed native source remeasurement already succeeds; the defect is MCP/CLI assessment.
- Automatic writes, approval, or finalization: diagnosis cannot accept meaning for the person.
- Receipt migration, relaxed parsing, new source measurement, general task matching, or whole-vault qualification: unnecessary for this recovery.

## Acceptance criteria

1. Given a valid finalized project and parseable body edit, when source is current, then assessment is `review_required` with `competency_body_changed` and `reevaluate_competency`, preserving source currentness. Probe: `mcp/src/project-meaning-receipt.test.mjs`, including an edit outside competency answers.
2. Given that edit and a well-formed witness inventory plus stale, unavailable, unmeasured, or invalid source, when assessed, then the existing source remedy wins; after current source is supplied, changed-body review appears. Missing or malformed inventory retains its existing invalid classification. Probe: `mcp/src/project-meaning-receipt.test.mjs`.
3. Given malformed answers or corrupt/unsafe/future receipt state, when read, then assessment stays invalid; a missing receipt keeps existing authored/not-authored behavior. Probe: receipt tests and `mcp/src/meaning-not-authored.test.mjs`.
4. Given changed-body review, when health, workspace, full brief, and compact brief read it, then typed status/gap/action agree and health explains document review without claiming malformed input or graph-only change. Probe: the stdio recovery case in `mcp/src/project-meaning-restart.test.mjs`, including CLI response validation, and `mcp/src/meaning-hint-coverage.test.mjs`; inspect copy without pinning prose.
5. Given an old receipt and edited body, when diagnostics run, then no document, sidecar, approval, or receipt changes and no body/private source coordinates leak. Probe: `mcp/src/project-meaning-receipt.test.mjs`.
6. Given reviewed answers and existing write authority, when validation, complete compile, current source, and explicit finalization succeed, then a fresh reader derives the new receipt while partial answers remain non-current. Probe: `mcp/src/project-meaning-restart.test.mjs`.
7. Given the observed dogfood vault, when the lead repeats the source-current read through source and bundled MCP/CLI, then edited valid answers get the review remedy rather than input repair; preserve evidence of remaining gaps. Recovery proof: session installed-app remeasurement, `pnpm dogfood:health`, and full/compact `agent_brief` readback.

## Risks

1. A stale receipt accepts edited answers: changed-body failure probes and explicit finalization are mandatory.
2. A body remedy masks missing source or corruption: precedence and malformed-state probes preserve those failures.
3. One projection drops the gap or misleading prose survives: compare full/compact briefs, health/workspace diagnostics, and source/bundled consumers.

## Later

1. Reuse accumulated ontology evidence in a later independent task; proceed after this recovery is verified and recorded.
2. Expand task navigation only after repeated concrete tasks lack relevant reviewed concepts; one null match does not justify matcher redesign.

## Owner question

None — use the smallest diagnostic correction; retain the previous contract for unchanged or genuinely malformed input.
