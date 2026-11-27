---
title: Changes
doc_type: feature
status: current
area: git
routes: [/changes]
---

# Changes

Changes answers "what was merged, and which few changes deserve my own eyes?"
for a connected source repository, without reading each commit in another Git
application. The Git destination remains scoped to vault documents and checkpoints.

Without a chosen repository, Changes shows a dedicated entry with one Git folder
action and a diagram of history drawn into measured groups. The diagram contains
no repository results. Cancelling the picker restores focus to the action.

## Digest

Changes opens on a digest of the most recent day that has changes. When today
has none, it reads widening windows back from today (7, 31 and 366 days, then
the whole history) and opens the day of the newest change it finds. The digest
is built only from local history; it makes no agent, model or network request.

The digest uses the workbench page width.

- **Headline.** One number: the changes merged in the period, with the count of
  distinct files they touched. Under it, the kinds of work, drawn as one
  segmented bar over a legend of counts: each title's
  conventional-commit type exactly as its author typed it (`feat`, `fix`), the
  five most used first and the rest, including titles without a type, summed
  under "Other changes". The line is not drawn when under half the titles carry
  a type.
- **Timeline.** Beside the headline, when the period's changes were merged. A
  day draws its 24 hours with one tick per change at its local commit minute;
  ticks too close to draw apart stack upward. A week, a month or custom dates up
  to 62 days draw one column per day, and a year or longer custom dates one
  column per week starting Monday, each column's height the square root of its
  count. Notable changes take the accent. Each tick or column is a button named
  by its time or date and count; pointing at or focusing it names its newest
  title, and pressing it selects that change in its group. An empty period
  draws the empty axis.
- **Worth a look.** Cards of equal height, each leading with its reason, then
  the title, number and time, and up to three recorded concepts it touches,
  linking to the map. Pressing a card selects that change. At most three changes, each listed once, filled in this
  order: reverts (title starting with "revert" after any `Merge #N:` prefix, or
  "This reverts commit" in the message); changes marked breaking by their author
  (`!` before the title's colon, or "BREAKING CHANGE" in the message); changes
  touching two or more recorded concepts, most first; changes touching at least
  30 files and three times the period's median, most first. Ties go to the newest.
  With none qualifying the strip is not drawn. Size is a file count, never an
  importance claim.
- **Groups.** A change belongs to the label in brackets in its title
  (`fix(map): …` is `map`), read after any `Merge #N:` or `Merge #A #B:` prefix (a hosted
  `Merge pull request #N from …` takes its first body line) and lower-cased.
  When under half the titles in the period carry a label, changes group by the top-level
  directory holding most of their files instead. The seven largest groups are
  named, ordered by count then name; every other change joins "Other changes",
  always last, so the group counts add up to the headline. The groups are a
  list beside the selected group, nothing unfolds in place. Each group shows
  its count, its newest title and a bar of its count against the largest group,
  split into the headline's kinds of work; the largest named group's bar
  carries the accent, the rest are neutral steps.
- One group is always selected, the first on arrival; arrow keys, Home and End
  move the selection. Beside the list the selected group names up to three
  recorded concepts whose implementation paths its files touch, each linking to
  the map, and lists its changes (time, title, `#number`) newest first, 40 at a
  time. On narrow screens the list sits above the selected group.
- Pressing a change shows its detail (description, changed files, read commit)
  beside the whole list where the selected group's pane is at least 820px wide,
  and under a shortened list where it is narrower. Close, Escape or pressing
  the row again closes it and returns focus to the row. A
  change's GitHub link appears only when the repository has exactly one
  github.com remote. Reading the commit opens it in Originals; going back
  returns focus to that row with the same group and change selected.

A read cut short by the change or size limit says how many of the newest
changes were counted; any other limited read says only that it is limited. An empty
period keeps the band with a quiet zero and the empty axis; below it, centred in
the remaining height, the shared empty stage says nothing was merged and, when
history holds a newer change, offers the latest changes. While history is read, the waiting mark stands in the centre of the
content area.

## By release

**By date | By release** sits first in the period bar; By date is the default and reads as above.
By release lists the repository's releases beside the digest, read from the tags of the copy on
this computer. Atlas never fetches, creates, moves or deletes a tag.

- **What a release is.** One release per tagged commit; several tags on one commit are one release
  with every name, and lightweight and annotated tags are alike, dated by the tagged commit. A tag
  name is the text before its version number (`v`, `web@`, or nothing) and the version; tags
  sharing that text form one sequence, and a name without a version stands alone. A release holds
  the first-parent changes after the nearest earlier tag of its sequence on the line behind it, up
  to its own tag; a release without a pre-release suffix skips its own version's pre-releases, and
  one with no earlier tag starts at the first commit. Unreleased is the read branch's changes after
  the newest release on it. A tag on a tree or a file is not a release.
- **The list** is drawn as the branch: one line with a mark per release, rows of one height, newest
  first by position on the read branch. A filled disc in three sizes marks which number changed
  (major, minor, patch); a ring marks a pre-release; Unreleased is the line's open top end, a
  dotted ring above a dashed run; a tag off the branch sits beside the line on a short stub at its
  date and says so. Each row names its tags in the mono face, its date, its count and a bar whose length is the square root
  of the count against the largest, split into kinds as group bars are. The selected row alone
  carries the accent, and the line thickens from the selected release to where its span starts.
  Forty rows are drawn, then Show more. Find a release filters by any name in one Unicode form;
  with two or more sequences a chooser narrows to one. Where the list and a 640px pane do not fit
  side by side, the list becomes one Select above the pane.
- **Progress.** Names and dates arrive in one read and paint first; counts and bars fill newest
  first as a walk of the read branch arrives in steps of 20,000 changes, and selecting or typing
  works throughout. Unreleased is selected on arrival when it holds a change, otherwise the newest
  release. A tag off the branch, or one past the counted depth, is counted when selected.
- **The pane** shows the tag names and date, Since (every earlier release on the same line and the
  first commit), then the digest above for the span, with the recorded concepts whose files changed
  under the headline (name and change count, most first, twelve then Show more, each opening the
  map), or a plain statement that none did. A repository picked alone draws no concept strip.
  Read commit opens the span in Originals, whose patches compare the span's own ends.
- **Limits and states.** Tags are read up to 10,000, the walk up to 100,000 changes, and a span
  keeps the 2,000-change, 8 MiB and 20,000-path limits, each saying what it left out: a span cut
  short, releases beyond the counted depth, a shallow clone, and names that are not text. A
  repository without tags shows the empty stage and says to fetch tags in the repository. A tag
  or branch that moves between reads makes the next read stale with Refresh, keeping the release
  and Since by name. A reload of the ontology folder does not read the tags again; Refresh does.
  The basis under the pane says what was read.
- **Reads.** The list, the walk and a span are three bounded local reads, project-bound or picked
  as the date reads are. A tag name is display text only: it is cut at 256 characters, loses
  control characters, is not listed when it is not UTF-8, and never returns to Git as an argument.
  The walk and a span take only commit hashes the list issued, and the list's snapshot ties them to
  the tags and branch it read.

## Originals

Originals, in the header, holds the pull request, commit and file readers for
the same period, unchanged; "Back to summary" returns to the digest and to the
Originals control. The period controls (Day, Week, Month, Year, Custom dates,
previous and next, the date dialog, today and Read again) stay on both views.
Leaving Changes and returning in the same app session restores the view left.

Choose a project and a calendar period, move back or forward, or open the date
control to choose an anchor or apply inclusive custom dates. The initial period
is the latest day with changes; weeks start Monday. First entry to Custom dates copies the displayed range, including full week, month and year boundaries. Later visits preserve both the applied custom range and any unfinished date draft. The displayed local timezone and exact dates determine
committer-time membership. Uncommitted work and separately counted commits
inside merged branches are excluded: this is the first-parent history of the
branch the checked-out work merges into, including merge integration
differences. The integration branches are the one `origin/HEAD` names, then
`main`, `master`, `develop`, `development`, `dev` and `trunk`. A checkout on one
of them reads it, so a team that merges into `develop` sees develop's merges; any
other checkout reads the one holding the most of its history (fewest of HEAD's
commits outside it), so a feature branch never counts its own unmerged commits
as merged. Each is read at the fetched `origin/<branch>` unless the local branch
is strictly ahead of it or has diverged without tracking it. A failed read of
the candidates reads nothing rather than falling back to HEAD. "What was read" names the branch. A repository with no
integration branch reads HEAD; a line whose tip is not a commit reads nothing.

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
and rechecks root identity, binding and the base branch's tip, and refuses stale evidence. Patch
reads require a recently issued snapshot and its literal touched path. It runs
no external diff/textconv, hooks, network fetch or write operation. Missing or
moved source access offers folder permission recovery and Projects; it never
silently substitutes the vault repository or rebinds the project.
Project-bound reads use the Unix confined metadata reader and remain unavailable on Windows.
Direct picker-granted source reading follows the separate standalone path below.

Reads are bounded at 2,000 first-parent commits, 8 MiB history output and 20,000
path records. Partial reads state that coverage is incomplete. File comparisons
show at most 32 KiB; binary, unavailable, stale and truncated states remain
explicit. An expired patch offers Read again, which reads history again
and returns focus to Code with the chosen period retained. It does not repeat
the expired patch request. Calendar inputs and selection survive route changes within the same vault
session, after the source revisions are re-read and match. Dates are retained after
read errors; an obsolete response cannot replace a newer scope.

There is no semantic approval, agent attribution, background collection or last-read checkpoint.

## Public pull request inventory

Pull requests are the first reader in Originals; switching views or periods makes no GitHub or model request. A named public GitHub repository is read only after an explicit action. PRs are selected by their update time in the chosen local dates, across open and closed states; this is not a list of PRs merged in those dates. The moving GitHub list is not an atomic snapshot, so omissions remain possible. Each original shows its repository, version and fetch time; selected originals replace the list and preserve the return target. Long lists can be searched by title or number.

An action reads no more than five pages, 2 MiB and 60 seconds. Pagination can continue explicitly when a safe cursor is available. Fetches are unauthenticated, use fixed GitHub HTTPS endpoints, and send no Git credentials or source code. Errors preserve earlier results and do not establish that a repository or PR is absent. Session memory retains at most 400 original versions and 16 MiB across up to 32 source scopes, and omits originals over 512 KiB. Changed versions and omissions remain visible. Clearing the session copies does not change GitHub. This direct inventory currently supports public github.com repositories only; private account access and ACP explanation are not yet available.

Identified omissions from either the native read or session storage limits remain visible, with any unlisted omissions explicit. PR originals open directly from the list; in-app PR analysis remains unavailable until its agent and data boundaries are verified.

## Standalone source access

The installed launch chooser also offers Changes. Choose a Git repository directly in Changes;
this grants source reading only and does not create/open an ontology or grant vault writes. The chosen repository
must itself be the Git worktree root; choosing a child does not authorize its parent repository.
Models is reachable without a vault and returns to the same repository/calendar. Local connection checks without
a vault use a fixed Atlas app-data audit location and send no repository text. Full commit messages and explicitly fetched public GitHub PR descriptions remain inspectable as author records.
In the earlier combined briefing, an optional action reads public GitHub PR descriptions matched to first-parent commits, where authors may have recorded reasons and validation. The separate commit-only explanation retains its missing-context limit. PR lookup never starts a model request automatically. A failed refresh keeps previously collected PR versions and the explanation for the same repository and period, with an explicit freshness warning; a successful empty response still replaces them. The earlier combined briefing keeps bounded local copies of these matched PR originals (400 records / 16 MiB, 512 KiB per entry); the direct PR inventory uses session memory only. Returning to the granted source and selecting matching history opens eligible saved copies without GitHub or model requests, with their original read times and remotely unchecked coverage. A moved base-branch tip can reuse eligible integrations; another folder/object or remote cannot. Refresh is explicit. Saved-copy management remains available without a usable source or a nonempty period; clearing all copies preserves open session originals and fences pending saves. Save failures and omissions remain visible. Recognized GitHub rate limits stop the remaining lookup, show the provider retry time when available, and temporarily disable only PR reading until that time. The button becomes available without sending automatically; local sources and explanation previews remain usable.
A connected local text model can propose a passage-cited explanation after a whole-record source preview.
Invalid citations or incomplete model responses are rejected; the original records remain readable.
Korean explanations request Hangul prose. Responses with Han or kana text absent from their cited sent passages are rejected across titles and claims; literal source names remain intact. This detects foreign-script drift, not translation correctness. The reader can inspect a rejected response and explicitly retry without changing the originals.
Coverage limits and author-reported checks are explicit. Transfer metadata is recorded in fixed app data,
without storing source text. Repository, PR descriptions and accepted explanations survive a Models round trip
in tab memory, scoped to the source snapshot and selected period. This prototype has not established explanation quality or user acceptance.

Git/PR author checks and limits are conservative source quotations, eligible only under recognized explicit author section labels. Unsupported model classifications are omitted with partial coverage. Missing or unrecognized records remain unexplained; quoted author observations do not certify current repository health.

Completed-part choices include their first supported theme title as well as ordinal and status. Original readers offer return controls at both ends, naming the source list when opened there and the explanation when opened from a citation, and restoring the exact source button. A completed explanation does not move focus or scroll away from an open original reader.

Period explanations partition all fitting collected complete records into disclosed sequential local requests. Validated parts stay readable in session memory after Stop or a failed request; explicit continuation retries the interrupted stage. A final compact overview uses selected exact original passages rather than generated summaries as evidence, with selected/omitted passage coverage and one part visible at a time. Confirmed responses, uncertain interrupted delivery, unattempted records and citations are separate; none establishes a complete semantic explanation. Source/model/capacity/language changes preserve attributed old results but require a new plan. Oversized or incomplete originals remain named gaps. Closing the app clears this progress.

Originals uses the repository/calendar toolbar and separate Pull requests, Commits and Files views. The earlier combined briefing remains an explicitly labelled separate view with its Overview and Sources modes. Before a summary exists, Overview shows up to five recorded author messages with their source identities and lets the reader open an original directly; it labels an unrequested PR lookup as unchecked. Overview presents one report column, with source counts, validity and unchecked-copy provenance kept visible. Coverage contains exact processing/omission accounting, completed-part selection and rejected-response inspection; Settings contains model configuration, public-PR transfer details and saved-copy management even without a usable source. Switching views sends no PR or model request and retains reading position. Exact citations open Sources and return to their claim; list originals return to their row. Leaving Changes and returning in the same app session restores the open original, its reading position and its return target, scoped to the source snapshot and period; expanded source lists remain expanded. If the originating explanation has been replaced, returning focuses the current summary heading instead of an unrelated claim. Long author checks use exact-source entries instead of repeated full quote blocks, while recorded limits stay visible. Stop and recovery remain reachable while reading Files.

PR originals render as a single Markdown document for reading, with headings, lists, tables and intact code fences. Source text remains available verbatim, including Markdown syntax; commit messages stay plain text. Embedded images are links only and never load automatically, HTML is not executed, and only explicit HTTP(S) links navigate externally. Citations scroll to the matching rendered block; definition-only passages and citations into the middle of compound blocks fall back to exact text. The reader can still explicitly switch back to formatted reading; that choice and reading position survive route and period returns for the open original. A newly opened citation gets its own precise-text fallback. Source bytes, passage IDs and versions remain unchanged.

The explanation preview leads with source counts, the model and destination. Request totals and any extra overview transfer stay visible before starting; exact bytes, execution details and original text are available on demand. Unsendable sources remain visible, and generated explanations and progress are explicitly session-only. Inspecting or cancelling a plan sends no model request.
