---
title: Automated recheck of concepts whose code changed
doc_type: spec
status: draft
area: automations
date: 2026-11-27
decisions: []
---

# Automated recheck of concepts whose code changed

A schedule in the Automations Ontology lane rereads each stale concept against what changed in its
cited files, records the ones still accurate, edits the sentences that are not, and makes one commit
a person can undo. "Stale" is the code's word; screens say "code changed after the document".

## Person and moment

The owner, a developer who works with coding agents, reads how many concepts no longer stand on
their code and decides whether to trust the map. On 2026-11-27 the owner decided this recheck is
worth building. The standing direction of 2026-11-18, translated: "a person checking every step no
longer makes sense" (`docs/records/decisions/2026-11-18-first-map-written-in-one-run-0f78a22b-d1bc-45db-932a-74616f5f0667.md:7`).

Measured that day: a reader judged 20 random stale concepts of this repository's vault, each body
against `git diff -w <document commit> HEAD -- <file>`. 15 were fully accurate, 5 partly outdated
(a removed feature still listed, a missing exclusion, changed quoted wording, a size or location
claim), 0 wrong. Two of the five outdated claims sat only under `## Uncertainty`; 18 of 20 came
from repository-wide refactors; commit count did not predict which were outdated.

Not observed: the owner reading the count on a screen (no capture; criterion 1 takes one), anyone
learning coding agents, and anyone without an agent, for whom nothing here changes.

## Today

Read at `origin/main` `901e6c398c`. No running screen was looked at: the brief names no port.

- **The rule.** A concept is stale when a cited file's last commit is later than its document's
  (`mcp/src/drift/evidence-verdict.mjs:46-56`); cited files are its `path:` and its elements'
  (`mcp/src/drift/evidence-drift.mjs:15-46`). Measured here: 97 nodes, 90 cite a file, 72 stale,
  none has `review_state`. The slice on `origin/feat/evidence-ignores-comment-edits` promises 10
  fewer in its spec and about 51 in this spec's brief; neither was re-measured.
- **Nothing records "read again, still true".** Only a new commit on the document clears stale.
  The conversation's "Update N concepts whose code changed" tells the agent to "leave a concept
  unchanged when it still holds" (`messages/en/acpChat.json:396-400`), so an accurate one stays
  stale.
- **Ontology schedules write nothing** (`docs/features/automations.md:94-96`): the brief forbids
  every write tool (`src/features/library-rounds/model/ontology-round-brief.ts:30-36`) and the
  scope refuses Atlas writes and file edits
  (`src/features/library-rounds/model/round-scope.ts:103-113`, `:135-138`). A pass is at most one
  agent turn (`src/entities/library-round/model/round-ledger.ts:41`), one at a time
  (`src/views/library/lib/rounds/use-rounds-runner.ts:311`).
- **Undo in the Documents lane is Atlas's own put-back, not a press.** After the turn Atlas
  restores a page that breaks the draft rules and saves the removed text under
  `.ontology-atlas/undone/<pass id>/` (`use-rounds-runner.ts:398-404`,
  `src/features/library-rounds/model/pass-pages.ts:133-166`). A run row has no undo control
  (`src/views/automations/ui/AutomationRunHistory.tsx:110-161`).
- **Git.** A snapshot commits every changed file under the vault, never pushes, and is blocked on
  a detached HEAD or an operation in progress (`mcp/src/git/git-tools.mjs:134-198`, `:228-243`;
  `src-tauri/src/git/snapshot.rs:219-286`). One document can be restored to a named commit
  (`src-tauri/src/git/document.rs:250-292`). This vault ignores `.ontology-atlas/`
  (`docs/ontology/.gitignore:6`), so run history stays on this Mac.
- **Writes and keys.** `patch_concept` replaces the whole body
  (`mcp/src/server/tool-definitions/write-concepts.mjs:193-196`). `reviewed_by`, `reviewed_at` and
  `reviewed_digest` are a person's alone (`mcp/src/schema.mjs:146-154`), and the review digest
  counts every unlisted key as meaning (`:163-168`).
- **Where the list is.** The project page's To check dialog groups "Code changed after the
  document · N" (`src/views/project-detail/ui/now/ToCheckSection.tsx:233-262`), in the app only
  (`messages/en/projectPages.json:180`). The vault's Evidence drift detection excludes "repairing
  or rewriting the affected meaning" (`docs/ontology/capabilities/evidence-drift-detection.md`).

Unknown: whether every app write path keeps an unknown frontmatter key, and how this repository's
commit hooks answer a commit made by the app (read, not run).

## Problem and alternatives

**Problem (inferred).** The count no longer means "read this": three of four sampled stale concepts
were accurate and no action clears an accurate one. Reading 51 to 72 bodies against diffs by hand
is the per-item review the owner retired.

**Ranked, value against cost.** (1) Recording "still accurate" returns 15 of 20 for one key and one
commit. (2) Seeing and undoing a run is the owner's condition for unattended writes. (3) Editing
outdated sentences returns the other 5 and is where a wrong write can happen. (4) The clock and
(5) the entry in the To check dialog are nearly free. All are this slice because 1 to 3 are unsafe
apart; next is showing the mark on the concept (Later 1).

**Patterns that already solved this.**

- *Renovate and Dependabot* (assumption: public documentation, not re-read): a bot makes the
  routine update one small unit, reverted in one step, under a cap on open units. It fails as
  fatigue when units outrun readers. Borrowed: a cap and one undoable unit per run; no pull
  request, which needs a remote.
- *OpenWiki* (local copy at `dcb803e`): each stale claim gets one explicit decision, confirm,
  revise or retract; a stale mark is "a requirement to recheck current source, not ... an
  instruction to retract" (`src/claims/guidance.ts:19-21`); the tool, not the model, writes
  `verified` (`README.md:380`). Its "change only what current repository evidence requires" is
  only a prompt line (`src/agent/repository-prompts.ts:154`). Borrowed: three outcomes and a mark
  the tool writes.
- *sag-wiki* (local copy at `b6940ac`): five model-free states that never rewrite the note
  (`core/src/notes.rs:470-582`). It says text changed, never whether the claim holds, which is
  where Atlas stands. Borrowed: the model-free rule runs first, so nothing stale costs no agent.

New here: the agent holds no write tool, so "only the affected sentences" is how Atlas applies an
edit, not a request; and undoing a run makes its concepts stale again.

| Way | Value | Usability | Feasibility | Why it lost |
|---|---|---|---|---|
| Status quo: the "Update N concepts" suggestion | Accurate concepts stay stale | A person present, no cap | Exists | Cannot clear 15 of 20 |
| Narrow the rule further (comments, cited ranges) | Removes noise only | Invisible | In progress | Cannot judge a changed function body; complements this |
| Recheck that only marks | 15 of 20 | Simple | Smaller | Leaves 5 to a person; the fallback if the falsifier fires |
| Agent writes with `patch_concept` in the pass | All 20 | Same | Whole-body replace; a stopped turn leaves half a run | The edit limit would be a request |
| **Chosen: read-only turn, Atlas applies and commits** | All 20 | One run, one commit | New apply step, rule change | |

Every row is local-first: no backend, files and Git only.

**"Still accurate" needs one new key.** The rule turns current only on a newer document commit,
and Git cannot commit an unchanged file. The other homes fail: `reviewed_at` is a person's; a body
line spends the 150-word body and expires a person's confirmation; a file in `.ontology-atlas/` is
a second store this vault does not commit; a whitespace change is a diff that says nothing. So
Atlas writes `evidence_checked: <commit>`, the 40-character commit the code was read at, on a
domain, capability or element: optional, written by Atlas only, a new value on every recheck,
ordinary Markdown, and outside the review digest so the mark alone expires no confirmation.
`mcp/src/schema.mjs` and `docs/ONTOLOGY-ATLAS-SPEC.md:333-337` gain it in the same change.

**The standing decision this narrows.** Prior: `docs/records/decisions/2026-09-20-automations-hub-schedules-fd3d1a37-534b-43dc-a885-e9193918e096.md`
("It never writes ontology files"; falsifier "a scheduled pass writes an ontology file") and
`2026-09-17-library-rounds-standing-scope-0e82da66-48d2-44f1-a923-82857d7a3710.md` (falsifier "a
node written by a round"). Both stand for the Ontology check and every Documents schedule.
`2026-09-29-round-refuses-atlas-write-drafts-only-5e2f4838-d719-40e6-a0a3-8713d228270a.md` stands
whole: the agent's turn still refuses every Atlas write. Narrowed: after a recheck's turn, Atlas
itself may change the body and `evidence_checked` of the concepts that run took. *Dissent:* review
before a write is stronger than after; "still accurate" is a model's claim nobody checks, and a
false current is worse than a false stale; text in a diff can steer a run. *Falsifier:* a recheck
commit holding a file that was not stale at its start or a changed key other than
`evidence_checked`; 2 or more of 20 re-read "still accurate" concepts outdated; or the owner
undoing more than one in five updated concepts in the first month.

## Flow

1. When the person presses **Schedule ontology check** and picks "Recheck concepts whose code
   changed", Atlas shows the cadence, "Concepts per run" (default 10, 1 to 25), four scope lines
   naming the branch now checked out, and the cost. **Allow and schedule** saves it. The kind is
   fixed; raising the number or changing the branch asks to allow again.
2. When the time comes or the person presses **Run now**, Atlas finds the stale concepts from Git
   with no agent. With none, the run ends "No changes".
3. Atlas takes up to the cap, longest-waiting document first, and skips a concept whose document
   or cited file has uncommitted changes, one raised with `review_state: human_decides`, and one
   left "Not decided" before whose document and files have not changed since.
4. Atlas gives one read-only agent turn each document and the diff of its moved files from the
   document's commit to `HEAD`, cut at 400 lines per concept (7 of 72 exceed it; the agent may
   read the current file). The agent answers per concept: still accurate; up to 5 edits, each
   replacing or removing an exact passage or adding a line after an existing one; or cannot tell,
   with a reason. `## Uncertainty` is read like any claim.
5. Atlas applies the reply itself: still accurate adds `evidence_checked`; edits are applied and
   the key added; cannot tell changes nothing. The outcome shown is read from the files.
6. When the agent is wrong, Atlas changes nothing for that concept and lists it "Not decided" with
   the reason: text not in the document, a section heading named, more than 5 edits, no answer, or
   the document changed meanwhile. An answer for a concept outside the run is ignored and counted.
   A reply Atlas cannot read changes no document and fails the run.
7. Atlas commits exactly the documents it changed as `docs: recheck N concepts against the code`,
   slugs listed by outcome in the body, and never pushes. If Git refuses, Atlas puts every document
   back, keeps the new text under `.ontology-atlas/undone/<pass id>/` and fails the run.
8. When the person presses **View results** on the run, a centred dialog lists the concepts by
   outcome; choosing one shows its reason and its document diff. **Undo this concept** or **Undo
   this run** commits the earlier text of those documents; one changed since is left and named.
   Undone concepts are stale again.
9. When the person presses **Recheck with an agent** in the To check dialog, Atlas starts the
   allowed recheck schedule and opens Automations on its row; with none, it opens the sheet.

**Cost.** No agent turn when nothing is stale, otherwise one per run. Measured on the 72: document
plus cut diff is 4 KB at the median; ten are 40 KB, the oldest ten 134 KB, the worst ten 209 KB,
the worst 25 346 KB, all 72 535 KB. The cap is the person's number in the sheet: ten by default
because ten rows are a list read at once (assumption), 25 at most so the worst run stays one turn.

**Never touched:** `uid`, `slug`, `kind`, `title`, `path`, relation keys, `display_*`, review keys,
`created_by`, section headings, a concept that was not stale, a file outside the vault,
`finalize_project_meaning`.

## States

The web cell of an Automations row is what `automations.appRequiredDescription` already says there.

| State | Web | macOS app |
|---|---|---|
| Empty (no recheck schedule) | Out of scope — Automations needs the app | Lane facts read `recheck.facts.runs` and `.writes`; **Schedule ontology check** |
| Folder not in a Git repository | Out of scope — Automations needs the app | `recheck.sheet.noGit`; the recheck cannot be saved; the person opens Git |
| Off on this Mac (cloned schedule) | Out of scope — Automations needs the app | Strip reads `recheck.allowHere`; **Allow on this Mac** |
| Nothing stale | Out of scope — Automations needs the app | "No changes" with `recheck.none` |
| Loading | Out of scope — Automations needs the app | Existing running stage; **Stop** ends as `recheck.stopped` |
| Done | Out of scope — Automations needs the app | "Rechecked" with `recheck.summary`; **View results** |
| Partial | Out of scope — Automations needs the app | Summary plus `recheck.waiting`, `.skippedUncommitted`, `.ignored`; **Run now** |
| Held (other branch, Git busy) | Out of scope — Automations needs the app | `recheck.heldBranch` or `.heldGit`; switch branch, finish in Git, or edit |
| Error | Out of scope — Automations needs the app | `recheck.noAgent` with **Open Agents**, `.replyUnreadable`, `.commitRefused`, `.interrupted`; **Run now** |
| Undone | Out of scope — Automations needs the app | Concept reads "Undone"; `recheck.undo.done`, `.skipped`, `.failed` or `.gone` |
| Largest measured vault (72 of 90) | Out of scope — Automations needs the app | Ten per run, `recheck.waiting` says 62; at least eight runs |
| To check dialog | Out of scope — the browser cannot read Git history (`projectPages.detail.toCheckEvidenceAppOnly`) | `projectPages.detail.toCheckRecheck` beside the stale group heading |

## Copy

Written under `recheck` in `messages/{en,ko,ja,zh}/automations.json` and in `projectPages.json`;
all four because the catalogue test requires equal keys. No live string changed.

| Key | Where it appears | English |
|---|---|---|
| `recheck.kindLabel` · `kindCheck` · `kindRecheck` | Sheet, first field | "What it does" · "Propose one improvement" · "Recheck concepts whose code changed" |
| `recheck.defaultName` · `sheet.editTitle` | Sheet | "Recheck changed concepts" · "Edit recheck" |
| `recheck.facts.runs` | Lane facts, replacing `ontology.facts.runs.body` | "The coding agent reads the ontology and its linked code. An ontology check proposes one small improvement. A recheck rereads each concept whose code changed after its document." |
| `recheck.facts.writes` | Lane facts, replacing `ontology.facts.writes.body` | "An ontology check changes nothing. A recheck edits only the documents of concepts whose code changed, commits them, and lists every change under Run history, where one press undoes it." |
| `recheck.sheet.description` | Sheet | "At the chosen time the agent rereads each concept whose code changed after its document. Atlas records the documents that are still accurate, edits only the sentences that are not, and commits those documents so you can undo the whole run." |
| `recheck.sheet.limit` · `limitHint` | Sheet | "Concepts per run" · "Between 1 and 25. The concepts that have waited longest go first; the rest wait for the next run." |
| `recheck.sheet.mayRead` | Sheet scope | "Send the agent each concept document and what changed in the files it cites." |
| `recheck.sheet.mayWrite` | Sheet scope | "Edit sentences in the body of those documents and record the commit each was checked at as evidence_checked." |
| `recheck.sheet.mayCommit` · `mayNever` | Sheet scope | "Commit those documents on the branch {branch}. Atlas never pushes." · "Never change a title, kind, code location or relation, any other concept, or a file outside this folder." |
| `recheck.sheet.cost` | Sheet | "No agent run when no concept's code changed. Otherwise one agent run that reads up to {limit} concepts · at most {count} a day at this cadence." |
| `recheck.sheet.noGit` | Sheet | "This folder is not in a Git repository, so a recheck could not commit its changes or undo them. Open Git to make it a repository, then schedule the recheck." |
| `recheck.allowHere` | Off on this Mac strip | "rechecks up to {limit} concepts per run and commits on {branch}" |
| `recheck.outcome` · `viewResults` | Row, run history | "Rechecked" · "View results" |
| `recheck.summary` | Row, run history | "{checked} concepts reread: {accurate} still accurate, {updated} updated, {left} not decided." |
| `recheck.waiting` · `none` | Run history | "{count} more concepts wait for the next run." · "No concept's code changed after its document, so no agent ran." |
| `recheck.skippedUncommitted` | Run history | "{count} concepts were skipped because their documents have changes you have not committed." |
| `recheck.ignored` | Run history | "{count} answers named concepts that were not in this run, so Atlas ignored them." |
| `recheck.noAgent` | Run history | "No coding agent was ready on this Mac, so nothing was rechecked. Open Agents to sign in, then run it again." |
| `recheck.heldBranch` | Row, run history | "Not run: this schedule commits on {allowed} and the repository is on {current}. Switch to {allowed}, or edit the schedule to commit here." |
| `recheck.heldGit` | Row, run history | "Not run: Git cannot commit in this repository right now ({detail}). Finish that in Git, then run it again." |
| `recheck.replyUnreadable` | Run history | "The agent's reply could not be read, so no document was changed. Run it again." |
| `recheck.commitRefused` | Run history | "Git refused the commit: {detail}. Atlas put {count} documents back as before this run and kept the new text in {copy}. Fix what Git reported, then run it again." |
| `recheck.stopped` · `interrupted` | Run history | "Stopped before it finished. No document was changed." · "Atlas closed during this run, so when it opened again it put {count} documents back as before the run." |
| `recheck.dialog.title` · `listLabel` | Results dialog | "Recheck results" · "Concepts in this run" |
| `recheck.dialog.accurate` · `updated` · `left` · `undone` | Results dialog | "Still accurate" · "Updated" · "Not decided" · "Undone" |
| `recheck.dialog.accurateLine` | Results dialog | "The agent reread this document against what changed in {files} and found nothing to change. Atlas recorded the commit it was checked at in the document." |
| `recheck.dialog.updatedLine` · `leftLine` | Results dialog | "The agent changed {count} passages after reading what changed in {files}." · "Atlas changed nothing, so this concept still counts as one whose code changed." |
| `recheck.dialog.agentReason` · `diffLabel` · `openConcept` | Results dialog | "The agent's reason: {reason}" · "What changed in {document}" · "Open on the map" |
| `recheck.dialog.undoOne` · `undoAll` · `undoing` | Results dialog | "Undo this concept" · "Undo this run" · "Undoing…" |
| `recheck.reason.noAnswer` · `noMatch` · `changedMeanwhile` | Results dialog | "The agent's reply did not cover this concept." · "The agent named text to replace that is not in the document." · "The document changed while the agent was reading it." |
| `recheck.reason.heading` · `tooMany` | Results dialog | "The agent asked to change a section heading, which a recheck never changes." · "The agent asked for more than {count} changes. Rewriting a document is a conversation with the agent, not a recheck." |
| `recheck.undo.done` | Results dialog | "Put {count} documents back as they were before this run and committed that. They count as concepts whose code changed again." |
| `recheck.undo.skipped` · `gone` | Results dialog | "{document} changed after this run, so Atlas left it as it is." · "This run's commit is no longer on this branch, so Atlas cannot undo it here. Open Git to restore a document from its history." |
| `recheck.undo.failed` | Results dialog | "Git refused the commit for the undo: {detail}. No document was changed. Fix what Git reported, then press Undo again." |
| `projectPages.detail.toCheckRecheck` | To check dialog, stale group | "Recheck with an agent" |

## Edge cases

- **Zero, one, largest.** Zero stale: no agent. One: a one-document commit. 72, the largest
  measured: the cap holds, the rest wait, 7 diffs are cut.
- **First run.** A document never committed has no date, so it is not stale and is never taken.
- **Hangul.** A schedule name, a body and a cited path in Hangul work unchanged; a passage that
  matches only in another Unicode form does not match and the concept is "Not decided".
- **Dirty tree.** Uncommitted and staged files elsewhere are neither committed nor changed.
- **A person edits the same concept.** Uncommitted before the run: skipped. Changed between the
  agent reading and Atlas writing: left, `recheck.reason.changedMeanwhile`.
- **Interrupted.** Stop during the turn: nothing was written. A quit between writing and
  committing: the next open puts those documents back and adds `recheck.interrupted`.
- **No agent, or offline with a hosted agent.** No document changes; the run says what to do.
- **Folder moved or unreadable:** the existing state (`docs/features/automations.md:44-47`).
  **Vault outside its repository, detached HEAD, merge or rebase, another branch:** held before
  any agent turn. **The run's commit squashed or rebased away:** `recheck.undo.gone`.

## Out of scope

- A concept whose cited file is gone (`missing`): repairing `path:` is a different write.
- Relations, titles and new concepts: a recheck that restructures is a map build.
- Showing `evidence_checked` on the concept, and the code diff in the dialog (Later 1, 2).
- A run without a schedule: the sheet is the one consent for unattended writes.
- Pushing or a pull request: Layer 1 has no remote workflow. The person picks the branch by
  checking it out before allowing.
- A recheck tool in the MCP server for outside agents: a separate public contract.

## Acceptance criteria

1. Given a fresh clone of this repository open in the installed app and a capture of the To check
   dialog showing N stale concepts, when one recheck of ten ends, then the dialog and
   `validate_vault` both report N minus (still accurate plus updated), the commit lists only
   documents from the captured group, and `git status --porcelain` is unchanged. Installed-app
   walk with captures on the pull request; this is the recovery proof.
2. Given three stale concepts and a scripted reply (accurate, one edit, cannot tell), when the run
   ends, then the first document differs only by `evidence_checked` equal to `HEAD` at the start,
   the second by that line and the named passage, and the third is byte-identical and still stale.
   `src/features/library-rounds/model/recheck-apply.test.ts` (new).
3. Given replies naming absent text, a heading, six edits and a concept outside the run, an
   unreadable reply, and a turn asking for `patch_concept`, `add_relations` and a file edit, then
   no document changes, each reason is listed, and each request is refused under Tool activity.
   Same file and `src/features/library-rounds/model/round-scope.test.ts`.
4. Given a committed run, when the person presses Undo this run, then every document equals its
   text at the commit's parent, one new commit exists, and its concepts are stale again in both
   rule implementations; Undo this concept does so for one.
   `tests/contract/analysis/evidence-drift-parity.contract.test.ts` and
   `src-tauri/src/git/evidence/tests.rs`.
5. Given a stale concept with uncommitted changes, another changed vault file and a staged file
   outside the vault, when a run ends, then all three are byte-identical and absent from the
   commit, and the row counts one skipped. `src-tauri/src/git/snapshot/tests.rs`.
6. Given Stop during the turn, a commit hook that exits 1, and a quit between writing and
   committing, then `git status --porcelain` equals its value before the run and the row reads
   `recheck.stopped`, `recheck.commitRefused` with a copy that exists, or `recheck.interrupted`.
   `src/views/library/lib/rounds/recheck-pass.test.ts` (new).
7. Given nothing stale, no agent, another branch, or a schedule that came with a clone, then no
   agent turn is spent and the row reads `recheck.none`, `recheck.noAgent`, `recheck.heldBranch`
   or "Off on this Mac"; given a folder outside Git, the sheet cannot save the recheck. Same file
   and `src/views/automations/ui/NewOntologyRoundSheet.test.tsx`.
8. Given the app in English and in Korean, then the sheet shows the four scope lines and the cost,
   a finished run opens the results dialog with each concept, its diff and both undo presses, and
   the To check dialog shows the entry. `tests/e2e/automations/recheck.spec.ts` (new), looked at
   with `pnpm ui:look`.

## Risks

1. **A wrong "still accurate" hides a stale concept.** Probe before any screen: replay the 20
   judged concepts through the reply format; fewer than 19 matching the reader, or fewer than 4 of
   the 5 edits applying as exact text, changes the format first. Afterwards the falsifier's re-read
   and the one-press undo answer it.
2. **Undo leaves a concept current, because any commit on a document clears stale.** Design
   choice: Atlas marks its undo commits and the rule skips an undo and the run it undoes, in both
   implementations and on the baseline the comment-edit slice reads. Criterion 4 fails otherwise.
3. **A commit lands where the person did not expect, or a hook refuses every run and wastes agent
   turns.** Design choices: a schedule commits only on the branch it was allowed on, Git state is
   checked before the agent turn, and the subject is a fixed English conventional one. Probe:
   commit one `evidence_checked` line in this repository with its hooks on.

## Later

1. Show "checked against the code at <commit>" on the concept and refuse `evidence_checked` from
   an agent's `patch_concept`; next when the owner asks why a concept stopped counting.
2. The code diff the agent read beside the document diff; next when a spot-read leaves Atlas.
3. Recheck concepts whose file is gone and repair `path:`; next when `missing` is counted.
4. A run for chosen concepts from the To check dialog; next when the order is disputed.

## Owner question

None. Decided here, each reversible in one change: a schedule commits only on the branch it was
allowed on (drop the check); a concept a person confirmed may be edited and then reads "changed
since review" (add a skip); ten concepts per run by default (change the default).

## Revisions

- 2026-11-27: first draft from the owner's decision and the 20-concept measurement.
