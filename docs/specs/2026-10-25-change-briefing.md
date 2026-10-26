---
title: Change Briefing
doc_type: spec
status: current
area: git
date: 2026-10-25
decisions: [7b6e7bc7-9091-498f-b3c1-cc192cccae8f, 390e91c6-2985-4a1c-ac5e-2e50b1e81ebe]
---

# Change Briefing

## Person and moment

The owner reports hundreds of AI-agent commits per day and cannot follow them one
by one. They explicitly requested an Atlas prototype for daily, weekly, monthly,
yearly and custom-date understanding on 2026-10-25. The desired recovery is to
identify which recorded capabilities have source changes, inspect their evidence,
and see what Atlas could not classify without first opening an external Git UI.
This is an observed request, not a measured comprehension result.

## Today

- The current product thesis names delegated-change understanding and rejects
  treating the producing agent's summary as independent proof
  (`docs/PRODUCT-DIRECTION.md:24`, `docs/PRODUCT-DIRECTION.md:52`).
- Existing Git reads and checkpoints the vault's own meaning documents; its
  destination preserves that job (`docs/features/git.md:35`). The read capability
  `capabilities/vault-git-history` explicitly excludes source-repository history.
- Source evidence already resolves a vault/project binding, checks source grants,
  verifies identity and resolves source HEAD (`src-tauri/src/git/evidence/bound.rs:74`).
  That is a reading seam, not an existing period briefing.
- The first native weekly checkpoint read 28 first-parent commits and 566 touched
  paths: only three paths matched two capability groups, leaving 563 unmapped
  (`/tmp/atlas-change-briefing-8mFYm9/03-native-checkpoint.png`, corresponding AX
  capture; observed by the lead). This makes a flat unmapped file list insufficient
  for the requested catch-up flow; source-area drilldown is required below.

## Problem and alternatives

Priority is (1) follow many changes by recorded product responsibility, (2) retain
inspectable evidence and missing coverage, (3) later recover actual rule changes.
The first two establish a trustworthy daily entry; the third needs stronger
source interpretation than commit messages and is not disguised as shipped here.

| Option | Value and usability | Feasibility and local-first fit | Decision |
|---|---|---|---|
| Existing Git unchanged | Preserves vault checkpointing but requires source commits to be read elsewhere | No cost; existing scope | Reject for this request: the stated inability survives |
| Add a source-period tab inside Git | Reuses discovery but puts source comprehension beside vault-writing actions and hides the repeat entry | Moderate cost, fully local | Reject for this slice: different scope and primary action |
| Separate Changes destination | Opens on a selected period and capability groups; detail keeps source evidence in Atlas | New navigation and bounded native read; fully local | Selected by the owner's accepted recommendation |

First slice: `/changes`, labelled by `navLabel`, reads one connected project's
current local HEAD history at a time. Deterministic grouping uses current
capability/element implementation anchors, preserving every unmapped path and
multiple valid memberships. Only anchors whose capability/element ownership is
confirmed through the selected project and its declared domains may match; a
same-path anchor belonging only to another project cannot classify a change.
Missing or uncertain ownership leaves a path unmapped. A group is a navigation aid, never an accepted
semantic change, runtime impact, test result, or author identity verdict.

## Selected presentation direction

The owner rejected the hard-to-scan presentation and authorized the recommended
briefing-first direction on 2026-10-25. The lead coordinates and implements it.
The attention winner is the measured distribution of touched files, followed by
current capability groups; source scope and full-repository comparison recede
behind named disclosures. File counts never stand for severity or verified
behavior. The main element owns reading scroll; period controls, overview
return, group choice and exact file basis remain reachable in that flow.

- A, status quo: keep the split group/evidence list with lighter chrome. Lowest
  migration cost; rejected because most activity remains hidden in one unmapped
  bucket. Wrong if people cannot choose a reading start without expanding it.
- B, selected: period, activity overview, selected evidence. Six largest literal
  unmapped source areas are direct reading entries; capability groups retain
  all mapped/unmapped counts. Cost: an overview precedes raw evidence. Wrong if
  a reader cannot identify a starting area and open a changed file from it.
- C, rejected: date-first timeline. Makes chronology explicit but preserves the
  commit-volume problem. Wrong if a high-volume day becomes another long list.

All States and acceptance criteria below remain in scope. The Ready and
Unmapped source-area overview states gain direct area entries; choosing one
sets the existing unmapped group and exact area in one action. Reading-scope
metadata is disclosed on demand; partial/capped warnings remain visible.
The selected evidence follows the overview. Its touched-file disclosure starts open and folds when a file is selected,
keeping the file switcher beside the selected comparison. A sticky reading
header retains the exact revision basis and previous/next actions within the
selected group or source area. Endpoints disable unavailable directions without
wrapping. Keyboard activation retains the direction control where enabled.
`chooseFile` reopens the list, reveals the batch containing the selected file,
and focuses that file. A repository-wide comparison path outside the selected
group offers no group-sequence controls, so its context is never misrepresented. It precedes the
repository-wide endpoint disclosure, whose scope and caveat stay together.
Direct-area reading folds the other area choices behind their named disclosure;
the selected literal area and its counts remain visible. The overview return restores the entry's keyboard focus without discarding the
selected evidence, preserving the existing group-return contract.

New Copy keys: `overviewTitle`, `overviewHint`, `filesLabel`, `commitsLabel`,
`mappedHeading`, `sourceAreasHeading`, `readBasis`, `fileCount`, `areaAction`,
`areasShown`, `overviewStep`, `evidenceStep`. Exact English and
Korean text is in the named message catalogues. File reading also uses
`previousFile`, `nextFile`, `chooseFile`, `filePosition`, and `groupFiles`. No state or prior capability
is removed. Native baseline: `/tmp/atlas-briefing-redesign/00-baseline.png`.

## Flow

1. When the person enters Changes, Atlas shows the selected project, Weekly for
   this week, and a brief explanation; it reads only that project's granted source.
2. When they select Daily, Weekly, Monthly or Yearly, an anchor date chooses the
   calendar period. Weeks start Monday. Previous/next moves one entire period;
   Current period returns to the current local calendar period. Custom dates
   use an explicit Read this period action and include both endpoints.
3. When history loads, Atlas shows local timezone, source folder, captured HEAD,
   first-parent scope, returned counts, grouped capabilities and unmapped files.
   Period membership uses committer time in the shown local date interval.
   Only first-parent commits are counted, including integration merges; commits
   inside merged branches are not individually counted or fully summarized.
4. When they choose a group, Atlas shows unique touched paths, attributed commit
   messages and the endpoint comparison with exact revision ids. Counts are
   distinct within a group; overlapping groups do not imply additive totals.
   Selecting a touched or net-changed file reads its endpoint patch inside Atlas,
   one file at a time, as plain text with added/removed lines and exact revisions.
   The patch is limited to 32 KiB; truncation is explicit, never complete evidence.
   Binary, unavailable and no-net-difference outcomes keep paths/messages visible
   and offer a file retry where reading failed. No external Git UI is required.
   Selecting the unmapped group exposes source-area subgroups with full counts.
   Areas use repository-relative canonical paths: `src/views/<module>`,
   `src/features/<module>`, `src/widgets/<module>`, `src/entities/<module>`,
   `src/shared/<subdirectory>`; other paths use their first folder, and files
   without a folder use `rootFiles`. A short path missing that third component
   stays in its available source folder. These are source locations, never
   capability claims, and `sourceAreaNote` remains visible.
   Choosing an area restricts touched paths, associated messages and selectable
   patches to that area; `allUnmapped` restores the whole unmapped scope. The
   overall unmapped count stays visible. File and commit-message lists initially
   show 40 rows each, with visible show-more actions revealing batches of 40;
   all counts always describe the full returned scope, not the rendered batch.
   A scope/area change clears any selected file outside the new area and rejects
   obsolete patch responses. Files already shown remain reachable by keyboard.
5. When a commit's message claims behavior that Atlas cannot verify, it remains
   an attributed message. No generated behavior headline presents that claim as
   fact. Current capability names describe grouping context, not historical truth.
6. When a comparison is unavailable, a read is partial, or no anchor matches,
   Atlas states the missing evidence and keeps the evidence that was read.
7. When they refresh or change project/period, old evidence cannot appear under
   new scope. Folder/HEAD/binding changes during a read invalidate that snapshot.
   Selecting a mapped capability can open its existing map detail. Returning
   restores calendar inputs, selected group/area/file and expanded rows in this
   vault session, only after a fresh read matches the same source and revisions.
   This transient view memory is not a last-read checkpoint or accepted evidence.

Endpoint comparison is explicitly repository-wide, independent of the selected
group, and separate from touched-file activity: use the parent of
the oldest returned first-parent commit (empty tree for the root) and the newest
returned commit. Dates need not be monotonic; intervening commits outside the
selected dates may affect endpoint results, so `comparisonNote` stays visible.
A partial read compares only its disclosed returned endpoints. No retained
endpoint difference does not erase touched commits or imply no product change.
The root comparison uses the empty tree before the first commit and labels it
with `initialTree`; a newly added text file shows its added lines against that
basis. Choosing another file or scope invalidates any pending patch response.

## States

The browser recovery also reuses `navRail.getApp` as its Download link.
Keys below belong to `changeBriefing`; all retained controls remain keyboard
reachable. The rail still provides escape from an unavailable state.

| State | Web | macOS app |
|---|---|---|
| No vault/project | `webTitle`, `webBody`; existing navigation | `noVault` or `noProject`; `openProjects` |
| Missing grant/binding, moved/unreadable source | `webTitle`, `webBody`; open installed app externally | `sourceUnavailable`; `openProjects`, then `retry` |
| No readable committed history | `webTitle`, `webBody` | `noHistory`; choose another project or retry |
| Loading | `webTitle`, `webBody` | `loading`; selected dates/project remain visible; obsolete response ignored |
| Ready | No synthetic history or fixture pretending to be real | `totals`, `coverage`, `groupingNote`; group selection opens `evidence` |
| Empty | `webTitle`, `webBody` | `empty`, `emptyHint`; all period controls remain usable |
| Invalid custom range | No local history controls offered | `invalidRange`; keep both inputs and fix dates before reading |
| Error | `webTitle`, `webBody` | `readError`; `retry`, keeping dates/project |
| Concurrent source change | `webTitle`, `webBody` | `stale`; `refresh`, no mismatched snapshot displayed |
| Partial/capped | `webTitle`, `webBody` | `partial`, `limit`; keep returned evidence and narrow dates |
| No matching anchors | `webTitle`, `webBody` | `unmapped`, `unmappedHint`; inspect all returned paths/messages |
| Unmapped source-area overview | `webTitle`, `webBody` | `sourceAreas`, `sourceAreaNote`; choose an area with its full path/commit counts |
| Unmapped source area selected | `webTitle`, `webBody` | `sourceAreaNote`, `allUnmapped`; only that area's paths/messages/patch choices; whole-unmapped count retained |
| Long file or commit-message list | `webTitle`, `webBody` | `showMoreFiles` or `showMoreCommits` after each 40 rows; full counts remain visible |
| Reverted net changes | `webTitle`, `webBody` | `netEmpty`; touched-file/commit counts remain visible |
| Endpoint read unavailable | `webTitle`, `webBody` | `netUnavailable`; paths/messages remain inspectable |
| File patch not selected | `webTitle`, `webBody` | `patchSelect`; choose a file with `patchAction` |
| Long file comparison reading | `webTitle`, `webBody` | Sticky filename/basis and `groupFiles` navigation; `previousFile`, `nextFile`, `filePosition`, `chooseFile` stay reachable; no group sequence for an outside-group endpoint path |
| File patch loading | `webTitle`, `webBody` | `patchLoading`; keep source scope and file list visible |
| Text patch ready | `webTitle`, `webBody` | `patchTitle`, `patchBasis`; read plain-text changed lines inside Atlas |
| Text patch truncated | `webTitle`, `webBody` | `patchTruncated`; bounded 32 KiB prefix, choose another file |
| Binary patch | `webTitle`, `webBody` | `patchBinary`; paths/messages remain available |
| File patch unavailable | `webTitle`, `webBody` | `patchUnavailable`, `patchRetry`; preserve paths/messages |
| File has no endpoint difference | `webTitle`, `webBody` | `patchNoDifference`; inspect touch evidence or choose another file |
| Root commit patch | `webTitle`, `webBody` | `initialTree`, `patchBasis`; read added text against empty tree |
| Largest measured source | `webTitle`, `webBody` | Same ready/partial states, bounded at 2,000 commits plus explicit byte/path limits; lead records measured counts and capture before claiming proof |

## Copy

Exact English and Korean values live in `messages/en/changeBriefing.json` and
`messages/ko/changeBriefing.json`. The rail references `navLabel` from this namespace.
New strings needed by implementation return to this spec/catalogue before use.

| Key | Where it appears | English |
|---|---|---|
| `title` | Briefing and evidence states | Change briefing |
| `navLabel` | Briefing and evidence states | Changes |
| `prototype` | Briefing and evidence states | Prototype |
| `intro` | Briefing and evidence states | Catch up on committed source changes, grouped by the capabilities recorded in this folder. |
| `project` | Briefing and evidence states | Project |
| `period` | Period controls | Period |
| `day` | Period controls | Daily |
| `week` | Period controls | Weekly |
| `month` | Period controls | Monthly |
| `year` | Period controls | Yearly |
| `custom` | Period controls | Custom dates |
| `previous` | Period controls | Previous period |
| `next` | Period controls | Next period |
| `today` | Period controls | Current period |
| `anchorDate` | Period controls | Date in this period |
| `startDate` | Period controls | Start date |
| `endDate` | Period controls | End date |
| `apply` | Period controls | Read this period |
| `range` | Period controls | {start} – {end} |
| `timezone` | Period controls | Dates use {timezone}; both selected dates are included. |
| `invalidRange` | Period controls | Choose valid dates with the start on or before the end. |
| `loading` | Briefing and evidence states | Reading local source history… |
| `refresh` | Briefing and evidence states | Refresh briefing |
| `webTitle` | Briefing and evidence states | Source history needs the installed app |
| `webBody` | Briefing and evidence states | Open an ontology folder in the installed app to read its connected source repository's history. |
| `noVault` | Briefing and evidence states | Open a folder to read its connected source history. |
| `noProject` | Briefing and evidence states | This folder has no project to read source history for. |
| `sourceUnavailable` | Briefing and evidence states | The connected source folder is unavailable. Check its connection and folder permission, then retry. |
| `openProjects` | Briefing and evidence states | Open Projects |
| `retry` | Briefing and evidence states | Try again |
| `noHistory` | Briefing and evidence states | This source repository has no readable committed history. |
| `readError` | Briefing and evidence states | Could not read the source history. Your dates are kept; try again. |
| `stale` | Briefing and evidence states | The repository or its connection changed while reading. Refresh to compare one source snapshot. |
| `empty` | Briefing and evidence states | No commits found in this period. |
| `emptyHint` | Briefing and evidence states | Choose another period or refresh after new commits. |
| `repository` | Briefing and evidence states | Source repository |
| `head` | Briefing and evidence states | Read at {hash} |
| `scope` | Briefing and evidence states | Current branch first-parent history. Commits inside merged branches are not counted separately. Uncommitted changes are excluded. |
| `totals` | Briefing and evidence states | {commits} first-parent commits · {files} touched files · {groups} capability groups |
| `coverage` | Briefing and evidence states | {mapped} mapped files · {unmapped} unmapped files |
| `partial` | Briefing and evidence states | Showing a limited read of this period. Narrow the dates for a more complete briefing. |
| `limit` | Briefing and evidence states | Read limits: {limit} commits · 8 MiB history output · 20,000 path records. Totals cover only returned evidence. |
| `groupCounts` | Briefing and evidence states | {commits} commits · {files} touched files |
| `unmapped` | Briefing and evidence states | Not mapped to a capability |
| `unmappedHint` | Briefing and evidence states | These paths have no matching implementation anchor in the current folder. Their behavior has not been classified. |
| `groupingNote` | Briefing and evidence states | Groups use current recorded implementation paths. They do not prove what a capability did historically. |
| `selectGroup` | Briefing and evidence states | Choose a capability group to inspect its source evidence. |
| `evidence` | Briefing and evidence states | Source evidence |
| `paths` | Briefing and evidence states | Touched files |
| `commits` | Briefing and evidence states | Commit messages |
| `commitAttribution` | Briefing and evidence states | Messages written by commit authors; Atlas has not verified their behavior claims. |
| `netComparison` | Briefing and evidence states | Endpoint comparison |
| `comparisonBasis` | Briefing and evidence states | {before} → {after} |
| `comparisonNote` | Briefing and evidence states | This compares the shown revisions. With out-of-order commit dates, intervening commits outside the selected dates can affect this comparison. |
| `netFiles` | Briefing and evidence states | {count} files differ between these revisions |
| `netEmpty` | Briefing and evidence states | These revisions have no file differences. Commits may still have touched files during the period. |
| `netUnavailable` | Briefing and evidence states | The endpoint comparison is unavailable. Touched paths and commit messages remain inspectable. |
| `initialTree` | Briefing and evidence states | Empty tree before the first commit |
| `openConcept` | Briefing and evidence states | Open capability on map |
| `back` | Briefing and evidence states | Back to groups |

| `patchAction` | Per-file endpoint reader | Read changed lines |
| `patchTitle` | Per-file endpoint reader | Changed lines: {path} |
| `patchLoading` | Per-file endpoint reader | Reading this file between the shown revisions… |
| `patchTruncated` | Per-file endpoint reader | Showing the first 32 KiB of this file comparison. This is not the complete patch. |
| `patchBinary` | Per-file endpoint reader | This is a binary file. A line-by-line comparison is unavailable. |
| `patchUnavailable` | Per-file endpoint reader | Could not read this file comparison. The file list and commit messages are still available. |
| `patchRetry` | Per-file endpoint reader | Retry file comparison |
| `patchNoDifference` | Per-file endpoint reader | This file has no differences between the shown revisions. It may have changed and been reverted during the period. |
| `patchSelect` | Per-file endpoint reader | Choose a file to read its changed lines here. |
| `patchBasis` | Per-file endpoint reader | Comparing {before} → {after}; + added lines, − removed lines. |

| `sourceAreas` | Unmapped source-area drilldown | Source areas |
| `sourceAreaNote` | Unmapped source-area drilldown | Grouped by source paths, not product capabilities. These changes remain unmapped. |
| `allUnmapped` | Unmapped source-area drilldown | All unmapped changes |
| `rootFiles` | Unmapped source-area drilldown | Repository root files |
| `showMoreFiles` | Unmapped source-area drilldown | Show {count} more files |
| `showMoreCommits` | Unmapped source-area drilldown | Show {count} more commit messages |

| `comparisonScope` | Endpoint comparison | The comparison covers the entire source repository, independently of the selected group. |

## Edge cases

- Empty and one-commit histories, root commits, merges and detached HEAD use the
  shown current-HEAD first-parent scope. Nothing scans another branch silently.
- Local date boundaries include the complete last calendar day across DST;
  yearly includes leap day. Invalid dates and reversed ranges never read Git.
- Hangul subjects and paths remain readable. Subjects are plain attributed text,
  never HTML, shell commands, network instructions or trusted behavior facts.
- A deleted path can still match its recorded anchor; an unmapped or ambiguous
  path is not silently dropped or assigned using a filename guess.
- Reverts retain touch evidence while the endpoint diff can be empty. Merge
  first-parent diffs include merged work using a first-parent diff mode; no commit
  count claims all commits or agent tasks.
- Repository replacement, changed source binding and changed HEAD invalidate a
  read. Switching vault/project/period cannot publish a stale asynchronous result.
- Worktree edits are excluded, clearly labelled. Offline reads remain local;
  missing Git objects stay unavailable without fetch, checkout or writes.

## Out of scope

- AI-generated semantic explanations or automatic risk/safety verdicts: the first
  slice lacks independently verified rule extraction and counterevidence.
- Changing accepted ontology, approval, code, branch, commits or remote state:
  this destination reads evidence only.
- Cross-project rollups, all-branch history, agent task/author attribution and
  background collection: their identity/coverage contracts are not established.
- Persisted last-read checkpoints, scheduled digests and external notifications:
  explicit calendar periods deliver the requested first prototype without them.
- Full historical ontology reconstruction: grouping uses current anchors and
  says so; it cannot imply those anchors were true at a past revision.

## Acceptance criteria

1. Given the actual installed app and a connected repository, when Changes is
   entered from the rail, then the source, date range and captured HEAD are
   visible and real capability groups/evidence are readable fullscreen; prove
   by baseline/checkpoint/final native captures and walkthrough artifacts.
   Selecting an actual changed text file must show its added/removed code lines
   in Atlas in the native walkthrough and a focused e2e file-reader assertion.
2. Given daily/weekly/monthly/yearly and custom intervals, when anchor dates,
   previous/next and inclusive endpoints change, then native Git fixtures and
   focused model tests select the intended committer-time dates, including
   Monday/year/leap-day/DST boundaries and rejection of reversed/invalid dates.
3. Given mapped, multiply mapped, deleted, Hangul and unmapped paths, when the
   briefing is grouped, then focused model tests and rendered evidence show
   every returned path, stable distinct totals, grouping provenance and no
   fabricated behavioral assertion from a commit subject. Source-area model/e2e
   cases must preserve whole-unmapped totals, filter paths/messages/patch choices
   to the selected area, restore all unmapped evidence, and reveal rows beyond
   40 without loss. A same-path capability owned only by another project must
   leave the selected project's path unmapped.
4. Given a change followed by its revert, or out-of-order timestamps, when the
   same period is read, then native fixture/model tests retain touch evidence,
   show exact endpoint basis and preserve the nonmonotonic-date qualification.
5. Given no history, empty range, denied source, a cap, byte/path truncation or
   unavailable endpoint evidence, when read, then native/model and e2e fixtures
   show the specified recovery state rather than complete coverage or zero
   product change. File-reader fixtures additionally prove binary, 32 KiB
   truncation, no-net-difference, root-empty-tree and retryable patch-error
   outcomes; patch failures preserve paths/messages. Browser arrival shows only
   its capability limit.
6. Given source replacement, changed HEAD or a vault/project/period switch
   during an outstanding history or per-file patch read, then native fixtures
   and e2e reject stale scope
   and offer refresh without changing files, index, branches or remotes.
7. Given group selection and return at affected responsive bands and 200% text
   zoom, then keyboard focus/scroll remain usable, selection and calendar inputs survive a map round trip after source revalidation, and
   audit geometry/contrast/overflow findings are resolved or explicitly retained
   with evidence; prove via routed audit and responsive matrix artifacts. The
   real sparse-mapping weekly walkthrough must reach one unmapped source area
   directly from the overview, switch a selected file and return focus to its entry,
   show more files if needed and inspect changed code without a 563-row flat
   initial list or promotion of a source-area name into a capability claim.
8. Given the final code, when the lead runs changed-path checks, then every
   recommendation passes; installed-app proof uses that rebuilt current source,
   and reports measured counts, limits and unsupported semantic interpretation.

## Risks

1. Recorded anchors are sparse or stale, yielding an unhelpful overview. Keep
   unmapped coverage prominent; measure mapped/unmapped real-repository counts.
2. Commit messages sound like independent explanations. Attribute them next to
   evidence and avoid generated behavioral claims; test misleading messages.
3. Large/yearly reads or concurrent agents produce partial/inconsistent scope.
   Bound reads, pin/recheck identity and HEAD, and prove caps and replacement.

## Later

1. Source-verified rule and behavior comparisons, once grouped evidence shows
   real comprehension value and the semantic extraction contract can be tested.
2. Last-read checkpoints, once repeat walkthroughs show calendar selection is
   the remaining burden and source identity/rewritten-history recovery is settled.
3. Multi-project or agent-task rollups, once ownership/provenance can distinguish
   independent work and readers request that view from real usage.

## Owner question

None — the owner explicitly authorized this prototype; the slice is reversible,
local and read-only, with scope and missing semantic evidence visible.
