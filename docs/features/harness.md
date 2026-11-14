---
title: Harness
doc_type: feature
status: current
area: harness
routes: [/architecture]
---

# Harness

### `/architecture` — Harness: at a glance, guides, architecture

**The tab is Harness (`harness.title`) and it answers "how are agents set up to work in this repository"**
(2026-09-13, `docs/records/decisions/2026-09-13-architecture-tab-becomes-harness-3a63ada4-031c-41af-8b9d-6d6f7f2a5138.md`). The route is unchanged, the label moved: the destination
already held one half of the answer (the reviewed structure) and nothing at all of the other
(what the agents were told, and what catches them). Under the title one line says what the tab
is for, and a tab set picks one of three views on `?view=`.

**The layer ladder became its own tab on 2026-09-19** (owner). It had been living under the name
Structure inside a destination called Harness, and it is the product's **architecture** — which,
in the vocabulary this tab borrows, is one of the three things a harness *regulates*
(maintainability · architecture fitness · behaviour) rather than a part of the harness itself. So
`?view=architecture` holds the architecture picture under its own name. **Structure and Coverage became one view on
2026-10-20** (owner, `docs/records/decisions/2026-10-20-harness-opens-at-a-glance-6a495b79-8e98-42a4-98b0-351ee722a1d8.md`): they asked the same three questions, one by harness part and one
by domain, filed a hook in different columns and offered no next step. `?view=structure`,
`?view=coverage` and `?view=sensors` are rewritten in place to `?view=overview`, so an old link and
the tab a person presses agree.

**The arrival depends on the surface, because one of the views cannot answer on the web.** Almost
the whole harness lives in dot directories and a browser's folder permission cannot see a dot entry
at all, so the installed app arrives on At a glance and a browser arrives on the blueprint, which is built
from the bundled profile and answers there. Without a reading the tabs are At a glance and
Architecture, and an address that names a view always wins; `?role=` or `?stage=` with no `?view=`
opens Architecture, the only view with either.

Without a reading, At a glance is one centred stage (`HarnessUnreadStage`): a code path forking to
the three guards the matrix reads, the third drawn missing, then the reason in one sentence and the
one way forward (get the app in a browser, connect a source folder in the app).
The shell-wide `?focus=main` skip anchor every left-rail link carries is deliberately not a deep
link: keying the carve-out on it made one rail click open Architecture and left the default
unreachable from the rail (measured in the installed app, 2026-09-13).

**On Guides, one sentence at the top, computed from files only**: how many guide documents this repository
speaks to agents through, and how many checks it has in place. Both numbers print their working
— the check number shows its three parts (hook scripts wired · files under `.githooks/` ·
`package.json` lint/typecheck/test scripts) and a caption states the counting rule — because a
bare count invites a reader to hear "N things are protecting you" where what was measured is "N
things are declared". The unguarded-domain question is **not** in that sentence: At a glance
answers it per domain.

**Guides (`harness.views.guides`)** — a list and a detail: the list on the left holds one row per
guide file or directory found (path, file count, size, how many files differ from an existing
twin, how many have no twin (`harness.pairFilesNoTwin`; the file's own row says `harness.driftOneSided`),
and how many files the twin has that the folder lacks (`harness.pairFilesMissing`)), then one row per hook config, which says wired only when every script it names is
on disk and says so when a command names no script file (`harness.hookUnresolved`). A row's status
tags wrap below its name rather than truncate it. Each row carries a folder or file icon. Only a content difference wears a tag, in the same blue that lines without a twin wear in the comparison; the two file counts are plain text. The detail on the right holds the selected
row's facts, and each pane scrolls on its own, so the page itself does not scroll at 1512x900. A
folder says it has the same content as its twin (`harness.pairMatchesTwin`) only when both file sets
are equal and every pair matches; a folder that lacks files names them and the folder they are in.
From a 48rem frame the list and the detail sit side by side, with a narrower list below 68rem;
below 48rem the list stacks over the detail. A guide's detail names which tools
read it, each claim carrying the document it came from and the date a person last opened it (a
claim we cannot cite says so (`harness.toolsUncited`) rather than rendering like the sourced rows);
size against a documented cap, where the Codex bar measures the **merged** root + worst-nested
`AGENTS.md`, because that is what Codex truncates and a per-file bar reads green while the merge is
already being cut; the reference comparison with its declared twin, shown only where a twin was
compared; the file's modification time on
this disk, labelled as that rather than as a commit date; and, for a directory, its files. A
directory with differing files unfolds them as indented rows. Initially only the selected
folder is expanded; other folders retain their count summaries. Explicitly opened folders stay
open until the person closes them, and a file on one side only is listed
once, under the folder that holds it. Choosing a file that has a twin shows both complete files
side by side on shared rows (one above the other in a narrow detail), so a line and its counterpart
sit on the same y; each side is headed by the mark and name of the tool that reads it (Claude Code, Codex) and the
count of its lines with no match in the other tool's file, and such a line carries a `+`
(`harness.driftLineMark`), facing a hatched empty cell. When the texts differ only in line endings,
trailing spaces or the final newline, one line says so in place of the caption
(`harness.driftInvisibleOnly`). Trimming the equal head and tail first, a pair is aligned when the
differing middle fits a cell cap and the two files together fit a row cap; a larger pair is not
aligned, says so (`harness.driftLineMarkUnaligned`), and marks lines by line set under the same
tool-headed sides. Choosing a file with no twin shows its one copy and names the folder it is
only in (`harness.driftOnlyIn`). The view opens on the first file that differs from its twin. Comparison counts do not claim that the pairs match, and
tool-specific differences are informational rather than a synchronization requirement. A hook
config's detail lists it by script: wired (`harness.hookWired`) means the script the config names
exists on disk, never that it runs — a script the config names and the disk does not have is
called out, because that failure produces no error at all, and the Codex row carries its approval
requirement (`harness.hookApprovalGate`) as a standing fact instead of a green, since `/hooks` trust
lives in no file. Arrow keys move the selection through the list, and Right and Left open and
close a directory. Measured on this repository:
98 guide documents in 9 groups, 85 checks (20 + 6 + 59), `AGENTS.md` 12,142 B merging to
13,090 of 32,768, 20 of 20 hook scripts wired.

**At a glance (`harness.views.overview`)** — the arrival (2026-10-20, `docs/records/decisions/2026-10-20-harness-opens-at-a-glance-6a495b79-8e98-42a4-98b0-351ee722a1d8.md`). One
table: rows are the domains the ontology records for this repository, columns are **Told**,
**Gated** and **Watched**. A file counts in a domain's cell when a path **it declares** reaches a
path the ontology records there — a nested `AGENTS.md`'s folder, a rule's `paths:`, a hook
script's anchored filter, a check command's file arguments, a workflow's trigger `paths:`
(`paths-ignore:` is no path) — never because of where the file itself lives, and every entry carries
the text that put it there. A file whose paths reach every domain fills each of their cells. The
last row, **Reaches every domain**, holds what declares no path: the root guides, the
`permissions` deny and ask rules, the exclusion files, hooks and scripts that name no path, and a
glob with no literal folder such as `**/*.tsx`.

Told holds the root guides, rules, nested guides and the context hooks (SessionStart,
UserPromptSubmit); Gated holds the hooks that run before a tool call, the files under `.githooks/`,
the deny and ask rules and the exclusion files; Watched holds every other hook event, the check
scripts a command names and the workflows. A script wired for both a pre- and a post-tool event
appears in both columns. Mirrored hooks under `.claude/hooks/` and `.codex/hooks/` list as two
files, each naming its own tool, and a `.codex` hook carries `harness.hookApprovalGate` because it
runs only after a person trusts it in `/hooks`.

**A gap is named, counted and handed over.** A gap is a cell of a domain with a recorded path that
no file fills: an amber dot and `harness.coverageNone`, counted in one sentence above the table
(`harness.overviewGapCount`). A domain with no recorded path reads `harness.overviewNoPath` and is
not a gap, because no file could name it. One action, `harness.overviewHandoff`, copies a request
to paste into the coding agent that runs in that repository: each gap with its domain slug and
paths, what already reaches every domain, an instruction to judge each gap first, propose the
smallest file and wait for a yes before writing, and the rule a file must meet to fill the cell.
Atlas sends nothing and writes nothing; `harness.overviewRequestShow` shows the same text and is
where a refused copy points, and "Read the files again" re-reads them after the agent writes. **No
score, grade, level or percentage is rendered**: the count is of cells a reader can count
(`docs/records/decisions/2026-09-13-harness-spine-is-a-coverage-matrix-b9dba267-d755-4ad5-b854-6f930c7e5922.md`).

**A cell opens its files beside the table** from 1280px, in a reserved column so no cell moves
under the pointer, and below its row under that. Beside the table the first gap's panel is open on
arrival without taking focus, as Guides opens on its first difference; with no gap nothing opens. The panel quotes the domain's purpose
as the ontology wrote it, then each file by kind with its path, declaring text and the tools that
read it; a gap shows the empty sentence, the domain's recorded paths, how many files reach every
domain and, for Watched, the test files discovered under or beside those paths. Escape or Close returns focus
to the cell. Under the table a missing hook script is called out (`harness.anatomySilentGuards`),
because a config naming a script the disk lacks fails with no error at all, and "How this screen
counts" holds the counting rule, the paths nothing reaches, the files that reach no domain, the
domains without a path, and the agent loop and model, which files cannot show.

**What the repository keeps out of sight is a gate too** (2026-09-20). Gated carries the exclusion
files under the name each product actually uses: `.cursorignore` (Cursor), `.codeiumignore`
(Windsurf, not `.windsurfignore`), `.aiexclude` (Gemini **Code Assist**), `.geminiignore` (Gemini
**CLI**), `.aiignore` (JetBrains AI). `.claudeignore` does not exist — Claude Code uses `.gitignore`
for discovery and `permissions.deny` for the rest — and `.agentignore` is a proposal rather than a
standard. Two files are not counted: `.cursorindexingignore` only keeps files out of the index, and
`.cursorrules` is ignored in Cursor's agent mode. A repository can write an exclusion file; whether
the tool honours it is the tool's business.

**The wait screen is held back, never the read.** The scan reports each pass it runs and fills a
bar only where the denominator was known before the pass started — but it appears only once a read
has taken longer than a second, so a read that finishes in 0.6s shows no wait screen at all and one
over five thousand documents still gets its stages. The read was never slowed to display it. What
happens on every visit regardless of speed is the **arrival**: the result rises into place.

The whole reading goes through the installed app's read-only harness commands
(`src-tauri/src/harness_source/`), classified by `entities/agent-files`, the classifier the docs
sidebar uses — one store, not a second. A
browser's folder permission cannot see a dot entry at all, so on the web these views name what they
cannot reach instead of drawing a shorter list and calling it the inventory — and the destination
opens on the blueprint there rather than on a card about what this browser cannot read.

**A refused read is never an empty harness** (2026-10-17). Only a path that is not there reads as
absent. Any other refusal fails the whole reading, and the screen says why instead of drawing
an empty table. That includes the bridge refusing the source root, or the root itself
being gone. The harness commands take the opened folder and a project, never a path: they read
that project's one recorded code folder, and only when the app already holds its read grant (the
repository containing the opened folder, or a folder picked in the app since it last opened). Inside it they return the
allowlisted harness files' text, configuration reduced to names, hooks and scripts, and every
other file's name only (`.claude/rules/surfaces.md`). The binding they read is macOS-only today, so on Windows the reading fails and says so.

- Architecture is separate from the Ontology Map and from the public five-kind
  ontology schema. A non-kind `architecture-profile/v1` Markdown document keeps
  reviewed pattern axes, scopes, roles, paths, evidence, and allowed dependency
  direction plus governed import usages in the same Git-backed folder without
  becoming a map node.
- The stable role blueprint is one reviewed contract. Pattern names are declared
  summaries; Atlas does not infer Clean, Hexagonal, MVP, or Feature-Sliced Design
  from folder names. The visible Understand → Plan → Verify stages were removed
  on 2026-09-03; the canvas compares reviewed intent with observation directly.
- **The picture is a cross-section of the code** (2026-11-14, owner). One row per role in
  profile order: at the left the role's path pattern in mono and its name, then a rounded
  band holding the role's real members as small mono chips on one line, closing with `+N`
  for the members that do not fit, or the total when all of them do. Members are the
  connected repository's folder and file names under the role's paths, listed through the
  read-only harness commands with no file opened; without a listing they are the modules the
  role's recorded concepts sit in, most recorded first; with neither the band is empty and
  only the pattern names it. A band carries no description; the role's sentence, reach,
  modules and concepts are in its detail panel.
- **Observed imports are arcs beside the bands.** Each crossing between two roles in the
  last record is one arc leaving the right edge of its source band and returning to its
  target's, bulging further the more rows it spans, its stroke 1 to 6px wide by its share
  of the busiest crossing, neutral at rest. Imports inside one role are not drawn, and an
  allowed rule nobody has imported along is not drawn: the arcs are the code's, the rules
  are in the rules panel. A violation takes the outer lane, dashed in the danger tone with
  an arrowhead at its target and a short label `from → to N`. Choosing a band brightens its
  arcs, dims the rest and puts each bright arc's count at its far point; hovering an arc
  shows `from → to N`, and each arc's accessible name is its full sentence. One legend line
  under the picture keys the marks. Before a record exists nothing is drawn beside the
  bands: no arc, placeholder or legend.
- **The header is one line.** The profile title, then the status: "Not scanned yet", "No
  import against the rules · checked <date>", or a red dot and the count against the rules
  with its date; a live agent turn names itself there instead. The status opens the
  profile's issues and records. At the right sit the rules toggle and the agent action. The
  last check's result, counts and dated stamp, or the command that would write one, are in
  the rules panel under "Last check".
- **At workbench width the screen does not scroll** (2026-08-30). The panel hugs its rows,
  which shrink from 60 to 34px with a tighter gap before any role leaves view, so seven
  roles stand whole at 1280×800 and 1512×945. The role's answer and the rules open in a
  380px panel beside it — by choosing a band, by the "Roles and rules" button, or by a link
  naming a role — and Escape closes it and returns focus. Below workbench width the panels
  return to the document flow, the arc column narrows first, and below a 600px stage the
  arcs are dropped and each band names its strongest outgoing crossing instead. Bands never
  scroll sideways. The arcs draw in once over `--motion-settle`, selection crossfades, and
  reduced motion shows the finished picture.
- **A role's sentence can be written in the reader's language** (2026-09-03). Beside
  `summary_<role>`, a profile may carry `summary_<role>_<locale>`, such as
  `summary_views_ko`. The screen shows the locale line to a reader in that locale
  and the canonical `summary_<role>` to everyone else, so a profile translated one
  role at a time never leaves a blank where a sentence was. `summary_<role>` stays
  the reviewed fact: it is the only sentence the agent handoff, `inspect_architecture`
  and CLI `architecture` print, and a locale line without it is refused, as is a
  locale line for a role the profile does not declare. A document whose profile this
  screen cannot read is now named in a notice above the canvas instead of replacing
  every profile in the folder with an error.
- **The agent task is the person's to choose** (2026-09-03). The button keeps its
  derived default — inspect source, review delta, or plan change — and a chooser
  beside it lists three tasks with one line each: inspect or re-inspect source,
  plan change, and find improvements. The chosen task stays on the button and the
  copy confirmation names it. Find improvements names where the reviewed
  profile and the observed imports disagree, plus unmapped, unruled and empty
  roles, with literal paths, and asks the person what the rule should be; it
  proposes no rule, role name or pattern and writes nothing. A verified agent takes
  the chosen task as its opening turn; a browser copies the same sentence.
- `inspect_architecture` and CLI `architecture` scan supported source imports and
  return `architectureBrief:v1` with `conforms`, `violated`, or `unknown`.
  Observed role edges retain value/type-only/unknown usage counts and exact
  receipts. Unsupported languages, unknown import usage, unmapped edges,
  unruled edges, and empty roles fail closed; absence of evidence is never a
  green result.
- The short agent action sends a state-bound inspection or change request. In the installed
  app, an exact CLI fallback is included only when the project source binding,
  vault path, and Atlas CLI entry are all verified absolute paths; otherwise the
  packet says the fallback is unavailable instead of inventing a command.
- At narrow widths the role model remains first in document order. Open role and rules
  panels scroll into view without covering the persistent bottom tabs, whose reserve stays
  part of the workbench.

**Before a profile exists, the tab shows what one gives** (2026-10-02, owner). The empty state is a
hero on the Harness start line, top-aligned under the tabs: the sentence and its two actions, and
beside them from 1216px of content (under them below that) an illustration of the draft path the
2026-08-26 record sets. It plays three loops of 7.92s and then rests on its finished frame: the
folders appear and one light reads them and carries the read to the foundation; an agent's proposed
path groups rise as dashed faces under "Groups an agent proposed"; a person names and approves them;
`architecture/web.md` settles with a check; only then do the person's dependency rules run down,
marked as theirs; and the check catches one import that climbs from Shared foundation to Features in
the receipt's own danger tone and sentence. When the installed app has one connected source folder,
the folder column is that folder's real top-level folders, kept from the root listing the harness
scan already reads (dot, build, ignored and in-checkout ontology folders left out; no new read), and
the frame says only the folder names are real; otherwise every part is labelled an example. It
pauses while hidden, off-screen or on request, holds its finished frame under reduced motion and
while the agent dock is open, keeps running through a window resize, uses the house ease where the
engine has no `linear()` easing, and shows the finished frame if an engine refuses an easing. It
spends no script per frame: measured on the static export at 1512, one loop cost 0.27ms of style
and 0.07ms of paint per frame and 0 frames after the third loop.
