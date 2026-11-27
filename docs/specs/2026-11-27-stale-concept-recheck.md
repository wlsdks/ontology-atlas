---
title: Automated recheck of concepts whose code changed
doc_type: spec
status: draft
area: automations
date: 2026-11-27
decisions: []
---

# Automated recheck of concepts whose code changed

**In one minute.** Atlas calls a concept *stale* when a code file it cites was committed after the
concept's document. In this repository 76 of 94 concepts are stale, and when a reader checked 20
of them, 15 were still accurate. Nothing today can record "read again, still true", so the count
stays high and stops meaning "read this". This spec adds a schedule, "Recheck concepts whose code
changed", built in two slices:

- **Slice 1, marks only.** An agent rereads each stale concept against what changed in its files.
  When the concept is still accurate, Atlas records in its document the commit it was checked at,
  and commits. A concept the agent finds out of date is listed with the reason and left as it is.
  One press undoes a run.
- **Slice 2, sentence edits.** Atlas also applies the agent's corrections to the sentences that
  are out of date.

Screens never say "stale"; they say "code changed after the document". Slice 1 is built after
`feat/evidence-ignores-comment-edits` merges and after the two probes under Risks pass.

## Person and moment

The owner, a developer who works with coding agents, reads how many concepts no longer stand on
their code and decides whether to trust the map. On 2026-11-27 the owner decided this recheck is
worth building. The standing direction of 2026-11-18, translated: "a person checking every step no
longer makes sense" (`docs/records/decisions/2026-11-18-first-map-written-in-one-run-0f78a22b-d1bc-45db-932a-74616f5f0667.md:7`).

Measured that day: a reader judged 20 random stale concepts of this repository's vault, each body
against `git diff -w <document commit> HEAD -- <file>`. 15 were fully accurate, 5 partly outdated
(a removed feature still listed, a missing exclusion, changed quoted wording, a size or location
claim), 0 wrong. Two of the five outdated claims sat only under `## Uncertainty`; 18 of 20 came
from repository-wide refactors; commit count did not predict which were outdated. The 20 slugs
and verdicts are not in the repository; probe 2 attaches them.

Not observed: the owner reading the count on a screen (no capture; criterion 1 takes one), anyone
learning coding agents, and anyone without an agent, for whom nothing here changes.

## Today

Read at `origin/main` `901e6c398c`. No running screen was looked at: the brief names no port.

- **The rule.** A concept is stale when a cited file's last commit is later than its document's
  newest commit (`mcp/src/drift/evidence-verdict.mjs:46-56`); cited files are its `path:` and its
  elements' (`mcp/src/drift/evidence-drift.mjs:15-46`). Measured with that code: 97 nodes, 94
  concepts cite a file, 76 are stale (24 capabilities, 4 domains, 48 elements; 72 through their
  own `path:`), none has `review_state`. The comment-edit slice is not on `main`; its spec
  promises 10 fewer and this spec's brief about 51. Neither was re-measured.
- **Three counts.** `validate_vault` counts domains, capabilities and elements
  (`evidence-drift.mjs:7`). The project page's To check group lists capabilities only
  (`src/views/project-detail/model/project-to-check.ts:94`) and counts a gone path as stale
  (`src/features/vault-ontology/model/use-map-evidence-states.ts:163`, `:172-173`). The hex
  view's line counts capabilities (`messages/en/topology.json:25`).
- **Nothing records "read again, still true".** Only a new commit on the document clears stale.
  The conversation's "Update N concepts whose code changed" tells the agent to "leave a concept
  unchanged when it still holds" (`messages/en/acpChat.json:396-400`), so an accurate one stays
  stale.
- **Ontology schedules write nothing** (`docs/features/automations.md:94-96`): the brief forbids
  every write tool (`src/features/library-rounds/model/ontology-round-brief.ts:30-36`) and the
  scope refuses Atlas writes, file edits and any file outside the vault
  (`src/features/library-rounds/model/round-scope.ts:103-113`, `:123-126`, `:135-138`).
  `read_source` reads only `sources/`; code is read through `analyze_repo_structure` `sourceReads`
  (`mcp/src/server/tool-definitions/read.mjs:594`). A pass is at most one agent turn
  (`src/entities/library-round/model/round-ledger.ts:41`), one at a time
  (`src/views/library/lib/rounds/use-rounds-runner.ts:311`).
- **Undo in the Documents lane is Atlas's own put-back, not a press.** After the turn Atlas
  restores a page that breaks the draft rules, leaves one a person changed since, and saves the
  removed text under `.ontology-atlas/undone/<pass id>/` (`use-rounds-runner.ts:398-404`,
  `src/features/library-rounds/model/pass-pages.ts:133-166`). A run row has no undo control
  (`src/views/automations/ui/AutomationRunHistory.tsx:110-161`).
- **Git.** A snapshot commits every changed file under the vault, never pushes, refuses a moved
  `HEAD`, and is blocked on a detached HEAD or an operation in progress
  (`mcp/src/git/git-tools.mjs:134-198`, `:228-243`; `src-tauri/src/git/snapshot.rs:219-286`). The
  app keeps hooks on for a commit and sets no `PATH` for it
  (`src-tauri/src/git/runner.rs:69-76`, `:267-271`; `src-tauri/src/lib.rs:98-103`), and this
  repository's hooks need `node` (`.githooks/commit-msg:33-37`, `.githooks/pre-commit:62`, `:82`).
  One document can be restored to a named commit (`src-tauri/src/git/document.rs:250-292`). The
  app reads the remote's default branch from `refs/remotes/origin/HEAD`
  (`src-tauri/src/git/base_line.rs:152-158`). This vault ignores `.ontology-atlas/`
  (`docs/ontology/.gitignore:6`).
- **Writes and keys.** `patch_concept` replaces the whole body
  (`mcp/src/server/tool-definitions/write-concepts.mjs:193-196`); it refuses `created_by`
  (`mcp/src/tools/writes/write-gates.mjs:54-61`). The app patches frontmatter keys in place,
  keeping body, key order, BOM and CRLF
  (`src/entities/docs-vault/lib/authoring/frontmatter-updates.ts:18-77`). The review digest counts
  every unlisted key as meaning, in two copies (`mcp/src/schema.mjs:168`,
  `src/entities/docs-vault/lib/review.ts:27`) held together by `tests/fixtures/review-mark-cases.mjs`.
- **Secrets.** The code reader refuses a path named for keys or passwords, a Git folder and a path
  outside the folder (`src-tauri/src/code_reader/refusal.rs:8-24`, `:162-191`).

Unknown: whether a commit from the installed app passes hooks that need `node` or a signature
(probe 1); whether every app write path keeps an unknown frontmatter key; the on-screen words for
a confirmed concept that changed afterwards, which slice 2's sheet must reuse.

## Problem and alternatives

**Problem (inferred).** The count no longer means "read this": three of four sampled stale concepts
were accurate and no action clears an accurate one. Reading 51 to 76 bodies against diffs by hand
is the per-item review the owner retired.

**Ranked, value against cost.** (1) Recording "still accurate" returns 15 of 20 for one key and one
commit, and leaves a count that again means "read this". (2) Seeing and undoing a run is the
owner's condition for unattended writes. (3) The clock is nearly free. (4) Editing outdated
sentences returns the other 5 and is where a wrong write can happen. Slice 1 is 1 to 3: its only
write is one frontmatter line, and it proves the commit, the dating, the undo and the agent's
"still accurate" before any sentence changes. Slice 2 is 4. An entry from the To check dialog is
cut (Later 2): that dialog lists capabilities only, a different set.

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

New here: the agent holds no write tool, so what a run may change is decided by how Atlas applies
the reply, not by a request to the agent; and a document is dated by its bytes, so any undo makes
it stale again.

| Way | Value | Usability | Feasibility | Why it lost |
|---|---|---|---|---|
| Status quo: the "Update N concepts" suggestion | Accurate concepts stay stale | A person present, no cap | Exists | Cannot clear 15 of 20 |
| Narrow the rule further (comments, cited ranges) | Removes noise only | Invisible | In progress | Cannot judge a changed function body; complements this |
| Agent writes with `patch_concept` in the pass | All 20 | Same | Whole-body replace; a stopped turn leaves half a run | The limit on what changes would be a request |
| **Chosen: read-only turn; Atlas marks and commits (slice 1), then applies edits (slice 2)** | 15 of 20, then all 20 | One run, one commit | New apply step, dating change | |

Every row is local-first: no backend, files and Git only.

**"Still accurate" needs one new key.** The rule turns current only on a newer document commit,
and Git cannot commit an unchanged file. The other homes fail: `reviewed_at` is a person's; a body
line spends the 150-word body and expires a person's confirmation; a file in `.ontology-atlas/` is
a second store this vault does not commit; a whitespace change is a diff that says nothing. So
Atlas writes `evidence_checked: <commit>`, the commit the code was read at (40 or 64 hex
characters), on a domain, capability or element. Only Atlas's recheck writes it: `patch_concept`
and `add_concepts` refuse it beside `created_by`. A value that is not a commit in this repository
is no mark. Both digest copies leave it out, so the mark alone expires no confirmation.
`mcp/src/schema.mjs`, `docs/ONTOLOGY-ATLAS-SPEC.md:329-337` and the `mcp/README.md` table it
mirrors gain the key in the same change.

**A document is dated by its bytes.** The walk dates a document by the first commit at which it
held its present bytes, not by its newest commit, and gives that commit as the baseline the
comment-edit slice reads; `judgeEvidence` is unchanged. A mark is new bytes, so the run's commit
dates it. An undo, a `git revert` or a `git restore` followed by a commit returns earlier bytes, so
the earlier date and the stale verdict return, and a rebase keeps the bytes and the verdict.

**The standing decision this narrows.** Prior: `docs/records/decisions/2026-09-20-automations-hub-schedules-fd3d1a37-534b-43dc-a885-e9193918e096.md`
("It never writes ontology files"; falsifier "a scheduled pass writes an ontology file") and
`2026-09-17-library-rounds-standing-scope-0e82da66-48d2-44f1-a923-82857d7a3710.md` (falsifier "a
node written by a round"). Both stand for the Ontology check and every Documents schedule.
`2026-09-29-round-refuses-atlas-write-drafts-only-5e2f4838-d719-40e6-a0a3-8713d228270a.md` stands
whole: the agent's turn still refuses every Atlas write. Narrowed by slice 1: after a recheck's
turn, Atlas itself may add `evidence_checked` to the concepts that run took. Narrowed further by
slice 2: Atlas may also change sentences in their bodies. *Dissent:* review before a write is
stronger than after; "still accurate" is a model's claim nobody checks, and a false current is
worse than a false stale; text in a diff can steer a run. *Falsifier, slice 1:* a recheck commit
holding a file that was not stale at its start or any change other than the `evidence_checked`
line; or, within 30 days of the first run on this vault, the owner or a model other than the one
that ran it re-reads 20 concepts marked still accurate and finds 2 or more outdated, with slugs
and verdicts written into the decision record. *Falsifier, slice 2:* a changed key other than
`evidence_checked`, or the owner undoes more than one in five updated concepts in 30 days.

## Flow

Steps are slice 1 unless marked.

1. When the person presses **Schedule ontology check** and picks "Recheck concepts whose code
   changed", Atlas shows the cadence, "Concepts per run" (default 10, 1 to 25), four scope lines
   and the cost with the size cap. **Allow and schedule** saves it. The kind is fixed; raising the
   number asks to allow again.
2. When the time comes or the person presses **Run now**, Atlas checks Git first and holds, with
   no agent turn and no commit, when: HEAD is detached; an operation is in progress; the vault is
   outside its repository; a remote default branch is known and is the checked-out branch; or
   Git refused this schedule's last commit (then only **Run now** tries again, and the clock
   resumes once a run commits). With no remote, or no remote default known, the run goes ahead
   on the checked-out branch.
3. Atlas finds the stale concepts of every kind from Git with no agent; with none the run ends
   "No changes". It takes them longest-waiting document first until the cap or 200 KB of documents
   and diffs. It skips a concept whose document or cited file has uncommitted changes, one raised
   with `review_state: human_decides`, and one left "Not decided" before whose document and files
   have not changed since. A concept with a cited path the code reader refuses is listed "Not
   decided" and never sent.
4. Atlas gives one read-only agent turn each document and the diff of its moved files from the
   document's commit to `HEAD`, cut at 400 lines per concept. For a cut diff the agent reads the
   current file with `analyze_repo_structure` `sourceReads` on the bound project source. It
   answers per concept: still accurate; out of date, naming the text and the reason; or cannot
   tell, with a reason. `## Uncertainty` is read like any claim. "Still accurate" needs both: no
   sentence is contradicted, and the change adds, removes or changes no behaviour in the described
   code that the definition, Includes, Excludes or Uncertainty would need to mention (a new
   condition or exclusion, a changed cap, a finding demoted or promoted, a rule moved to a file
   the document names). Renames, comment and import edits, moves of unnamed helpers and changes
   outside the described code do not count. A claim not confirmed against the diff or the current
   code is "cannot tell"; the brief says when in doubt, cannot tell, because a wrong "still
   accurate" hides an outdated description and a wrong "cannot tell" only leaves it for a person.
5. Atlas applies the reply itself, only if `HEAD` is still the start commit. The document comes
   from the run's list, never from the reply. For "still accurate" Atlas adds `evidence_checked`
   through the line patcher and then compares before and after: the body is byte-identical and
   the frontmatter equal except that key. "Still accurate" on a cut diff counts only when tool
   activity shows the read of that file. "Out of date" and "cannot tell" change no document; the
   concept is listed with the agent's reason and the files sent, and stays stale. The outcome
   shown is read from the files.
6. *Slice 2.* An "out of date" answer may carry up to 5 edits, each an exact passage and its
   replacement (empty removes it). A passage is matched in the parsed body only: not empty,
   exactly one match, not across a heading. A replacement is at most 400 characters with no
   heading line; edits do not overlap. Before writing, Atlas compares parsed before and after:
   frontmatter equal except `evidence_checked`, heading lines identical in order. An answer that
   breaks a rule stays "Out of date" with the rule named and no change. A concept a person
   confirmed is edited like any other and then reads as changed since review.
7. When the agent gives no answer for a concept, or the document changed meanwhile, Atlas changes
   nothing for it and lists it "Not decided" with the reason. An answer for a concept outside the
   run is ignored and counted. A reply Atlas cannot read, or a moved `HEAD`, changes no document
   and fails the run.
8. Atlas commits exactly the documents it changed as `docs: recheck N concepts against the code`,
   slugs by outcome in the body, and never pushes. If Git refuses, Atlas puts back each document
   that still holds what it wrote, leaves and names one a person changed since, keeps the new text
   under `.ontology-atlas/undone/<pass id>/`, fails the run and holds the schedule.
9. When the person presses **View results** on the run, a centred dialog lists the concepts by
   outcome; choosing one shows its reason and the files sent (slice 2: also its document diff).
   **Undo this concept** or **Undo this run** commits the earlier text of those documents; one
   changed since is left and named. Undone concepts are stale again.

**Cost.** No agent turn when nothing is stale or the run is held, otherwise one. Measured on the
72 stale through their own path: document plus cut diff is 4 KB at the median; ten are 40 KB, the
oldest ten 134 KB, the worst ten 209 KB, all 72 535 KB. A run sends at most the person's number of
concepts and 200 KB; the sheet states both and each run states what it sent.

**Never touched:** `uid`, `slug`, `kind`, `title`, `path`, relation keys, `display_*`, review keys,
`created_by`, section headings, a concept that was not stale, a file outside the vault,
`finalize_project_meaning`; in slice 1 also every body.

**Rollback.** The recheck kind is no longer offered and saved recheck schedules stop running.
Commits already made stay ordinary history, each undone with Git. `evidence_checked` stays in
documents as a key nothing writes; the write gate and the dating rule stay, being true without it.
Slice 2 rolls back to slice 1 by Atlas ignoring edits in a reply.

## States

The web cell of an Automations row is what `automations.appRequiredDescription` already says there.

| State | Web | macOS app |
|---|---|---|
| Empty (no recheck schedule) | Out of scope — Automations needs the app | Lane facts read `recheck.facts.runs` and `.writes`; **Schedule ontology check** |
| Folder not in a Git repository | Out of scope — Automations needs the app | `recheck.sheet.noGit`; the recheck cannot be saved; the person opens Git |
| Nothing stale | Out of scope — Automations needs the app | "No changes" with `recheck.none` |
| Loading | Out of scope — Automations needs the app | Existing running stage; **Stop** ends as `recheck.stopped` |
| Done | Out of scope — Automations needs the app | "Rechecked" with `recheck.summary` and `recheck.sent`; **View results** |
| Partial | Out of scope — Automations needs the app | Summary plus `recheck.waiting`, `.skippedUncommitted`, `.ignored`; **Run now** |
| Held | Out of scope — Automations needs the app | `recheck.heldGit`, `.heldBranch` or `.heldRefused`; finish in Git, switch branch, or **Run now** |
| Error | Out of scope — Automations needs the app | `recheck.noAgent` with **Open Agents**, `.replyUnreadable`, `.headMoved`, `.commitRefused`, `.interrupted`; **Run now** |
| Undone | Out of scope — Automations needs the app | Concept reads "Undone"; `recheck.undo.done`, `.skipped`, `.failed` or `.gone` |
| Came with a clone | Out of scope — Automations needs the app | `recheck.offHere`; no Allow, no Run now; the person removes it and schedules their own |
| Largest measured vault (76 of 94) | Out of scope — Automations needs the app | Ten per run, `recheck.waiting` says 66; at least eight runs |
| Map evidence line | Out of scope — the browser cannot read Git history (`topology.hexBoard.evidenceAppOnly`) | `topology.hexBoard.evidenceChecked` under the stale count |

## Copy

Written under `recheck` in `messages/{en,ko,ja,zh}/automations.json` and one key in `topology.json`;
all four because the catalogue test requires equal keys. No live string changed. Keys under
`recheck.edits` are slice 2: the first five replace the slice 1 string named beside them.

| Key | Where it appears | English |
|---|---|---|
| `recheck.kindLabel` · `kindCheck` · `kindRecheck` | Sheet, first field | "What it does" · "Propose one improvement" · "Recheck concepts whose code changed" |
| `recheck.defaultName` · `sheet.editTitle` | Sheet | "Recheck changed concepts" · "Edit recheck" |
| `recheck.facts.runs` | Lane facts, replacing `ontology.facts.runs.body` | "The coding agent reads the ontology and its linked code. An ontology check proposes one small improvement. A recheck rereads each concept whose code changed after its document." |
| `recheck.facts.writes` | Lane facts, replacing `ontology.facts.writes.body` | "An ontology check changes nothing. A recheck records, in the document of each concept that is still accurate, the commit it was checked at. It commits those documents and lists them under Run history, where one press undoes it." |
| `recheck.sheet.description` | Sheet | "At the chosen time the agent rereads each concept whose code changed after its document. Atlas records which documents are still accurate and commits them, so you can undo the whole run. A concept the agent finds out of date is listed with the agent's reason and left as it is." |
| `recheck.sheet.limit` · `limitHint` | Sheet | "Concepts per run" · "Between 1 and 25. The concepts that have waited longest go first; the rest wait for the next run." |
| `recheck.sheet.mayRead` | Sheet scope | "Send the agent each concept document and what changed in the files it cites." |
| `recheck.sheet.mayWrite` | Sheet scope | "Record in each document that is still accurate the commit it was checked at, as evidence_checked." |
| `recheck.sheet.mayCommit` | Sheet scope | "Commit those documents on the branch that is checked out when it runs, never on the remote's default branch. Atlas never pushes." |
| `recheck.sheet.mayNever` | Sheet scope | "Never change a sentence, title, kind, code location or relation, any other concept, or a file outside this folder." |
| `recheck.sheet.cost` | Sheet | "No agent run when no concept's code changed. Otherwise one agent run that reads up to {limit} concepts and at most {size} of text · at most {count} a day at this cadence." |
| `recheck.sheet.noGit` | Sheet | "This folder is not in a Git repository, so a recheck could not commit its changes or undo them. Open Git to make it a repository, then schedule the recheck." |
| `recheck.offHere` | Row of a recheck that came with a clone | "This recheck came with the folder and was never allowed on this Mac, so it does not run here. To recheck here, remove it and schedule your own." |
| `recheck.outcome` · `viewResults` | Row, run history | "Rechecked" · "View results" |
| `recheck.summary` | Row, run history | "{checked} concepts reread: {accurate} still accurate, {outdated} out of date, {left} not decided." |
| `recheck.sent` · `waiting` | Run history | "Sent {size} of documents and code changes to the agent." · "{count} more concepts wait for the next run." |
| `recheck.none` | Row, run history | "No concept's code changed after its document, so no agent ran." |
| `recheck.skippedUncommitted` | Run history | "{count} concepts were skipped because their documents have changes you have not committed." |
| `recheck.ignored` | Run history | "{count} answers named concepts that were not in this run, so Atlas ignored them." |
| `recheck.noAgent` | Run history | "No coding agent was ready on this Mac, so nothing was rechecked. Open Agents to sign in, then run it again." |
| `recheck.heldGit` | Row, run history | "Not run: Git cannot commit in this repository right now ({detail}). Finish that in Git, then run it again." |
| `recheck.heldBranch` | Row, run history | "Not run: {branch} is the remote's default branch, and a recheck commits only on a working branch. Switch to a working branch, then run it again." |
| `recheck.heldRefused` | Row, run history | "Not run: Git refused this schedule's last commit ({detail}). Fix what Git reported, then press Run now. The schedule runs by the clock again once a run commits." |
| `recheck.replyUnreadable` | Run history | "The agent's reply could not be read, so no document was changed. Run it again." |
| `recheck.headMoved` | Run history | "The repository moved to another commit during this run, so Atlas changed no document. Run it again." |
| `recheck.commitRefused` | Run history, with `automations.leftAsIs` for a document left | "Git refused the commit: {detail}. Atlas put {count} documents back as before this run and kept the new text in {copy}. Fix what Git reported, then run it again." |
| `recheck.stopped` · `interrupted` | Run history | "Stopped before it finished. No document was changed." · "Atlas closed during this run, so when it opened again it put {count} documents back as before the run." |
| `recheck.dialog.title` · `listLabel` | Results dialog | "Recheck results" · "Concepts in this run" |
| `recheck.dialog.accurate` · `outdated` · `left` · `undone` | Results dialog | "Still accurate" · "Out of date" · "Not decided" · "Undone" |
| `recheck.dialog.accurateLine` | Results dialog | "The agent reread this document against what changed in {files} and found nothing to change. Atlas recorded the commit it was checked at in the document." |
| `recheck.dialog.outdatedLine` | Results dialog | "The agent found text that no longer matches what changed in {files}. Atlas changed nothing, so this concept still counts as one whose code changed." |
| `recheck.dialog.leftLine` | Results dialog | "Atlas changed nothing, so this concept still counts as one whose code changed." |
| `recheck.dialog.agentReason` · `filesSent` | Results dialog | "The agent's reason: {reason}" · "Sent to the agent: what changed in {files}." |
| `recheck.dialog.openConcept` | Results dialog | "Open on the map" |
| `recheck.dialog.undoOne` · `undoAll` · `undoing` | Results dialog | "Undo this concept" · "Undo this run" · "Undoing…" |
| `recheck.reason.noAnswer` · `changedMeanwhile` | Results dialog | "The agent's reply did not cover this concept." · "The document changed while the agent was reading it." |
| `recheck.reason.refusedPath` | Results dialog | "Atlas does not send {path} to an agent, because its name says it holds keys or passwords or it lies outside this folder." |
| `recheck.reason.cutUnread` | Results dialog | "What changed in {path} was too long to send whole and the agent did not read the file, so its answer was not taken." |
| `recheck.undo.done` | Results dialog | "Put {count} documents back as they were before this run and committed that. They count as concepts whose code changed again." |
| `recheck.undo.skipped` · `gone` | Results dialog | "{document} changed after this run, so Atlas left it as it is." · "This run's commit is no longer on this branch, so Atlas cannot undo it here. Open Git to restore a document from its history." |
| `recheck.undo.failed` | Results dialog | "Git refused the commit for the undo: {detail}. No document was changed. Fix what Git reported, then press Undo again." |
| `topology.hexBoard.evidenceChecked` | Hex view, under the stale count | "{count} capabilities are not stale because an agent rechecked the document against the code, not because someone edited it." |
| `recheck.edits.factsWrites` | Slice 2, replaces `recheck.facts.writes` | "An ontology check changes nothing. A recheck edits only the documents of concepts whose code changed, commits them, and lists every change under Run history, where one press undoes it." |
| `recheck.edits.sheetDescription` | Slice 2, replaces `recheck.sheet.description` | "At the chosen time the agent rereads each concept whose code changed after its document. Atlas records the documents that are still accurate, edits only the sentences that are not, and commits those documents so you can undo the whole run." |
| `recheck.edits.mayWrite` | Slice 2, replaces `recheck.sheet.mayWrite` | "Edit sentences in the body of those documents and record the commit each was checked at as evidence_checked." |
| `recheck.edits.mayNever` | Slice 2, replaces `recheck.sheet.mayNever` | "Never change a title, kind, code location or relation, any other concept, or a file outside this folder." |
| `recheck.edits.summary` | Slice 2, replaces `recheck.summary` | "{checked} concepts reread: {accurate} still accurate, {updated} updated, {outdated} out of date, {left} not decided." |
| `recheck.edits.updated` · `updatedLine` · `diffLabel` | Slice 2, results dialog | "Updated" · "The agent changed {count} passages after reading what changed in {files}." · "What changed in {document}" |
| `recheck.edits.noMatch` | Slice 2, results dialog | "The text the agent named is not in the body of the document, or is there more than once." |
| `recheck.edits.heading` | Slice 2, results dialog | "The agent asked to change a section heading, which a recheck never changes." |
| `recheck.edits.tooMuch` | Slice 2, results dialog | "The agent asked for more than {count} changes or a replacement longer than {length} characters. Rewriting a document is a conversation with the agent, not a recheck." |
| `recheck.edits.notApplied` | Slice 2, results dialog | "Applying the agent's changes would have changed something a recheck never changes, so Atlas applied none of them." |

## Edge cases

- **Zero, one, largest.** Zero stale: no agent. One: a one-document commit. 76, the largest
  measured: the caps hold and the rest wait; 7 of the 72 measured diffs are cut.
- **First run.** A document never committed has no date, so it is not stale and is never taken.
- **Hangul, CRLF, BOM.** A schedule name, a body and a cited path in Hangul work unchanged. A
  document's line endings and BOM are as before the run. Slice 2: a passage that matches only in
  another Unicode form does not match.
- **Dirty tree.** Uncommitted and staged files elsewhere are neither committed nor changed.
- **A person edits the same concept.** Uncommitted before the run: skipped. Changed between the
  agent reading and Atlas writing: left, `recheck.reason.changedMeanwhile`. Changed after a
  refused commit: left and named, never put back over.
- **Interrupted.** Stop during the turn: nothing was written. A quit between writing and
  committing: the next open puts back the documents that still hold what Atlas wrote.
- **No agent, offline with a hosted agent, project source not bound.** No document changes; an
  unbound source means a cut diff can only end "Not decided".
- **Signed commits and hooks.** A commit that needs a signature prompt or a hook that fails is a
  refused commit: put back, held, never retried by the clock.
- **A repository with no remote, or a clone whose remote default was never recorded.** Not
  held: the run commits on the checked-out branch, whatever its name.
- **Folder moved or unreadable:** the existing state (`docs/features/automations.md:44-47`).
  **The run's commit squashed or rebased away:** `recheck.undo.gone`; its concepts stay current.
- **A recheck that arrives with a clone:** never runs and cannot be allowed from its row
  (`recheck.offHere`); a folder cannot hand a Mac a schedule that commits.

## Out of scope

- A concept whose cited file is gone (`missing`): repairing `path:` is a different write.
- Relations, titles and new concepts: a recheck that restructures is a map build.
- An entry from the To check dialog and the mark on the concept panel (Later 2 and 3).
- A run without a schedule: the sheet is the one consent for unattended writes.
- Pushing or opening a pull request: Layer 1 has no remote workflow.
- A recheck tool in the MCP server for outside agents: a separate public contract.

## Acceptance criteria

1. **Slice 1.** Given probe 1 passed and a clone of this repository on a working branch, open in
   the installed app, with `validate_vault`'s stale slugs and the hex view's evidence lines
   captured, when one recheck of ten ends with at least one "still accurate", then
   `validate_vault` lists the captured slugs minus the still accurate ones, the commit holds only
   their documents, each differing by the `evidence_checked` line alone, `git status --porcelain`
   is unchanged, and the hex view's count of rechecked capabilities equals the marked
   capabilities. Installed-app walk, captures on the pull request; this is the recovery proof.
2. **Slice 1.** Given three stale concepts and a scripted reply (accurate, out of date, cannot
   tell) in a turn that also asks for `patch_concept`, `add_relations` and a file edit and answers
   for a slug outside the run, then the first document differs only by `evidence_checked` equal to
   `HEAD` at the start, the other two are byte-identical and stale and read "Out of date" and "Not
   decided" with the reason, each request is refused under Tool activity, and the outside answer
   is counted; an unreadable reply changes nothing; `patch_concept` and `add_concepts` naming the
   key are refused; a mark naming an unknown commit counts as none; and a mark alone keeps a
   confirmed concept current in both digest copies.
   `src/features/library-rounds/model/recheck-apply.test.ts` (new),
   `src/features/library-rounds/model/round-scope.test.ts`, the tests beside
   `mcp/src/tools/writes/write-gates.mjs`, `tests/fixtures/review-mark-cases.mjs`.
3. **Slice 2.** Given an "out of date" reply with one valid edit, then the document differs by
   that passage and the `evidence_checked` line, the dialog shows the diff, and a concept a person
   confirmed reads as changed since review. Given replies that plant a passage found only in
   frontmatter, one found twice, an empty one, one across a heading, a replacement with a heading,
   one over 400 characters, overlapping edits and six edits, then no document changes and each
   reads "Out of date" with its rule. `recheck-apply.test.ts`.
4. **Slice 1.** Given a committed run, when the person presses Undo this run or Undo this concept,
   or runs `git revert` on the commit, or `git restore` from its parent and commits, then the
   documents equal their text at the parent and their concepts are stale again in both
   implementations; a rebase of the run's commit leaves them current.
   `tests/contract/analysis/evidence-drift-parity.contract.test.ts` and
   `src-tauri/src/git/evidence/tests.rs`.
5. **Slice 1.** Given a stale concept with uncommitted changes, another changed vault file and a
   staged file outside the vault, when a run ends, then all three are byte-identical and absent
   from the commit; given `HEAD` moves during the turn, no document changes; given a person edits
   a document after a refused commit, it is left and named. `src-tauri/src/git/snapshot/tests.rs`
   and `src/views/library/lib/rounds/recheck-pass.test.ts` (new).
6. **Slice 1.** Given Stop during the turn, a commit hook that exits 1, and a quit between writing
   and committing, then `git status --porcelain` equals its value before the run; after the
   refused commit the next clock run spends no agent turn and reads `recheck.heldRefused`, and a
   Run now that commits lets the clock run again. `recheck-pass.test.ts`.
7. **Slice 1.** Given nothing stale, no agent, or the remote's default branch checked out, then
   no agent turn is spent and nothing is committed; given a repository with no remote, and one
   whose remote default is not recorded, a run commits on the checked-out branch; given a concept
   citing `.env.production`, no byte of that file is sent and it reads
   `recheck.reason.refusedPath`; given a cut diff answered "still accurate" without the read, it
   reads `recheck.reason.cutUnread`; given 25 concepts of 20 KB each, the run sends at most
   200 KB; given a folder outside Git, the sheet cannot save. `recheck-pass.test.ts` and
   `src/views/automations/ui/NewOntologyRoundSheet.test.tsx`.
8. **Slice 1.** Given the app in English and in Korean, then the sheet shows the four scope lines
   and the cost with its size, a finished run shows what it sent and opens the results dialog with
   each concept, its reason and both undo presses, each undo works from the keyboard and returns
   focus to the concept it left, and a recheck from a clone reads `recheck.offHere`.
   `tests/e2e/automations/recheck.spec.ts` (new), looked at with `pnpm ui:look`.

## Risks

1. **Git refuses every commit the app makes.** Probe 1, first and before any agent turn: commit
   one `evidence_checked` line from the installed app in a hooks-on checkout of this repository,
   and in one with `commit.gpgsign`. If it is refused, the commit path is fixed before anything
   else is built. In use, the hold in step 2 stops a refused schedule from spending turns.
2. **A wrong "still accurate" hides a stale concept.** Probe 2, before any screen: replay the 20
   judged concepts through the reply format, plus one cut diff and one diff with a planted
   instruction. Pass: none of the 5 outdated is called accurate, the planted instruction marks
   nothing, and the owner or another model re-reads 5 of the "accurate" and agrees. The 20 slugs
   and verdicts, re-classified under the comment-edit rule, go on the pull request. Afterwards
   the falsifier and one-press undo answer it.
3. **Dating by bytes shifts verdicts or the two walks disagree.** A document once restored to
   earlier bytes turns stale where it read current. Measure this vault before and after the
   change and name every concept that moves; the parity contract in criterion 4 holds the two
   implementations together.

## Later

1. Slice 2, sentence edits (Flow 6, criterion 3, `recheck.edits`); next when slice 1's falsifier
   has not fired 30 days after its first run and a replay of the 5 outdated concepts applies at
   least 4 of their edits as exact text.
2. An entry from the project page's To check dialog that takes first the concepts that dialog
   lists; next when the owner reads the count there instead of in `validate_vault`.
3. Show "checked against the code at <commit>" on the concept; next when the owner asks why a
   concept stopped counting.
4. Recheck concepts whose file is gone and repair `path:`; next when `missing` is counted.

## Owner question

None. The owner delegated three choices to the lead, who decided them on 2026-11-27:

1. **The count that is read** is all concepts, as `validate_vault` counts them. Reverse by
   filtering the run to capabilities and comparing the project page in criterion 1.
2. **A run commits on the checked-out branch** and is held, with no commit and no agent turn,
   only when a remote default branch is known, as `src-tauri/src/git/base_line.rs:152-158`
   reads it, and is that branch. With no remote, or no default known, the run commits on the
   checked-out branch, so a repository without a remote can still recheck. Reverse by removing
   the hold in Flow 2.
3. **Slice 2 may rewrite sentences in a concept a person confirmed**, which then reads as changed
   since review: the 2026-11-18 direction removed the approval step, and the change is seen and
   undone afterwards. Reverse by adding confirmed concepts to the skips in Flow 3.

## Revisions

- 2026-11-27: first draft from the owner's decision and the 20-concept measurement.
- 2026-11-27: revised after independent review ("prove first"). Counts corrected to 76 stale of
  94 and the three surfaces told apart; undo by commit marker replaced by dating a document by
  its bytes; edits confined to the parsed body with a before and after comparison; secret-named
  paths never sent; `HEAD` must not move; a refused commit holds the schedule and never overwrites
  a person's edit; a size cap beside the count; `evidence_checked` refused from agents and counted
  on the map; the To check entry and allowing a cloned recheck cut; rollback stated; the branch
  rule and two other choices returned to the owner as open questions.
- 2026-11-27: the three open questions decided by the lead on the owner's delegation and recorded
  under Owner question; a run is held on the remote's default branch and when none is known. Split
  into two slices: slice 1 marks "still accurate" only and lists out-of-date concepts unchanged,
  slice 2 adds sentence edits; each criterion names its slice, slice 2's strings moved under
  `recheck.edits`, and a one-minute summary opens the spec.
- 2026-11-27: lead decision: a run is held only when a remote default branch is known and is the
  checked-out branch; with no remote, or no default known, it commits on the checked-out branch.
  `recheck.heldNoDefault` and the "can never run" edge case and Later item removed.
- 2026-11-27: Probe 2 failed: replaying the 20 judged concepts through the shipped brief, the
  default model called 2 of the 5 partly outdated ones still accurate (source-inspection-probe,
  wiki-pages); both had gained or demoted behaviour no sentence contradicted. Lead decision: Flow
  step 4 and the brief now require both no contradicted sentence and no behaviour change the
  document would need to mention, and send an unconfirmed claim to "cannot tell"; re-probed on the
  same 20 and on a hold-out of 10 never-judged pairs.
