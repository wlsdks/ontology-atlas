---
title: Changes beside the center
doc_type: spec
status: draft
area: product
date: 2026-11-27
decisions: []
---

# Changes beside the center

The owner, 2026-11-27, translated from Korean: "People tend to look only at the center when things
are gathered together, so they miss something that is just as important but sits at the side."
The owner asked for a plan built on this, and said the problem definition is most of the work.

This spec is that problem definition, the cases it has to cover, the patterns that already solved
parts of it, and the options. It chooses no option. Nothing is built until the probe in the
acceptance criteria has run. Every linked outside source was fetched and read on 2026-11-27, as its
abstract or its page text; anything not read that way is marked as an assumption or a hypothesis.

## Person and moment

A developer who already runs coding agents and merges their work many times a day. This
repository merged 200 changes on its first-parent line in the eight days to 2026-11-27, twelve of
them today (`git log --first-parent`, read 2026-11-27). The moment comes in four forms, all
observed today:

| Moment | What the person looked at | What sat beside it |
|---|---|---|
| Reviewing one change (#3963) | Changes reading the wrong branch (`src-tauri/src/git/briefing.rs`) | A second place that read the same thing and was left unchanged |
| Reviewing one change (#3964) | The Workshop rooms, 15 code files | Two shared motion files deleted in another layer |
| Releasing (#3965) | Four version files | One count in the vault's project document that the day's other changes had made untrue |
| Reading the day | The bottom "Merged into main" list in Workshop | Twelve changes that cannot be read at a glance; the owner asked "what did you do this session?" |

Not observed: anyone but the owner; a person learning agents; a person who does not write code; a
capture of any of the four screens. Criterion 1 measures before anything is drawn.

## Today

**What the three changes were** (all read from Git in this repository):

- **#3963** (`151aca158d`, 29 files). Its first commit, `0c5885b0ed` at 12:49, changed
  `src-tauri/src/git/briefing.rs` and three Workshop files so that Changes reads the branch work
  merges into. It did not touch `src-tauri/src/git/briefing/prs/inventory/transport.rs`, where the
  pull-request lookup built its identity from `rev-parse --verify HEAD` (line 175 before the fix).
  Commit `c031c732d5` at 12:59 changed that file; the change merged at 13:31. Before the fix the
  same Git arguments stood in four places under `src-tauri/src/git`: `briefing.rs:174` and `:222`,
  `transport.rs:175` and `evidence/bound.rs:68`. By the lead's account in this spec's brief, the
  first independent reviewer missed the second place, and the lead found it only while extending
  the change.
- **#3964** (`359db6c5b4`, 28 files, 2,135 lines removed). 15 of its 17 code files are under
  `src/widgets/work-tracks`. The other two, `src/shared/motion/pixel-stage.ts` and
  `pixel-beat.ts`, were deleted. Before the change their only users were each other,
  `moru-clock.ts` in `work-tracks` and tests, and the change deleted those too.
- **#3965** (`bcaf3db29b`, 14 files). A version bump of four files. The release gate refused
  because `docs/ontology/ontology-atlas.md` said "Not mapped yet: 68 of 72 abilities" and the
  measure had become 69 of 73 after the day's Workshop and Changes work; `aa7868e07c` at 13:44
  corrected the line (its commit message says `validate_vault` warned and the gate refused).

**What Atlas shows for a change today:**

- **Changes groups by the title.** A change belongs to the label in its title's brackets, and to
  its largest top-level folder only when under half the titles carry a label
  (`docs/features/change-briefing.md:54-60`, `src/views/change-briefing/model/change-digest.ts:195-198`).
  The title is the center by construction.
- **Worth a look names at most three changes**, by revert, author-marked breaking, two or more
  recorded concepts, or at least 30 files and three times the period's median
  (`docs/features/change-briefing.md:44-53`, `change-digest.ts:11-12,162-181`). #3963 has 29 files,
  #3964 has 28 and #3965 has 14, and none of their files reaches a concept, so by these rules none
  of the three qualifies. This is derived from the rules and the counts; the screen was not
  opened.
- **A changed file reaches a concept only through `path:`**: the concept's own and its listed
  elements' (`src/shared/lib/git/evidence-states.ts:112-116`), as the file or a folder above it
  (`src/views/change-briefing/model/briefing-model.ts:62-66`).
- **A change's detail lists its description, files and commit** (`change-briefing.md:70-76`).
  Changes has no semantic approval and no agent attribution (`change-briefing.md:166-167`).
- **The map marks concepts whose cited file changed after their document** as "Evidence needs
  rechecking" (`messages/en/mapDial.json:5`, `evidence-states.ts:43-59`). It is measured in the app
  only (`src/features/vault-ontology/model/use-map-evidence-states.ts:103-104`). A search of
  `src/widgets/ontology-map` and `src/views/home` found no mark for a concept outside the view;
  those folders were not read in full.
- **Workshop lists the base branch's newest thirty changes** by day under the building
  (`docs/features/work-status.md:471-476`), holds rooms that do not fit on the floors below
  (`:380-394`), and counts worktrees untouched for seven days on a shelf at the bottom
  (`:395-397`). Of a session it reads a name and a state; any other field makes the entry
  unknown (`.claude/rules/surfaces.md:136-139`).
- **The server's impact answer follows declared `depends_on` only**, and its risk and
  completeness stay unknown (`mcp/README.md:835-839`).

**Measured on this repository, 2026-11-27** (two scripts in the session scratchpad, over
`git diff --name-status -M` of each first-parent change against its first parent; "code" leaves out
tests, documents, message catalogues, records, vault documents, version and lock files and
generated files by path; an "area" is `src/<layer>/<slice>`, the first three path segments under
`src-tauri`, `mcp`, `cli`, `scripts` and `tests`, and the top folder elsewhere):

| Fact | Count |
|---|---|
| Vault | 97 nodes: 32 capabilities, 58 elements, 4 domains (`list_concepts` census); 90 carry `path:`; 83 `dependencies:` entries, counted by script |
| Today's 12 changes | 106 files; 0 reached by any concept's `path:` |
| Last 200 changes | 8,555 files, 4,953 of them code; 158 files (1.8%) reached by a concept's `path:` |
| Size of a change | 10 files at the median, 60 at the ninetieth percentile, 3,471 at most |
| Second ring in the vault | of 53 concepts something depends on, the first ring is 1 at the median and 6 at most; the second ring is 1 at the median and 5 at most |

The shapes of those 200 changes are the first table under Cases.

**Earlier probes on record:**

- The 2026-09-13 probe found one fact that cut missed impacts by 75 percent: the meaning is
  unchanged and the code under it moved (decision 683f0641).
- The terminal `brief` missed its pass line: 100 missed impacts of 124 against 105 and 99 for the
  two control runs, because it named a document whose file the reader already saw in the diffstat
  (`docs/specs/2026-11-22-cli-rebuild.md:23-37`, decision 87de58d1).
- With one import followed, 21 percent of changed product files reach a concept, and 27 of 32
  merges stay under half (`docs/specs/2026-11-23-review-agent-work-by-meaning.md:58-75`).
- On the dogfood folder 17 of 31 capabilities read as stale on 2026-11-17 (decision 3fbe9895,
  Dissent).

**Unknown:** whether the app can run the server's `validate_vault` measure after a merge; whether
Atlas keeps the text of a request sent in its own conversation after the app quits; how any of
this reads on a repository other than this one; what the first reviewer of #3963 was shown.

## Problem and alternatives

### What "the center" is

The owner's sentence names one effect. In a change it has three sources, and they usually agree,
which is why the effect is strong:

1. **The title.** The author, often an agent, names the change after its intent. The reviewer
   reads the diff as an answer to "does this do what the title says?"
2. **The bulk.** Most changed lines sit in one place, and that place takes most of the reading.
3. **The first screen.** A list shows its top; a report shows its first paragraph.

What sits beside the center is not one thing either. Today's evidence splits it in four, and the
split decides everything after it:

| Class | In the diff? | Today | Caught by | Cost had it not been caught |
|---|---|---|---|---|
| 1. A changed file far from the bulk | yes | #3964, two shared files deleted | nobody needed to; it was right | none here; a shared file deleted with a remaining user breaks the build or a screen |
| 2. A place that should have changed and did not | **no** | #3963, the pull-request lookup still reading HEAD | the lead, by accident, ten minutes after the first version | pull-request lookups answering "stale" on a feature branch or behind a fetch |
| 3. A statement elsewhere that the change made untrue | **no** | #3965, the count in the project document | a gate, at release, one change later | a blocked release; without the gate, a map that misstates its own coverage |
| 4. An item that matters, placed last | not a diff | the merged list; "what is unverified" at the end of a report | the owner, by asking | a day of twelve changes nobody can retell |

**Two of today's three cases were not in the diff, and they are the two that cost or would have
cost something.** A tool that reorders or flags changed files cannot show them. That is the main
finding of this spec, and it rests on three cases from one day on one repository: it is hypothesis
1 below, not a fact about change in general.

### Why attention goes to the center

| Finding | Source | What it means here |
|---|---|---|
| On a screen, the first look goes to the middle whatever the picture holds or the task is. | [Tatler 2007, Journal of Vision](https://doi.org/10.1167/7.14.4) | Placement decides what is read first. It does not explain a miss by itself. |
| People counting passes in a video miss a person in a gorilla suit. How near the unexpected thing is to what they watch does not change that: "observers attend to objects and events, not spatial positions." | [Simons and Chabris 1999, Perception](https://pubmed.ncbi.nlm.nih.gov/10694957/) | "The side" is not a place on the screen. It is whatever the question in the reader's head does not ask about. For a review, that question is the title. |
| 24 radiologists looked for lung nodules; 83 percent did not see a gorilla 48 times the size of a nodule, and most of those looked straight at it. | [Drew, Vo and Wolfe 2013, Psychological Science](https://pubmed.ncbi.nlm.nih.gov/23863753/) | Putting a thing in view does not make it seen. Experts are not exempt. A mark must change the question, not only the layout. |
| After one abnormality is found, others in the same image are detected less well ("satisfaction of search"). | [Berbaum et al. 1990, Investigative Radiology](https://pubmed.ncbi.nlm.nih.gov/2312249/) | Finding that the center is right ends the search. The second look is where the side is lost. |
| Across 219,476 pull requests, files shown earlier get more comments. In an experiment with 106 people, one kind of seeded defect had 64 percent lower odds of being found when its file came last. The paper says GitHub and Gerrit show files in alphabetical order. | [Fregnan et al. 2022, ESEC/FSE](https://arxiv.org/abs/2208.04259) | Order by file name is not neutral. A file beside the center is found or lost by its spelling. |
| Reviewers find more in small changes. Working memory is tied to finding defects that span several places. The same experiment could not show that the order of parts changes efficiency. | [Baum, Schneider and Bacchelli 2019, Empirical Software Engineering](https://link.springer.com/article/10.1007/s10664-018-9676-8) | A defect across two places is the hard kind. Reordering alone is not a proven cure. |
| Over 40 percent of changes sent for review at Microsoft could be split into independent parts. | [Barnett et al. 2015, ICSE](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/barnett2015hdh.pdf) | A change often carries a second, unrelated part. That part is a center of its own, not noise. |

**Hypotheses, not verified:** that a reviewer anchors on the pull-request title; that the first
reviewer of #3963 did; that an agent's summary of its own work anchors harder than a person's.

### Why agent-written work makes it worse

- **Volume.** Twenty-five changes a day on average for eight days. Each review gets less time,
  and the first place where the change looks right ends it.
- **Order.** A file list is ordered by path (alphabetical on GitHub and Gerrit in 2022, per
  Fregnan et al.). Meaning has no place in that order, so the file that matters most can be the
  fortieth.
- **The summary comes from the producer.** The person "should not have to ... accept the producing
  agent's summary as independent proof" (`docs/PRODUCT-DIRECTION.md:24-27`). A summary states the
  intent, which is the center. It cannot name what its author did not think of, and class 2 is
  exactly that.
- **An independent reviewer is anchored too.** It is handed the title and the diff. The process
  already names this failure: "a routed review passes a defect in a lens its route listed"
  (decision 3bb67ec0, Falsifier).
- **Atlas's own screens repeat it.** Changes groups by the title's label, Worth a look counts
  files, and neither said anything about today's three.

### What current tools show

- **Verified.** GitHub's documentation describes reviewing one file at a time, marking each as
  Viewed against a progress bar, filtering files and a file tree
  ([GitHub Docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request)).
  That page names no feature that says where most of a change is, or what lies outside it.
- **Verified for 2022 only.** Files in alphabetical order on GitHub and Gerrit (Fregnan et al.).
  Whether that is still the default was not checked.
- **Assumptions.** That no widely used review tool names a place left unchanged; that AI review
  tools comment on the diff they are given and so share its blind side; that stacked-change tools
  shrink changes without saying what is beside each. None of these was checked.

### What Atlas knows that those tools do not, and how little of it reaches a change today

Atlas holds three things a diff tool does not: which files one concept names together, which
documents state something about which code with the dates of both, and import edges between
files. On this repository it can use almost none of the first: no file changed today reaches a
concept, and 1.8 percent did over 200 changes. The second is what caught #3965, late. The third
needs no map.

So the honest position is this. For classes 1 and 2 on a thinly mapped repository, what works is
plain reading of the repository, which a script could also do. Atlas's own part is class 3, and
classes 1 and 2 wherever a concept names the files. Any option must say which of the two it is
using, or it will promise meaning it does not have.

### Hypotheses, each able to fail

| # | Hypothesis | How it is measured | It fails when |
|---|---|---|---|
| 1 | Most costly misses are outside the diff. | Take the last 200 changes. For each later change that corrects an earlier one within 48 hours (a revert, or a fix in the same area whose message names it), record whether the corrected file was changed by the earlier one. | fewer than a third of corrections land in a file the earlier change did not touch |
| 2 | Saying what is beside the center on the first screen cuts misses. | The sealed probe below, arm B against arms A and A'. | the gain is inside the gap between A and A', as the terminal brief's was |
| 3 | Folder distance alone flags too much. | Count changes with code outside their largest area. Measured now: 106 of 159 changes with code. | already confirmed for this repository; reopened only by a different result elsewhere |
| 4 | A row with evidence that clears or keeps it is read; a bare flag is skipped. | In the probe, compare a row that names its evidence with the same row without it; count wrong beliefs and rows the reader acted on. | readers act on both alike |
| 5 | Order in a report changes what is checked. | The same session report with "not verified" first and last; count the unverified items the reader carries into their answer. | the counts match |
| 6 | A mark at the map's edge is seen but not acted on. | A five-second still of the map with marks; the reader says how many concepts outside the view need rechecking and where. Then an installed-app day: marks shown against marks pressed. | readers answer correctly and press more than a third of the marks |

**The sealed probe.** Corpus: today's twelve changes, with #3963 at its first commit
(`0c5885b0ed`, before the second place was fixed) and #3965 before `aa7868e07c`, plus the changes
hypothesis 1 finds that were corrected within 48 hours, to at least twenty. Key: what in fact had
to change or be checked, written from the later correction by someone who never sees an arm's
packet, and hashed before any packet exists. Arms: A, the title, description and diffstat; A', the
same again, to size the noise between runs; B, A plus the lines one option would add; C, the full
diff. Readers answer one question: "What else has to change or be checked for this to be right?"
Counted: missed items, wrong beliefs, rows flagged that the key does not hold, files opened.

**First-page truth.** For each change, fix the first screen a person would open (the change's
detail in Changes). Score it 1 when that screen, without a press or a scroll, names every key item
or says Atlas could not look; 0 otherwise. A reader who opens everything scores well on any arm,
so this metric, not the answer count, separates the options. Today's detail holds only the
description, the files and the commit, so it cannot name the key item of #3963 or of #3965, which
are not in the diff. Whether the two deleted files of #3964 show there without a scroll was not
opened.

**Pass line.** B beats the mean of A and A' on missed items by more than their gap; wrong beliefs
do not rise; at most one flagged row in four is absent from the key; first-page truth is at least
two of the three named cases. If it fails, the next step is this problem definition again, not a
feature.

## Cases

### Shapes of a change

Counts are the last 200 first-parent changes of this repository, by the measure above.

| Shape | Count | What "the center" is | What should be said | How saying it goes wrong |
|---|---|---|---|---|
| Code in one area | 53 | that area | nothing about the side; classes 2 and 3 still apply | a quiet screen read as "nothing beside it" |
| One area holds 60 percent or more, the rest elsewhere | 34 (2 side files at the median, 23 at most) | the large area | the side files, each with what joins it to the center | the side is ordinary wiring and the row is noise |
| Two areas each hold 30 percent or more | 27 | two centers | "this change has two parts", each named; neither is the side | calling the second part a side effect |
| No area holds 60 percent and no second holds 30 | 45 | none | that it has no main part, with its area count; no side rows | flagging everything, or pretending a center |
| Everything peripheral (a sweep: rename, format, one edit repeated) | not separated by the measure | the edit, not a place | the edit once, with its file count, and any file where it differs | one row per file |
| Tests only | 4 | the tested code, which did not change | which code the tests exercise, if imports show it | treating a test as product code |
| Documents only (4 more changes mix tests, catalogues and documents) | 18 | the documents | a vault document among them is a meaning change and is named | hiding a vault edit among prose |
| Message catalogues only | 2 | the strings | a key changed in one language and not the others | flagging four languages as four places |
| Version or lock files with documents | 13 | the version | nothing about the files; class 3 across the changes since the last release | reading 14 small files as safe (#3965) |
| Generated files | part of other shapes | the source that generates them | left out of every count, named once | a generated file as the largest area |
| Renames and moves | 6 changes | the move | old and new place; documents that still cite the old path | a rename read as a deletion plus an addition |
| Deletions | 20 changes | what was removed | who still uses each deleted file, or that nobody does | a deletion at the foot of a list ordered by lines added |
| Files no concept names | 98.2 percent of files | unknown to the map | that Atlas does not know their part; folder and imports still apply | silence read as "unaffected" |
| Vault missing, small or huge | this vault: 97 nodes | none from meaning | missing: folder and import measures only, and said so; huge: at most three rows whatever the size | a slow read holding the first screen |
| Web | no local Git | none | the web says Changes needs the app (`change-briefing.md:166`) | invented history |

### The person's state

| State | What the center gives | Where the side is lost | What would help |
|---|---|---|---|
| First look | the title's answer, rightly | nowhere yet; the center should come first | one line under the center that says a side exists |
| Second look | "it does what it says" | here: the search is satisfied | a different question, stated: "what else reads this?" |
| Reviewing another agent's work | the agent's own summary | everything the agent did not think of | rows Atlas found by itself, marked as such |
| Releasing | version files | the sum of the changes since the last release | class 3 across all of them, before the gate |
| Reading the day | the newest rows of a list | everything below the fold | the day in parts, with what is not verified first |

### When "far" is wrong

Far is right to mention when the file is unrelated work riding along, or when it is shared and
others depend on it. Far is expected, and a row would be noise, when: the same edit repeats in it
(a rename or a sweep); it is the test, the document or the other-language copy of a changed file;
it is generated or a lock file; or the repository's layers put it there, as this one does
(`AGENTS.md:17`: a feature normally spans views, widgets, features, entities and shared).

| Measure of distance | What it sees | How it fails | On today's cases |
|---|---|---|---|
| Folder | where a file sits | layered code spans folders by design: 106 of 159 changes would be flagged | #3964: sees the two shared files. #3963: the second place sat in the same area as the center, so it reads as near, and it was not in the diff |
| Import edges | which file uses which | static text only, some languages only, at most 2,000 files in the app (`review-agent-work-by-meaning.md:50-57`); it cannot tell an unrelated file from a second copy, since neither has an edge | #3964: the deleted files' only users were deleted with them, which clears the row. #3963: both places called Git themselves; no edge joins them |
| Concept hops | whether two files serve one capability, one domain, or a dependency | needs the file to reach a concept (1.8 percent); a missing edge is not evidence of independence | none of the three reaches a concept |
| The same text | a second copy of what the change replaced | boilerplate; copies that differ on purpose | #3963: finds `transport.rs:175`, and also `evidence/bound.rs:68`, which the fix left alone |
| Changed together before | the repository's habit | none for a new file; it repeats old omissions; not measured here | hypothesis |
| A mix | more cases | each measure adds its own false rows, so every row must say which measure raised it | to be measured in criterion 1 |

### When the signal is noisy

Too many rows fail the same way as none: the reader stops reading them. The standing limits
already say how much a first screen may hold: at most three changes under Worth a look (decision
4ee43750) and at most three rows under To check (decision 3fbe9895), and a count never implies
severity (decision 390e91c6). The same hold here: at most three rows a change, no row at all when
nothing qualifies, the remainder as a count, no risk word and no score (`docs/DECISIONS.md:3884`).
A line that appears on more than one change in five is a failed line (criterion 4).

## Patterns that already solved this

The owner, 2026-11-27, translated: "Everything is a pattern; new patterns derive from existing
ones. Imitation is not copying." Each row takes the mechanism and nothing of its look. The
source supports the mechanism and the failure; "it works because" is this spec's reading.

| Pattern | Mechanism, and why it works | How it fails | What Atlas borrows |
|---|---|---|---|
| A second reader in radiology | A second radiologist reads the same images. A review of 46 studies found discrepancy rates from 0.4 to 22 percent ([Geijer and Geijer 2018](https://pubmed.ncbi.nlm.nih.gov/29594850/)). It works because the second reader's search has not yet been satisfied. | It costs a whole second reading, and the review advises keeping it for selected high-risk examinations. | A second look that does not start from the title. Kept for changes that have something beside the center, not all. |
| A search checklist in radiology | Name every region to inspect, aloud. | It did not work: with a vocalized checklist, 20 radiologists still under-reported other abnormalities once a nodule was added ([Berbaum et al. 2016](https://pubmed.ncbi.nlm.nih.gov/26916249/)). | The warning. A fixed list of things to check does not undo a satisfied search. Atlas names the specific place, or says nothing. |
| The instrument cross-check in flying | The pilot's eyes go out to one instrument and back through the main one, in a set pattern. The handbook names the three errors: staring at one instrument, leaving one out, and weighting one too much ([FAA Instrument Flying Handbook, pages 6-10 and 6-11](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/FAA-H-8083-15B.pdf)). It works because the side instruments are few, fixed and always in the same place. | Equal weight for every instrument delays the return to the one that matters (the same pages). | A fixed, small place for the side beside the center, in the same position on every change. |
| Marks at the screen edge for things outside the view | An arc at the edge whose curve tells direction and distance ([Halo](https://www.patrickbaudisch.com/projects/halo/)). It works because the edge is in view when the thing is not. | Overlapping arcs become unreadable, which is why [Wedge](https://www.patrickbaudisch.com/projects/wedge/) followed. Games use the same idea; that was not checked. | An edge mark only for few things. Many become one count for each side. |
| Change marks in an editor's scrollbar | The editor draws a file's changes in the gutter, in the ruler over the scrollbar and in the minimap, so a change outside the view is still on screen ([VS Code source, `scm.diffDecorations`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/scm/browser/scm.contribution.ts)). It works because the whole file fits in a strip that never scrolls. | It covers one file. It says a line changed, not whether it matters. | The whole change in one strip that fits the screen: where the bulk is and where the rest is. |
| Splitting a change into its independent parts | Group changed lines that define and use the same names; what does not join is another part ([Barnett et al. 2015](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/barnett2015hdh.pdf)). It works because each part can be understood alone. | It works on the diff only, so classes 2 and 3 stay unseen. File order alone has measured effects and no proven fix (Fregnan; Baum). | Naming a second part as a part. A part is not a side effect. |
| Trace Dependents in a spreadsheet | An arrow from a cell to each cell that uses it; pressing again shows the next level ([Microsoft Support](https://support.microsoft.com/en-us/office/display-the-relationships-between-formulas-and-cells-a59bef2b-3701-46bf-8ff1-d3518771d507)). It works because every dependency is written in a formula, and the next level comes only when asked. | The same page says a cell in a closed workbook cannot be traced. In code most dependencies are written nowhere Atlas reads. | One level by default and the next on a press. And the admission: where a dependency is not written, say Atlas cannot see it. |
| Flagging what departs from the group | Find the points that do not fit the pattern of the rest. Every technique rests on an assumption of what normal is ([Chandola, Banerjee and Kumar 2009](https://doi.org/10.1145/1541880.1541882)). | False alarms. In one hospital study 88.8 percent of 12,671 annotated arrhythmia alarms were false, and the flood itself hides the real one ([Drew et al. 2014](https://pubmed.ncbi.nlm.nih.gov/25338067/)). | The center as the stated "normal" of this change, with its share. And the budget of the Cases section, because a wrong row costs more than a missing one. |

**What is new in Atlas's combination.** None of these patterns names what is absent from the
change: the place left unchanged, the statement made untrue. Atlas would (1) say the center of
each change aloud, with its share, so the side is defined against something a person can check;
(2) attach to each side row the evidence that clears it or keeps it, such as an import, a cited
line or two dates, so a row can be closed by reading it; (3) name items outside the diff at the
change that caused them, not at the release; (4) do all of it from local files with no model, and
say "Atlas did not look" where it could not.

## Options

Compared on the same four grounds as any change to a surface:

| Way | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo: the title, the file list, a gate at release | catches class 3 late and nothing else | no new line to read | none | holds | loses on today's evidence: one of three caught by design |
| Reorder the file list by meaning | none shown in experiment (Baum) | familiar | the map covers 1.8 percent | holds | loses alone |
| An agent writes "what else to check" | reads well | one paragraph | a model call for each change | sends repository text to a provider | loses: a claim by a producer, and something leaves |
| **Options 1 to 6 below, each proved by the probe before it is built** | by class, below | one fixed place, at most three rows | parts exist | nothing leaves | to be ranked by the probe |

Each option says what it is, and the probe decides whether it is built.

**1. Also changed, away from most of this change (class 1).**
Screen: a change's detail in Changes, and the Workshop review tab when that is built
(`2026-11-23-review-agent-work-by-meaning.md`). States: one area, no line; two parts, both named;
no main part, one sentence and no rows; imports unread, said. Copy direction: "Most of this change
is in {area}: {n} of {m} code files. {k} files are elsewhere." Evidence on each row: where the
file is, and what joins it to the main part ("3 files of the main part import it"; "deleted; no
file that remains imports it"; "nothing in the main part imports it or is imported by it"). Out of
scope: any word about risk; files outside the granted repository.

**2. Places that read the same thing and did not change (class 2).**
Screen: the same place, a second line. Two mechanisms, and the row says which: a concept names
this file together with files the change did touch; or the text the change replaced still stands
elsewhere. Copy direction: "This change replaced {text} in {n} files. The same text is still in
{file}:{line}." States: none found, no line; more than three, three and a count; a file too large
or not text, said. Evidence: the file and line, opened in place. Out of scope: saying the other
place is wrong. This is the only option that would have shown #3963, and on that case it also
shows one place that was right to leave, so its precision is the question the probe answers.

**3. Statements this change made untrue (class 3).**
Screen: the same place, a third line; and one line on the release moment (where that lives is
open). Mechanism: the evidence states the map already computes, joined to the change that moved
the file, and the project's "Not mapped yet" line against the measure. Copy direction: "After this
change, {n} concepts cite files it changed: {names}." and "The project document says {old}. The
measure is now {new}." Evidence: the concept, the file, the two dates (decision 3030afde's rule,
folder-only paths stay unknown). Out of scope: editing the document; the web.

**4. Marks at the map's edge (classes 1 and 3, on the map).**
Screen: the map. A count at each edge of the view for concepts outside it that one chosen change
touched or that need rechecking; pressing a count glides the camera there, and the mark stays so a
second press returns. States: none outside the view, nothing drawn; the web, nothing, since the
web measures no evidence. Copy direction: "{n} concepts to recheck, to the right". Out of scope:
one mark for each concept; marks for everything stale at once (17 of 31 capabilities on
2026-11-17). Today it would have shown nothing for the three cases, because their files reach no
concept.

**5. The second ring (class 2, on the map and in a review row).**
Screen: the concept panel's reach lists and a review row. Copy direction: "{n} concepts depend on
it, and {m} more depend on those." Evidence: the names, one level at a time. Out of scope: a
ranking or a risk word (`docs/DECISIONS.md:3884`). The vault's second ring is 1 at the median, so
this is small where it exists and empty for today's cases.

**6. What is not verified, first (class 4).**
Three places. (a) Workshop: worktrees with uncommitted work untouched for days rise from the shelf
to one line above the building. (b) The merged list: a day reads as its parts, with the changes
that carry a line from options 1 to 3 first. (c) A report of a session: what was asked, what
happened, what is not verified, in that order reversed, so the unverified comes first. Copy
direction: "Not verified: {item}." Out of scope for (c) without a record: the text of a request in
a terminal session.

**Decision records.** Options 1 to 3 read Git, file names, import lines and text inside the
granted repository, which Changes already reads; if that holds when built, they need no record. A
read outside the granted folder needs one. Option 6(c) needs one for terminal sessions: Workshop
reads only a session's name and state (`.claude/rules/surfaces.md:136-139`), so collecting what
was asked is a new read outside the vault. Options 4 and 5 read only the vault.
Nothing in any option leaves the machine, and no model is called.

**Order.** By what today's misses cost, class 2 comes first, then 3, then 1. By what each costs to
build, 3 comes first: its parts exist, and it is the one kind of fact a recorded probe has shown to
work (decision 683f0641). So: the probe; then option 3; then option 1 or 2, whichever the probe
ranks higher; then 6(a) and 6(b); then 4; then 5; 6(c) when its record is decided.

## Flow

For whichever of options 1 to 3 passes, in the installed app:

1. When the person opens a change's detail in Changes, Atlas shows the detail it shows today, at
   once.
2. When the change's files are measured, Atlas adds one line saying where most of the change is,
   or that it has two parts, or that it has no main part.
3. When something is beside the center, Atlas adds at most three rows under that line, each naming
   one file or concept and the evidence that put it there.
4. When the person presses a row, Atlas opens the file or the concept in place, at that line, and
   the row keeps its selected colour until it is pressed again.
5. When Atlas could not read imports, or the file is of a kind it does not read, the row or the
   line says so, and makes no claim.
6. When nothing is beside the center by the measures Atlas ran, no row is drawn, and the foot of
   the detail says which measures ran.

## States

| State | Web | macOS app |
|---|---|---|
| Empty: one area, nothing beside it | Out of scope — the web reads no local Git (`change-briefing.md:166`) | the center line only; the foot names the measures that ran |
| Loading | Out of scope — as above | today's detail at once; the line joins when measured, and nothing already drawn moves |
| Error: imports or text unread | Out of scope — as above | the line says which read failed; rows from the other measures stay |
| Partial: more than three rows, or a read cut at its limit | Out of scope — as above | three rows and a count; a cut read says how many files were measured |
| Two parts; no main part | Out of scope — as above | both parts named; or one sentence with the area count and no rows |
| No vault open, or a vault that does not describe this repository | Out of scope — as above | folder, import and text measures only, and the line says the map was not used |
| Largest measured change: 3,471 files | Out of scope — as above | at most 2,000 paths measured, said; still three rows |

## Copy

None written. No option is chosen, so no key is added to `messages/`; each option above gives its
direction in English. The rules any final string must keep: it says what is true and what
pressing does, it names the file or the concept, and it uses only words already on screen
("change", "file", "concept", "imports", "cites"). "Center", "side", "far", "ring" and "class" are
this spec's working words and never reach a screen.

## Edge cases

- **Zero, one, most**: a change with no code file has no center line; one file is its own center;
  3,471 files are measured to the limit and said to be partial.
- **First run**: with no vault, options 3 to 5 show nothing and options 1 and 2 still work.
- **Hangul**: a Hangul file name is compared in one Unicode form and shown as written.
- **Moved, renamed or unreadable folder**: Changes' existing recovery stands; no line is drawn
  from a stale read.
- **Two edits at once**: a change that lands while the detail is open does not alter the open
  detail; the next read does.
- **Offline**: the same as online. Every read is local.

## Out of scope

- **Judging whether a side change is right.** Atlas names it and shows evidence.
- **A risk score or a ranking of changes by danger**, by decision 390e91c6.
- **A model writing the "what else" list.** It is the producer's claim again, and it sends text.
- **Reordering GitHub's file list, or a comment on the pull request.** A public write is a
  one-way change with its own record.
- **Uncommitted work in a worktree.** The review spec owns that; this spec reads merged changes.

## Acceptance criteria

1. **The measure, first.** Given this repository's last 200 first-parent changes, when a committed
   script runs each distance measure over them, then the pull request states for each measure how
   many changes it would flag and with how many rows, and repeats the shapes table. Checked: the
   script's output in the first pull request.
2. **Hypothesis 1.** Given the same 200 changes, when corrections within 48 hours are classified,
   then the pull request states how many landed in a file the earlier change did not touch. Under
   a third reorders the options with class 1 first. Checked: the same output.
3. **The sealed probe passes.** Given the corpus, key and arms above, when two readers for each
   arm answer, then arm B meets the pass line. Checked: the probe's table in the pull request,
   with the key's hash dated before the packets.
4. **The noise limit.** Given the 200 changes, when the chosen option's line is computed, then it
   appears on at most one change in five and never with more than three rows; and of twenty rows
   the owner reads, at least fifteen are called worth the line. Checked: the script's output and
   the owner's marks.
5. **No invented claim.** Given a fixture repository, when a change is in one area, in two equal
   areas, deletes a file another file still imports, deletes a file nothing imports, and replaces
   text that stands elsewhere, then the rows are: none; two parts; the remaining importer named;
   "no file that remains imports it"; the other file and line. With imports unread, the line says
   so. Checked: the model's unit test, named when the option is chosen.
6. **Today's three, replayed.** Given #3963 at `0c5885b0ed`, #3964, and #3965 before
   `aa7868e07c`, when the built option runs, then the first screen names the pull-request lookup,
   the two deleted shared files with their cleared importers, and the stale count, for whichever
   of options 1 to 3 was built. Checked: an e2e spec over a recorded fixture of those three.
7. **Nothing leaves.** Given the built option, then no row is added to
   `src/widgets/app-settings-menu/model/outbound-paths.ts` and no model is called. Checked: the
   existing outbound contract test.
8. **The walk, which is the recovery proof.** On the owner's Mac, in a rebuilt installed app,
   after a working day of merges: the owner opens Changes, and for each change that carries a line
   says whether they would have missed it. Then for five days the owner notes each thing found
   late that sat beside a change's center; the notes fall against the week before. Checked: the
   walk's recording and the notes in the pull request.

## Risks

1. **The line is noise and is ignored within a week.** This is the alarm failure. Answer: the
   limit of criterion 4 is measured before any screen is drawn, and the line is absent, not empty,
   when nothing qualifies.
2. **A quiet screen is read as "nothing beside it".** Two of three misses were outside the diff,
   and the cheapest option covers only the inside. Answer: the foot says which measures ran; the
   probe's wrong-belief count catches false comfort; option 1 does not ship alone if hypothesis 1
   holds.
3. **The map does not reach the changed code, so nothing here is Atlas's own.** Then a script
   could do it and the feature has no reason to live in Atlas. Answer: criterion 1 reports each
   measure apart, so the share that needs the map is known; option 3, which only Atlas can do,
   goes first; and the options that need concepts wait for the mapping work
   (`docs/specs/2026-11-23-one-press-maps-the-rest.md`).

## Later

1. Option 3, said at the change. Next when the probe passes, because its parts exist.
2. Option 1 or 2, whichever the probe ranks higher. Next after 1.
3. Options 6(a) and 6(b) in Workshop. Next when the owner again cannot retell a day.
4. Option 4, the map's edge counts. Next when changed files reach concepts on a real repository.
5. Option 5, the second ring. Next when a reader asks what depends on a dependent.
6. Option 6(c), the session report. Next when its decision record is written.

## Owner question

The brief asks for the open questions, so there are four. Each has a default, and work does not
wait on any of them.

1. **Which miss should Atlas go after first: the place left unchanged, the statement made untrue,
   the changed file far from the bulk, or the item placed last?** Default: the statement made
   untrue is built first because it is nearly free, and the probe is aimed at the place left
   unchanged because today it cost the most.
2. **Will you judge twenty rows by hand (about twenty minutes) for criterion 4?** Default: yes;
   agent readers alone cannot say what is worth your line.
3. **For "what I asked, what happened, what is not verified": start with conversations inside
   Atlas only, or also read terminal sessions?** The second is a new read outside the vault and
   needs a decision record. Default: inside Atlas only.
4. **On the map, should edge counts follow one chosen change or everything that needs
   rechecking?** Default: one change, since "everything" was 17 of 31 capabilities.

## Revisions

- 2026-11-27: first draft. Problem definition, cases, patterns and options; no option chosen and
  no copy written.
