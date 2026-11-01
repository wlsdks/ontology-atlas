---
title: Change Briefing
doc_type: feature
status: current
area: git
routes: [/changes]
---

# Change Briefing

The Briefing destination is a read-only prototype for catching up on a connected
source repository without reading each commit in another Git application.
The existing Git destination remains scoped to vault documents and checkpoints.

Choose a project and a daily, weekly, monthly or yearly calendar period, move
back or forward, or open the date control to choose an anchor or apply inclusive custom dates. The initial period is this
week; weeks start Monday. First entry to Custom dates copies the displayed range, including full week, month and year boundaries. Later visits preserve both the applied custom range and any unfinished date draft. The displayed local timezone and exact dates determine
committer-time membership. Uncommitted work and separately counted commits
inside merged branches are excluded: this is current-HEAD first-parent history,
including merge integration differences.

From a commit original, its file action shows only that commit's recorded paths.
From a PR original, the file action shows files touched in the whole selected
period and explicitly identifies that broader scope. File comparisons use the
period endpoints; returning restores the originating original and control.

The Files view leads with measured file activity and direct entries to the six
largest unmapped source areas, alongside the capability groups. Counts describe
file activity, not importance or verified behavior. Reading scope and repository-wide
endpoint comparison live in named disclosures; partial-read warnings stay visible.
Opening a group replaces the group overview; returning clears the selection and
restores focus to its entry. Commit messages have their own top-level view. On wide screens, the independently scrolling file list stays beside
one comparison; on narrow screens, returning to files restores the selected row
and search. The list searches every literal path, including beyond the first 40
rendered rows, and retains its search and scroll position when revisiting a group.
Previous and next follow search matches while a filter is active and the full
group otherwise. If the open file no longer matches, its comparison stays visible
but navigation is disabled until the person selects a match or clears the search.
The comparison keeps its endpoint basis visible; paths outside the selected group
have no group-sequence controls. Added and removed lines retain their literal
prefixes and use distinct neutral treatments without attributing success or failure.

Current capability and listed-element implementation anchors group touched
paths. A path can belong to multiple groups, so group totals are not additive.
Unmapped files and commits without touched paths remain inspectable. Current
anchors are navigation context, not reconstructed historical meaning.
Commit subjects are attributed author messages, never verified behavior claims.
Unmapped evidence can be narrowed by literal source-area paths; these are not
capabilities. File and message lists expand in batches of up to 40 while full
counts remain visible. Mapping is limited to capabilities contained in the
selected project; unknown ownership remains unmapped.

A selected file group contains file navigation only. Select a file to read its
plain-text code comparison inside Atlas. The comparison is explicitly repository-wide, independently of the selected
group. The endpoints are the parent of the
oldest returned commit (empty tree for a root commit) and the newest returned
commit. Reverts can retain touched evidence while leaving no endpoint difference.
Out-of-order dates can include intervening changes outside the chosen dates in
this endpoint comparison; exact revisions and that qualification stay visible.

The project-bound native bridge requires the recorded source binding and source grant, pins
and rechecks root identity, binding and HEAD, and refuses stale evidence. Patch
reads require a recently issued snapshot and its literal touched path. It runs
no external diff/textconv, hooks, network fetch or write operation. Missing or
moved source access offers folder permission recovery and Projects; it never
silently substitutes the vault repository or rebinds the project.
Project-bound reads use the Unix confined metadata reader and remain unavailable on Windows.
Direct picker-granted source reading follows the separate standalone path below.

Reads are bounded at 2,000 first-parent commits, 8 MiB history output and 20,000
path records. Partial reads state that coverage is incomplete. File comparisons
show at most 32 KiB; binary, unavailable, stale and truncated states remain
explicit. An expired patch offers a briefing refresh that reads history again
and returns focus to Code with the chosen period retained. It does not repeat
the expired patch request. Calendar inputs and selection survive route changes within the same vault
session, after the source revisions are re-read and match. Dates are retained after
read errors; an obsolete response cannot replace a newer scope.

The browser shows its local-Git capability limit and no fabricated history.
There is no semantic approval, agent attribution, background collection or last-read checkpoint in this prototype.

## Public pull request inventory

Pull requests are the first view; switching views or periods makes no GitHub or model request. A named public GitHub repository is read only after an explicit action. PRs are selected by their update time in the chosen local dates, across open and closed states; this is not a list of PRs merged in those dates. The moving GitHub list is not an atomic snapshot, so omissions remain possible. Each original shows its repository, version and fetch time; selected originals replace the list and preserve the return target. Long lists can be searched by title or number.

An action reads no more than five pages, 2 MiB and 60 seconds. Pagination can continue explicitly when a safe cursor is available. Fetches are unauthenticated, use fixed GitHub HTTPS endpoints, and send no Git credentials or source code. Errors preserve earlier results and do not establish that a repository or PR is absent. Session memory retains at most 400 original versions and 16 MiB across up to 32 source scopes, and omits originals over 512 KiB. Changed versions and omissions remain visible. Clearing the session copies does not change GitHub. This direct inventory currently supports public github.com repositories only; private account access and ACP explanation are not yet available.

Identified omissions from either the native read or session storage limits remain visible, with any unlisted omissions explicit. PR originals open directly from the list; in-app PR analysis remains unavailable until its agent and data boundaries are verified.

## Standalone source access

The installed launch chooser also offers Git and PR briefing. Choose a Git repository directly in Briefing;
this grants source reading only and does not create/open an ontology or grant vault writes. The chosen repository
must itself be the Git worktree root; choosing a child does not authorize its parent repository.
Models is reachable without a vault and returns to the same repository/calendar. Local connection checks without
a vault use a fixed Atlas app-data audit location and send no repository text. Full commit messages and explicitly fetched public GitHub PR descriptions remain inspectable as author records.
In the earlier combined briefing, an optional action reads public GitHub PR descriptions matched to first-parent commits, where authors may have recorded reasons and validation. The separate commit-only explanation retains its missing-context limit. PR lookup never starts a model request automatically. A failed refresh keeps previously collected PR versions and the explanation for the same repository and period, with an explicit freshness warning; a successful empty response still replaces them. The earlier combined briefing keeps bounded local copies of these matched PR originals (400 records / 16 MiB, 512 KiB per entry); the direct PR inventory uses session memory only. Returning to the granted source and selecting matching history opens eligible saved copies without GitHub or model requests, with their original read times and remotely unchecked coverage. A changed HEAD can reuse eligible integrations; another folder/object or remote cannot. Refresh is explicit. Saved-copy management remains available without a usable source or a nonempty period; clearing all copies preserves open session originals and fences pending saves. Save failures and omissions remain visible. Recognized GitHub rate limits stop the remaining lookup, show the provider retry time when available, and temporarily disable only PR reading until that time. The button becomes available without sending automatically; local sources and explanation previews remain usable.
A connected local text model can propose a passage-cited explanation after a whole-record source preview.
Invalid citations or incomplete model responses are rejected; the original records remain readable.
Korean explanations request Hangul prose. Responses with Han or kana text absent from their cited sent passages are rejected across titles and claims; literal source names remain intact. This detects foreign-script drift, not translation correctness. The reader can inspect a rejected response and explicitly retry without changing the originals.
Coverage limits and author-reported checks are explicit. Transfer metadata is recorded in fixed app data,
without storing source text. Repository, PR descriptions and accepted explanations survive a Models round trip
in tab memory, scoped to the source snapshot and selected period. This prototype has not established explanation quality or user acceptance.

Git/PR author checks and limits are conservative source quotations, eligible only under recognized explicit author section labels. Unsupported model classifications are omitted with partial coverage. Missing or unrecognized records remain unexplained; quoted author observations do not certify current repository health.

Completed-part choices include their first supported theme title as well as ordinal and status. Original readers offer return controls at both ends, naming the source list when opened there and the explanation when opened from a citation, and restoring the exact source button. A completed explanation does not move focus or scroll away from an open original reader.

Period explanations partition all fitting collected complete records into disclosed sequential local requests. Validated parts stay readable in session memory after Stop or a failed request; explicit continuation retries the interrupted stage. A final compact overview uses selected exact original passages rather than generated summaries as evidence, with selected/omitted passage coverage and one part visible at a time. Confirmed responses, uncertain interrupted delivery, unattempted records and citations are separate; none establishes a complete semantic explanation. Source/model/capacity/language changes preserve attributed old results but require a new plan. Oversized or incomplete originals remain named gaps. Closing the app clears this progress.

Briefing uses a compact repository/calendar toolbar and separate Pull requests, Commits and Files views. The earlier combined briefing remains an explicitly labelled separate view with its Overview and Sources modes. Before a summary exists, Overview shows up to five recorded author messages with their source identities and lets the reader open an original directly; it labels an unrequested PR lookup as unchecked. Overview presents one report column, with source counts, validity and unchecked-copy provenance kept visible. Coverage contains exact processing/omission accounting, completed-part selection and rejected-response inspection; Settings contains model configuration, public-PR transfer details and saved-copy management even without a usable source. Switching views sends no PR or model request and retains reading position. Exact citations open Sources and return to their claim; list originals return to their row. Leaving Briefing and returning in the same app session restores the open original, its reading position and its return target, scoped to the source snapshot and period; expanded source lists remain expanded. If the originating explanation has been replaced, returning focuses the current summary heading instead of an unrelated claim. Long author checks use exact-source entries instead of repeated full quote blocks, while recorded limits stay visible. Stop and recovery remain reachable while reading Files.

PR originals render as a single Markdown document for reading, with headings, lists, tables and intact code fences. Source text remains available verbatim, including Markdown syntax; commit messages stay plain text. Embedded images are links only and never load automatically, HTML is not executed, and only explicit HTTP(S) links navigate externally. Citations scroll to the matching rendered block; definition-only passages and citations into the middle of compound blocks fall back to exact text. The reader can still explicitly switch back to formatted reading; that choice and reading position survive route and period returns for the open original. A newly opened citation gets its own precise-text fallback. Source bytes, passage IDs and versions remain unchanged.

The explanation preview leads with source counts, the model and destination. Request totals and any extra overview transfer stay visible before starting; exact bytes, execution details and original text are available on demand. Unsendable sources remain visible, and generated explanations and progress are explicitly session-only. Inspecting or cancelling a plan sends no model request.
