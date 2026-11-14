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
way forward (get the app in a browser, connect a source folder in the app). The shell-wide
`?focus=main` skip anchor every left-rail link carries is deliberately not a deep link.

**Setup** (`harness.views.overview`) opens with one sentence, `harness.explainer`, and beside it a
filter of the agent tools the scan found (All · Claude Code · Codex · …), hidden when one tool or
none is found. The filter narrows every list to the files that tool reads; scripts, Git hooks and CI
workflows, which no tool claims, stay under every filter because they run whichever agent worked.
Below 76rem of content the filter wraps as chips.

**A problems strip appears only when a person has something to fix**, one amber row each, and a row
opens the item concerned: a hook whose script the config names and the disk does not have
(`harness.problemHookMissing`), a hook command that names no script path
(`harness.problemHookUnresolved`), the merged `AGENTS.md` Codex reads over its 32 KiB
`project_doc_max_bytes` default (`harness.problemCodexCap`), and Claude and Codex skill or subagent
copies that differ or have no twin (`harness.problemCopyDrift`). With none, nothing is drawn: no
"all good" banner.

**Three sections in the order of the agent's loop**, three equal-height columns at `lg` and wider,
stacked below. Each has a title, a one-line caption and a total, then group rows that show the
artefact's name, its count and, for read files, its total size; a group expands in place to its
files, and a file opens the detail. Groups with no items are not drawn.

| Section | Groups |
|---|---|
| Context — files the agent reads | Instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, nested `AGENTS.md`, `copilot-instructions.md`); Rules, each tagged Always or By path from its `paths:`; Skills; Subagents; MCP config; Ignore files; Hooks on `SessionStart` or `UserPromptSubmit`, which add context rather than block |
| Guardrails — what stops an action before it runs | Permission rules (each settings file with its deny and ask rule count); Blocking hooks (events named `Pre…` or `Before…`) |
| Verification — what checks the work afterwards | Hooks on every other event; Scripts (`package.json` lint, typecheck and test scripts); Git hooks (`.githooks/`); CI workflows (`.github/workflows/`) |

A hook row shows its event as the config writes it (`PreToolUse`), the tool that reads its config,
and its status: `harness.hookWired` means only that the script exists on disk, never that it runs;
`harness.hookMissing` and `harness.hookUnresolved` are amber; a `.codex` hook also carries
`harness.hookApprovalGate`, because Codex runs a new or changed hook only after a person trusts it
in `/hooks`, which no file records. The Context header also states what each tool reads at session
start where the scan knows it: Claude Code's `CLAUDE.md` plus every rule with no `paths:`, and
Codex's merged root plus largest nested `AGENTS.md` against its 32 KiB limit as a bar.

**The detail sits beside the lists** in a 24rem panel when the content is at least 76rem wide, and
on arrival shows the first problem's item, or the first file. Below that width it waits for a press
and then takes the place of the lists, with "Back to the list". It stays short: the path, the
tools that read it (each claim cited where a tool's documentation was checked), the size, the event
and config for a hook, the status, the declaring text for a script or workflow, then the content. A
skill or subagent whose Claude and Codex copies differ shows both copies side by side on shared rows
(`HarnessDriftDiff`); a hook whose script is missing shows the config that names it, where the line
to fix is.

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
