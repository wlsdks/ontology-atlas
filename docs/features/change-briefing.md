---
title: Change Briefing
doc_type: feature
status: current
area: git
routes: [/changes]
---

# Change Briefing

The Changes destination is a read-only prototype for catching up on a connected
source repository without reading each commit in another Git application.
The existing Git destination remains scoped to vault documents and checkpoints.

Choose a project and a daily, weekly, monthly or yearly calendar period, move
back or forward, or apply inclusive custom dates. The initial period is this
week; weeks start Monday. The displayed local timezone and exact dates determine
committer-time membership. Uncommitted work and separately counted commits
inside merged branches are excluded: this is current-HEAD first-parent history,
including merge integration differences.

The overview leads with measured file activity and direct entries to the six
largest unmapped source areas, alongside the capability groups. Counts describe
file activity, not importance or verified behavior. Reading scope and repository-wide
endpoint comparison live in named disclosures; partial-read warnings stay visible.
Selecting a file folds the touched-file list above its exact comparison; returning to
the overview restores the entry focus. While reading a long comparison, a sticky
header keeps its revision basis and group-scoped previous/next file controls
visible. The file chooser returns to the selected file, including beyond the
first 40 rows. Paths outside the selected group have no group-sequence controls.

Current capability and listed-element implementation anchors group touched
paths. A path can belong to multiple groups, so group totals are not additive.
Unmapped files and commits without touched paths remain inspectable. Current
anchors are navigation context, not reconstructed historical meaning.
Commit subjects are attributed author messages, never verified behavior claims.
Unmapped evidence can be narrowed by literal source-area paths; these are not
capabilities. File and message lists expand in batches of up to 40 while full
counts remain visible. Mapping is limited to capabilities contained in the
selected project; unknown ownership remains unmapped.

A selected group shows its files and commit messages. Select a file to read its
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
explicit. A refresh restores an expired patch snapshot. Calendar inputs and selection survive route changes within the same vault
session, after the source revisions are re-read and match. Dates are retained after
read errors; an obsolete response cannot replace a newer scope.

The browser shows its local-Git capability limit and no fabricated history.
There is no semantic approval, agent attribution, background collection or last-read checkpoint in this prototype.

## Standalone source access

The installed launch chooser also offers Git and PR briefing. Choose a Git repository directly in Changes;
this grants source reading only and does not create/open an ontology or grant vault writes. The chosen repository
must itself be the Git worktree root; choosing a child does not authorize its parent repository.
Models is reachable without a vault and returns to the same repository/calendar. Local connection checks without
a vault use a fixed Atlas app-data audit location and send no repository text. Full commit messages and explicitly fetched public GitHub PR descriptions remain inspectable as author records.
When public GitHub remotes are available, the first recommended action reads PR descriptions, where authors may have recorded reasons and validation. Commit-only explanation remains an explicit alternative with its missing-context limit. PR lookup never starts a model request automatically. A failed refresh keeps previously collected PR versions and the explanation for the same repository and period, with an explicit freshness warning; a successful empty response still replaces them. The app keeps bounded local copies of explicitly read public PR originals (400 records / 16 MiB, 512 KiB per entry). Returning to the granted source and selecting matching history opens eligible saved copies without GitHub or model requests, with their original read times and remotely unchecked coverage. A changed HEAD can reuse eligible integrations; another folder/object or remote cannot. Refresh is explicit. Saved-copy management remains available without a usable source or a nonempty period; clearing all copies preserves open session originals and fences pending saves. Save failures and omissions remain visible. Recognized GitHub rate limits stop the remaining lookup, show the provider retry time when available, and temporarily disable only PR reading until that time. The button becomes available without sending automatically; local sources and explanation previews remain usable.
A connected local text model can propose a passage-cited explanation after a whole-record source preview.
Invalid citations or incomplete model responses are rejected; the original records remain readable.
Coverage limits and author-reported checks are explicit. Transfer metadata is recorded in fixed app data,
without storing source text. Repository, PR descriptions and accepted explanations survive a Models round trip
in tab memory, scoped to the source snapshot and selected period. This prototype has not established explanation quality or user acceptance.

Git/PR author checks and limits are conservative source quotations, eligible only under recognized explicit author section labels. Unsupported model classifications are omitted with partial coverage. Missing or unrecognized records remain unexplained; quoted author observations do not certify current repository health.

Completed-part choices include their first supported theme title as well as ordinal and status. Original readers offer return controls at both ends, naming the source list when opened there and the explanation when opened from a citation, and restoring the exact source button. A completed explanation does not move focus or scroll away from an open original reader.

Period explanations partition all fitting collected complete records into disclosed sequential local requests. Validated parts stay readable in session memory after Stop or a failed request; explicit continuation retries the interrupted stage. A final compact overview uses selected exact original passages rather than generated summaries as evidence, with selected/omitted passage coverage and one part visible at a time. Confirmed responses, uncertain interrupted delivery, unattempted records and citations are separate; none establishes a complete semantic explanation. Source/model/capacity/language changes preserve attributed old results but require a new plan. Oversized or incomplete originals remain named gaps. Closing the app clears this progress.

Changes uses a compact repository/calendar toolbar and exclusive Summary, Sources and Code reading views. Summary presents one report column, with source counts, validity and unchecked-copy provenance kept visible. Coverage contains exact processing/omission accounting, completed-part selection and rejected-response inspection; Settings contains model configuration, public-PR transfer details and saved-copy management even without a usable source. Switching views sends no PR or model request and retains reading position. Exact citations open Sources and return to their claim; list originals return to their row. Leaving Changes and returning in the same app session restores the open original, its reading position and its return target, scoped to the source snapshot and period; expanded source lists remain expanded. Long author checks use exact-source entries instead of repeated full quote blocks, while recorded limits stay visible. Stop and recovery remain reachable while reading Code.
