---
title: Retained answers and explicit revisions
doc_type: contract
status: current
area: library
stores: wiki/answers/
contract_version: 1
enforced_by: [src/features/library/lib/answer-revision.ts]
---

# Retained answers and explicit revisions

Library can be used without code or ontology nodes. Its question entrance lists
the current tips of retained answer histories under `wiki/answers/`. Two tips of
one history remain alternatives; the app does not choose a winner by date.
Earlier pages remain readable through the selected answer and the wiki list.

## Evidence and authority

Atlas answer filing does not modify source originals. A saved answer is a draft interpretation,
not approved ontology meaning or a verified statement. `source_hash` remains
`unmeasured` when the answer has no validated source-read receipt. A passive file
observation is stored separately and never clears that uncertainty.

The screen distinguishes changed cited originals, missing cited originals, new
originals outside the recorded scope, unmeasured versions, and no byte change
since observation. New originals are candidates for consideration, not proven
semantic dependencies of every question.

## Markdown record

These optional fields extend ordinary wiki pages; they do not add ontology kinds
or graph relations. Legacy answer pages remain readable with unknown observation
and history state where no record exists.

| Field | Meaning |
|---|---|
| `answer_question` | The retained question |
| `answer_thread` | Vault-relative slug of the history's first retained answer |
| `answer_previous` | Previous answer slug, absent on a first filing |
| `answer_previous_hash` | SHA-256 of the exact previous Markdown text used in the comparison |
| `answer_observed_at` | Time of the separate source-byte observation |
| `answer_scope_sources` | Original paths available to that observation/refresh scope |
| `answer_source_observations` | Cited original paths mapped to observed SHA-256, or `unmeasured` |

Canonical wiki sections remain Summary, Facts, Decisions, Open questions and Not
in sources. Refresh preserves the proposed section structure. A cited question
must not become a fact merely because it contains a citation. The prior answer
is also linked in the body so history remains navigable as ordinary Markdown.
Initial filing also preserves explicit canonical sections. Unclassified material
in a partly structured response stays in Summary; it is not silently dropped or
promoted to Facts. Unstructured responses retain the existing filing behavior.

Body citations can open the original's source panel with their cited locator.
Unavailable navigation and missing originals are different states. This does not
claim an in-app full-text viewer for every source format.

## Refresh and review

1. The person explicitly asks the connected coding agent for an updated draft.
   The request names the selected question, exact prior text and available
   originals. Provider traffic follows the existing coding-agent boundary.
2. The agent returns a proposal. Automatic wiki-write permission is suspended
   during that refresh. Retained answer paths also require review during ordinary
   source compilation; the compile brief reports affected answers separately.
3. The person compares previous text and proposed text, source-list changes,
   and removed/reworded lines. Narrow screens switch between the two texts.
4. The app rechecks the previous text and observed original bytes, then exclusively
   creates a fresh Markdown file. Existing paths are never overwritten. A failed
   comparison stays visible for correction/retry.
5. A post-create recheck can require further review. This is not an atomic
   transaction over every original and page. The new draft is retained rather
   than deleted, and its recorded observations allow later re-evaluation.

There is no unguarded deletion Undo for a revision: a later human edit must not be
removed by a stale success notification. Original answer filing retains its
existing behavior. Reading and comparing history does not require a new model
call. Starting a refresh does, and the action names the agent request explicitly.

Refresh reuses the existing runtime permissions; it does not create a read-only
filesystem sandbox. The app withholds automatic approval for permission requests
it receives, and its own filing path preserves previous files. An agent's direct
filesystem writes that do not request permission are outside that callback. In
particular, the current Codex adapter follows the existing decision accepting
in-vault direct writes. A read-and-propose prompt is an instruction, not enforcement.
Input rechecks detect a changed previous answer before Atlas files a revision;
they cannot undo or prevent an agent's independent edit.

## Agent and terminal access

An agent can read a retained page with `get_concept` or `get_concepts` using its
vault-relative slug and `body: "full"`. Non-kind wiki pages expose their full
Markdown and metadata without joining the ontology graph. The source-checkout
CLI's `wiki-index <vault> --json` provides the wiki catalogue; a terminal reader
can then read the named Markdown files directly. `wiki-validate` checks the
existing page/folder contract, not entailment or semantic superiority. A newest
answer may still have an advisory orphan finding until another page links it.

The implementation lives in `src/features/library/lib/answer-revision.ts`,
`answer-revision-store.ts`, and the Library view. The ongoing qualification scope
is recorded in [the Library quality program](../plans/LIBRARY-QUALITY-PROGRAM.md).
