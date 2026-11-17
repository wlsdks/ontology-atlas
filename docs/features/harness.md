---
title: Harness
doc_type: feature
status: current
area: harness
routes: [/architecture]
---

# Harness

### `/architecture` — Harness: Setup, architecture

**The tab is Harness (`harness.title`) and it answers "what does an agent meet in this repository"**
(2026-09-13, `docs/records/decisions/2026-09-13-architecture-tab-becomes-harness-3a63ada4-031c-41af-8b9d-6d6f7f2a5138.md`). A tab set picks one of two views on
`?view=`: **Setup** (`overview`, the arrival) and **Architecture** (`architecture`).

**The layer ladder became its own tab on 2026-09-19** (owner). It is the product's
**architecture** — one of the things a harness regulates rather than a part of the harness — so
`?view=architecture` holds it under its own name. **Setup replaced At a glance and Guides on
2026-11-15** (owner, `docs/records/decisions/2026-11-15-harness-follows-the-agent-loop-c52ae218-e053-4eb6-8d45-84efad283ff1.md`): a harness is what an agent
reads, what stops it before it acts and what checks its work afterwards, and nobody files it by
product domain. `?view=structure`, `?view=coverage`, `?view=sensors` and `?view=guides` are
rewritten in place to `?view=overview`, so an old link and the tab a person presses agree.

**The arrival depends on the surface, because Setup cannot answer on the web.** Almost the whole
harness lives in dot directories and a browser's folder permission cannot see a dot entry at all,
so the installed app arrives on Setup and a browser arrives on the blueprint, which is built from
the bundled profile. An address that names a view always wins; `?role=` or `?stage=` with no
`?view=` opens Architecture, the only view with either.

Without a reading, Setup is one centred stage (`HarnessUnreadStage`): a repository card forking to
the three sections (Context, Guardrails, Verification), then the reason in one sentence and the one
way forward. In a browser that is getting the app. In the app, a folder with no connected
repository still arrives on Setup, and the stage connects it in place (`HarnessConnectSource`): it
names the Git repository that holds the opened folder and connects it in one press, with "Choose
another folder" beside it; with no such repository the one button opens the folder picker. The
binding is written to `.ontology-atlas/project-sources.json` and Setup fills in without leaving the
tab. A failed measurement or write says so on the stage and keeps both buttons. Only a folder that
records no project, or a binding this stage cannot make, links to Projects. The shell-wide
`?focus=main` skip anchor every left-rail link carries is deliberately not a deep link.

**Setup** (`harness.views.overview`) opens with one sentence, `harness.explainer`, and beside it a
filter of the agent tools the scan found (All · Claude Code · Codex · …), hidden when one tool or
none is found. The filter narrows every list to the files that tool reads; scripts, Git hooks and CI
workflows stay under every filter because they run whichever agent worked, while an ignore file no
listed tool reads (`.codeiumignore`, `.aiexclude`, `.aiignore`) shows only under All. Every count
follows the filter; a category the filter empties stays listed, dimmed and not selectable, with 0,
and a selection the filter hides moves to the arrival choice below. Below three panes the filter
wraps as chips.

**One quiet line names the problems, only when there is one**: a warning icon, `harness.problemCount`
with the first problem's words, and a chip that selects that item (`harness.problemShow`). Two
kinds count: a hook script a config names and the disk does not have (`harness.problemHookMissing`),
one per config file and script however many events name it; and the root plus largest nested
`AGENTS.md` Codex reads over its default 32 KiB `project_doc_max_bytes` (`harness.problemCodexCap`).
With none, nothing is drawn: no "all good" banner. A category holding a problem carries an amber dot
and its problem count at the right of its row, and the area heading carries the area's total. Claude
and Codex trees are maintained independently (`e47518a9`), so a skill or subagent that differs from
its twin is a neutral tag on the file (`harness.differsFromCodex`, `harness.differsFromClaude`), and
a file with no twin carries none.

**Three panes, one thing always selected in each, nothing folded.** Pane 1 lists the three areas in
the order of the agent's loop, each with a title, a one-line caption and a total, and its categories
as rows with their name, size where they have one and item count; pane 2 lists the selected
category's items, each with its file name, the tool that reads it, its status tags and its size, on
rows of one height whose long names lose their middle; pane 3 is the selected item's detail. On
arrival the first category holding a problem is selected, otherwise the first; in pane 2 the first
problem item, otherwise the first. Each pane is a listbox: arrow keys, Home and End move its
selection, and Tab moves between panes. Counts in rows are bare numbers; only totals carry a unit. A
skill counts once per directory, and its files are listed under it in pane 2, each selectable on its
own. "Read from" sits as a caption at the foot of pane 1.

| Section | Groups |
|---|---|
| Context — files the agent reads | Instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, nested `AGENTS.md`, `copilot-instructions.md`); Rules, each tagged Always or By path from its `paths:`, list or inline; Skills; Subagents; MCP config; Config files (`.codex/*`, a settings file with no permission rules); Ignore files; Hooks on `SessionStart` or `UserPromptSubmit` |
| Guardrails — what stops an action before it runs | Permission rules (each settings file with its deny, ask and allow counts, only the lists that hold a rule); Blocking hooks on `PreToolUse`, `PermissionRequest` or `PreCompact` |
| Verification — what checks the work afterwards | Hooks on `PostToolUse`, `Stop` or `SubagentStop`; Scripts (`package.json` lint, typecheck and test scripts); Git hooks (`.githooks/` files with a name Git runs, not their helper modules); CI workflows (`.github/workflows/`) |

One table in `entities/agent-files` (`hookEventStep`) sorts hook events, for this screen and for the
coverage the Analysis brief counts. An event it does not name is listed under Verification as Other
events, and a hook script on disk no config names as Unwired hooks with `harness.hookUnwired`; neither
counts toward Verification's total.

A hook row shows its event as the config writes it (`PreToolUse`), the tool that reads its config,
and its status: `harness.hookWired` means only that the script exists on disk, never that it runs;
`harness.hookMissing` is amber; a command that runs no script file (`pnpm lint`) is shown as written
with no status; a `.codex` hook also carries `harness.hookApprovalGate`, because Codex runs a new or
changed hook only after a person trusts it in `/hooks`, which no file records. Directly under the
Context heading, as the page's one figure, is what each tool reads at session start where the scan
knows it: Claude Code's
`CLAUDE.md`, every rule with no `paths:`, and root `AGENTS.md` when `CLAUDE.md` imports it (that
file is then listed under the Claude Code filter, tagged `harness.importedByClaudeMd`); and Codex's
root plus largest nested `AGENTS.md` against its default 32 KiB limit as a bar.

**The panes fill the workbench width** separated by hairlines: pane 1 is 17.5rem, pane 2 22.5rem and
pane 3 the rest, while the content is at least 64rem wide (a window 1168px wide or wider, with the rail). Narrower,
pane 3 opens as the shared centred dialog when an item is pressed, and Escape or Close returns focus
to the row; below `lg` pane 2 follows pane 1 in one column. The detail stays short: the path,
the tools that read it (each claim cited where a tool's documentation was checked), the size, the
event and config for a hook, the status with its explanation as text, the declaring text for a
script or workflow, then the content. A
skill or subagent whose Claude and Codex copies differ shows both copies side by side on shared rows
(`HarnessDriftDiff`); a hook whose script is missing shows the config that names it, where the line
to fix is.

**The wait screen is held back, never the read.** The scan reports each of its four passes (root
guides, nested `AGENTS.md`, agent directories, hook configs) and fills a bar only where the
denominator was known before the pass started — but it appears only once a read has taken longer
than the app's 400ms delay, so a fast read shows no wait screen at all and a slow bridge still gets
its stages. The scan opens only harness files and lists only the repository root and the harness
folders; it does not walk the repository's other Markdown. The read was never slowed to display it. What
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
  on 2026-09-03; the table compares reviewed intent with observation directly.
- **The verdict leads** (2026-11-15, owner). Above everything else, the number of imports the
  last record counted against the rules is the screen's one large numeral, in the danger tone
  when it is above zero, with the label "imports against the rules" and a success dot when it
  is zero. Beside it stand three quiet figures: imports observed between layers, layers, and
  modules. One line under them says when the record was taken and from what (commit, dirty
  flag or folder fingerprint) and the dependency rule in one sentence. An `unknown` record
  says why in plain words: imports no rule covers, imports from files in no layer, layers with
  no file, or files in a language the check cannot read. Before a record exists the verdict
  says the source has not been checked and that a check fills the table; the agent action in
  the header runs or copies that check. The header line is the profile title with its pattern,
  the profile switcher when several profiles exist, a live agent turn's state, "Findings &
  history" (the profile's issues and records), and the agent action.
- **The picture is one import table** (2026-11-15). Rows and columns are the profile's roles
  in profile order; the cell at row A, column B counts the imports the last record observed
  from A into B. A row header carries the role's number, name, path pattern in mono and module
  count; a column header its name, or its number when cells are narrow. Cells are one size
  on one grid with a 1px gap. An allowed pair with imports shows its count in tabular
  mono on a neutral fill that steps up with the square root of its share of the busiest pair;
  an allowed pair with none shows a faint dot, so the rule itself is on the picture; a
  forbidden pair with none is empty; a pair the record counted against the rules is the only
  coloured mark, a danger-toned outline and count. The diagonal is a dash: imports inside one
  layer are not counted. A forbidden pair whose imports the check does not govern (such as
  type-only) shows its count in quaternary ink. Under an `explicit` rule the allowed cells
  follow each role's declared reach wherever they fall. Before a record the table shows the
  rule alone. One caption line says how to read a cell and keys the dot and the red cell.
  Pointing at or focusing a cell brightens its row and column headers and names the pair in a
  fixed line above the table (`Views → Shared foundation · 61 imports · allowed by the
  rules`), which is also each cell's accessible name; at rest that line names the violation,
  else the busiest pair. Cells are buttons with one tab stop and arrow keys between them.
- **One role is always in the pane.** On arrival it is the source role of the first violation,
  else the first role that imports another, else the first role; `?role=` overrides it and a
  role the profile lacks is declined in words. Choosing a row header or a cell selects that row's
  role and writes `?role=`; a cell also marks its column's role in the pane. The pane shows the
  role's number and name, its sentence, its path patterns, the layers it may import, the layers
  it imports and the layers that import it (name, neutral bar and count; a violation in the
  danger tone with the record's file paths under it), all of its modules with each one's
  recorded-concept count, then its recorded concepts. Modules are the connected repository's
  folder and file names under the role's paths, listed through the read-only harness commands
  with no file opened; without a listing they are the modules the role's recorded concepts sit
  in, and the pane says why. Nothing in the pane or table unfolds in place.
- **At workbench width the screen does not scroll** (2026-08-30). From `xl` the pane is a 380px
  column with a hairline on its left and scrolls inside itself; the table's cells widen to
  fill the room left, from 34 to 176px, and are as tall as they are wide until the window or
  96px stops them, so the table spans the column, seven roles stand whole at 1280×800 and
  1512×945 and twelve roles fit at 1280×800. Below 52px of width a count of four digits
  abbreviates (`1.2k`). Below `xl` the pane stacks under the table and choosing a role scrolls
  it into view. Under 480px of table room a row header keeps only its number and name, so seven
  roles fit a 390px phone; more roles may scroll sideways inside the table's own area, never
  the page.
- **A role's sentence can be written in the reader's language** (2026-09-03). Beside
  `summary_<role>`, a profile may carry `summary_<role>_<locale>`, such as
  `summary_views_ko`. The screen shows the locale line to a reader in that locale
  and the canonical `summary_<role>` to everyone else, so a profile translated one
  role at a time never leaves a blank where a sentence was. `summary_<role>` stays
  the reviewed fact: it is the only sentence the agent handoff, `inspect_architecture`
  and CLI `architecture` print, and a locale line without it is refused, as is a
  locale line for a role the profile does not declare. A document whose profile this
  screen cannot read is now named in a notice above the table instead of replacing
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
- At narrow widths the verdict and the table come first in document order; the role pane
  follows and scrolls into view without covering the persistent bottom tabs, whose reserve
  stays part of the workbench.

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
