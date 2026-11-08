---
title: Recorded concepts in architecture roles
doc_type: spec
status: current
area: harness
date: 2026-11-09
decisions: [b5203c14-f44e-424c-9e2e-9d8b824177f6]
---

# Recorded concepts in architecture roles

## Person and moment

A developer checking the ontology behind an agent's work selects the Views
role in Harness / Architecture. The observed Atlas Preview walk at
`http://localhost:3201/ko/architecture/?role=views` shows five concepts under a
caption claiming review. The operator then checks the selection rule and finds
that it establishes membership, not review. Evidence: the before capture
`/tmp/atlas-hour-evidence/harness-before.jpg` and the source anchors below.

## Today

- The before capture shows four concept cards and the existing one-more
  disclosure; the caption's count is five. It is the largest role count
  observed in this bounded walk, not a measured maximum for all vaults.
- `src/views/architecture/model/role-concepts.ts:37` selects capability and
  element records with a nonempty path; line 57 matches that path to role
  globs. No review field participates. `src/views/architecture/ui/ArchitecturePage.tsx:236`
  derives the join from the loaded documents.
- `src/views/architecture/ui/ArchitectureRoleDetail.tsx:258` renders
  `concepts.length`; lines 125 and 290 govern the preview and disclosure.
- `docs/ontology/capabilities/architecture-conformance.md:16` describes
  reviewed profile rules and observed imports. It supplies no eligibility
  rule for this concept join; its uncertainty at line 27 is historical, not
  current runtime evidence.
- Web and the shipping macOS bundle were not independently observed in this
  planning pass. The supplied capture is the isolated Atlas Preview.

## Problem and alternatives

The caption lends review authority to a path match. This is the only issue in
this slice and leads because it corrects the evidence a person uses to judge
meaning, with no loss of access to records.

| Option | Value and usability | Feasibility and local-first fit | Decision and cost |
|---|---|---|---|
| Keep the caption | Familiar wording, but unsupported confidence remains | No work; local data unchanged | Reject: preserves the false implication |
| Say recorded concepts | Describes the join and preserves every visible record | Four locale entries; no new state or storage | Choose: small wording change |
| Filter to reviewed concepts | Could support a narrower review claim, but hides records and changes the count | Requires an acceptance contract and eligibility rules; local implementation is possible | Reject: substantial new behavior without evidence that users want it |

Narrowly overturn the review adjective in the 2026-08-27 decision at
`docs/DECISIONS.md:1886`. Its in-place concept detail, distinction from source
modules, and dissent about conflating those layers remain. Its usage-frequency
falsifier was not measured here. The source disproves the adjective's current
precondition. Reopen this wording only when explicit eligibility evidence can
support a reviewed-only claim without hiding records unexpectedly.

The supplied product route is `review` / `meaning`: observed evidence, judge
outcome, cheap rollback, truth affected; transfer, agent-write, and
human-correction unchanged. Review lenses are moment, evidence, boundaries,
and spec. The design route requires a final capture. The lead owns the decision
fragment. The builder also corrects comments describing this join as reviewed
in `role-concepts.ts`, `ArchitectureFlow.tsx`, `ArchitectureWorkbench.tsx`, and
`ArchitectureRoleDetail.tsx`, without changing logic or profile/rule authority. Update the existing workbench
selection assertion to use the catalogue caption and count instead of pinning
the superseded adjective; do not add a prose-pinning test.

## Flow

1. When the person selects a role, Atlas shows the existing concept cards and
   count under the recorded-concepts caption.
2. When the person expands the concept preview, Atlas reveals the same
   additional records through the existing disclosure.
3. When an agent calls the listed concepts reviewed but review evidence is
   absent, the caption makes only a recorded-membership claim; the person can
   inspect the records without Atlas silently excluding them.

## States

| State | Web | macOS app |
|---|---|---|
| Empty selected role | `architecture.layerConcepts`, count 0; choose another role | `architecture.layerConcepts`, count 0; choose another role |
| Loading | Out of scope — no loading behavior changes | Out of scope — no loading behavior changes |
| Error | Out of scope — no error behavior changes | Out of scope — no error behavior changes |
| Partial review evidence | `architecture.layerConcepts`; inspect the same records without a review claim | `architecture.layerConcepts`; inspect the same records without a review claim |
| Single concept | `architecture.layerConcepts`, count 1; inspect its title and path | `architecture.layerConcepts`, count 1; inspect its title and path |
| Largest measured vault | Out of scope — whole-vault maximum was not measured | Out of scope — whole-vault maximum was not measured |
| Observed role, five concepts | `architecture.layerConcepts`, count 5; use existing more disclosure | `architecture.layerConcepts`, count 5; use existing more disclosure |

## Copy

| Key | Where it appears | English |
|---|---|---|
| `architecture.layerConcepts` | Selected role's concept section; `messages/en/architecture.json:87`, `messages/ko/architecture.json:87`, `messages/ja/architecture.json:87`, and `messages/zh/architecture.json:87` | Recorded concepts in this role: {count} |

The exact Korean, Japanese, and Chinese strings live in the listed catalogue entries. This is a count
caption; the existing disclosure supplies the action. No new action or error
copy is introduced.

## Edge cases

- Empty and single results use the same unchanged count interpolation.
- Five is the observed role count; larger counts retain existing disclosure.
- First run without a profile introduces no concept section or new state.
- Hangul titles and paths remain document data; this caption accepts no input.
- Moved, renamed, or unreadable folders retain existing loading and path
  matching behavior; the caption supplies no freshness guarantee.
- Concurrent edits retain the existing loaded-document snapshot semantics.
- Offline use requires no new network request or stored data.

## Out of scope

- Review filtering, badges, or a new acceptance-status model: they would change
  membership or invent authority beyond this evidence.
- Count, ordering, cards, disclosure, layout, and source/profile rules: the
  observed mismatch is in the caption and explanatory comments.
- Vault edits, conformance receipts, and agent permissions: no write boundary
  changes are needed.

## Acceptance criteria

1. Given the observed Views role and the same loaded documents, when the lead
   repeats the Atlas Preview walk at port 3201, then the Korean caption states
   recorded membership with count 5 and the same four cards plus one-more
   disclosure. Check: final capture paired with `harness-before.jpg`.
2. Given the same role in English, when its detail is displayed, then the
   English catalogue string appears with the unchanged count. Check: final
   English capture and bounded inspection of the Japanese/Chinese catalogue entries; no new test pins authored prose.
3. Given records with no review metadata, when the existing role matcher
   checks them, then path-matching membership remains unchanged. Check:
   `src/views/architecture/model/role-concepts.test.ts`, which already creates
   records without review fields; inspect the diff for no eligibility change.
4. Given a person judging whether the five records were reviewed, without
   fetching source to decode the caption, when they read the selected role,
   then the caption claims recorded membership only. Fail if it still asserts
   review, hides a record, or changes the profile/rule authority. Check: paired
   final captures and the independent review of catalogue/comment-only changes.

## Risks

1. Another locale or stale build keeps the old claim: inspect final English
   and Korean captures against the edited catalogues, and inspect the Japanese/Chinese entries.
2. A wording fix becomes an eligibility change: keep executable code unchanged
   and run the existing matcher test on records without review metadata.
3. Removing the adjective weakens legitimate profile authority or still reads
   as acceptance: preserve profile/rule wording and independently review the
   caption in context. Captures prove rendering, not human comprehension.

## Later

None — a review-eligibility feature needs an observed user decision that this
caption and existing record inspection cannot support.

## Owner question

None — the authorized wording correction preserves access and authority;
reverting the four catalogue entries and comments is the recovery path.
