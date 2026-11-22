---
title: A rebuilt Atlas command for the terminal
doc_type: spec
status: current
area: cli
date: 2026-11-22
decisions: [87de58d1-d9c5-41d3-a583-01ae0e4ca893]
---

# A rebuilt Atlas command for the terminal

The command stops mirroring the MCP tools and becomes the shortest way from a terminal or a pull
request into the app. It keeps four commands, `status`, `brief`, `check` and `open`, plus a narrowed
`init`. Everything else in `cli/` is deleted in an order that leaves nothing broken midway. The
same package later reaches people through the app, npm, agent plugins and Homebrew, in that order.
The first slice is a probe that can stop the build.

## Outcome: the probe failed

Step 0 ran on 2026-11-22 and missed its pass line, so steps 2, 3 and 6 to 8 are cancelled: no
`status`, `brief`, `check` or `open`, no install row, no plugin built from this package, and no npm
or Homebrew publication. Steps 1, 4 and 5 go ahead, and `cli/` keeps only `init`.

| Arm | Missed impacts (of 124) | Wrong beliefs | Controls with an invented change |
|---|---|---|---|
| A: diffstat and description | 105 | 8 | 0 |
| A': the same, run again | 99 | 7 | 0 |
| B: A plus `brief` | 100 | 6 | 0 |
| C: the full diff | 78 | 5 | 0 |

B is 2% below the mean of A and A', inside their gap of 6. `brief` names a document whose file
changed, and the reader already sees that file in the diffstat. In 4 of the 10 changes it had
nothing to list, and in 5 of the others it listed one document. Ten changes, two Sonnet readers per
arm with text only, keys written from the diff and source by agents that never saw the vault and
hashed before any packet existed, and an Opus grader with arm labels stripped. Limits: the readers
were agents, and the keys reached into source the packets did not hold, so even the full diff
covered 37%. Record: `docs/records/decisions/2026-11-22-old-cli-deleted-no-terminal-brief-87de58d1-d9c5-41d3-a583-01ae0e4ca893.md`.

The sections below are the plan as probed. Only the deletion steps still apply.

## Person and moment

1. **The owner (observed, 2026-11-22, in Korean; the lead's paraphrase).** They asked whether the
   command should be removed, because the most important part of Atlas is the view. They then decided:
   rebuild it from scratch, delete what is not needed, put it on npm at the very end and probably on
   Homebrew, and deliver Atlas as a plugin for Claude Code and Codex. The agreed framing: the command
   does not compete with the view or mirror MCP; it is the fastest door into the view.
2. **A developer who already uses a coding agent (tier 1, not observed).** The agent has just
   finished a change in their repository, or a pull request is open. They are in the terminal or in
   review. They need the few things in their own understanding that must change before they read
   the diff or merge. `docs/PRODUCT-DIRECTION.md:24-27` names this person and moment.
3. **Someone learning agents (tier 2) and a non-developer (tier 3), not observed.** They meet the
   command only as a line the app or an agent shows them. A line they cannot run is a defect.

No capture exists of anyone using a terminal brief after an agent change. Acceptance criterion 1
makes that capture; criterion 2 is the probe.

## Today

- The command runs only from a source checkout, as `node $ATLAS/cli/src/index.mjs`
  (`src/shared/config/agent/cli-invocation.ts:12-14`, `cli/README.md:21-25`, `AGENTS.md:15-16`).
  `cli/package.json:5` is `private`, and `:42` requires Node 24.
- It has 62 commands: `init` plus 61 registered runners (`cli/src/lib/cli-commands.mjs:9-71`, `:82`).
- App screens show copyable commands in that form. They come from 11 source files that build them:
  `OntologyStarterCta.tsx:27-75`, `agent-setup-packets.ts:26-194`, `agent-readiness.ts:109-173`,
  `topology-analysis.ts:223-416`, `footprint-trail.ts:160`, `vault-health.ts:13`,
  `AgentSetupTroubleshooting.tsx:142,294`, `McpProofPacket.tsx:36,45`, `CliBridgeBody.tsx:7-8`,
  `src/features/docs-vault-local/lib/manual-connect.ts:110-133` and `AgentSetupSection.tsx:28-29`.
  The app tells the person so: "This command runs inside an ontology-atlas source checkout"
  (`messages/en/firstRunStarter.json:39`); "There is no npm package" (`messages/en/atlasGit.json:98`).
- `cli/src/integration.test.mjs` is 10,336 lines and calls its launcher `run(` (`:59`) at 465 sites.
  `package.json:140-262` holds 13 `integration:cli*` scripts. Its 3.5 minute run time was reported
  by the lead and not re-measured here.
- Other code leans on the old command: the release gate (`.github/workflows/release-macos.yml:139`,
  `package.json:237`), ten `dogfood:*` scripts (`package.json:192,222-230,234`), the session hook
  (`.claude/hooks/inject-ontology-summary.sh:39-40`), the vault validator
  (`scripts/vault/validate-vault.mjs:16,25`), and the MCP server, which prints old commands as its
  "when MCP is unavailable" line (`mcp/src/ontology-engine.mjs:261-277`). The MCP verifier fails
  unless those printed commands run (`mcp/scripts/verify/checks/agent-brief.mjs:153-190`).
- A script run here on 2026-11-22 found 29 files outside `cli/` that import 18 modules inside it;
  the table under "What is deleted" names each. The Codex session hook
  (`.codex/hooks/inject-ontology-summary.sh:42-43`), the docs surface builder
  (`scripts/docs/build-docs-surface.mjs:12`) and the shared sync workflow, which tells an agent to
  fall back to `add|import|validate` (`.agents/skills/ontology-sync/workflow.md:28-32`), lean on it
  too.
- The rule that says whether a document still stands on its code exists once, in
  `mcp/src/drift/evidence-verdict.mjs:26-69`, with four answers: `current`, `stale`, `missing`,
  `unknown`. `validate_vault` returns it as `evidenceDrift` (`mcp/src/tools/validate-vault.mjs:619-680`).
  The app shows it on the project page as "To check" (`messages/en/projectPages.json:162-183`).
  No old command prints it as its own answer: `validate --json` returned no `evidenceDrift` field,
  and `workspace-brief --json` carries it nested under `health.validation` (run here, 2026-11-22).
- Measured here on 2026-11-22 at `8673a47c40`, this repository's vault `docs/ontology`: 96 documents
  name a source file; 21 are current and 75 are stale; 0 missing, 0 unknown. Of the first 50 stale
  rows, 48 name a file that changed on 2026-11-21 or 2026-11-22. The branch under them changes
  3,468 files against `main`: 1,985 modified, 808 added, 650 renamed, 25 deleted. One
  `git diff --numstat -M` over that range took 0.30 s.
- The app answers one address, `ontology-atlas://mcp?install=`, and nothing else
  (`src-tauri/src/app_shell/deep_link.rs:1-3`, `src-tauri/tauri.conf.json:70-74`,
  `tests/contract/security/url-scheme-one-door.contract.test.ts:5-9`). A second launch only brings
  the window forward and drops its arguments (`src-tauri/src/lib.rs:106-108`). The single-instance
  plugin is built with its `deep-link` feature (`src-tauri/Cargo.toml:95`), which on Windows and
  Linux hands a pressed scheme URL to the app as a launch argument.
- The app re-applies the folder picker's refusals (a home folder, a disk root, system folders, an
  app bundle) to any folder named at launch (`src-tauri/src/vault/grants.rs:140-146`, `:174-185`).
- The app finds its bundled programs beside its own executable, with no check for a disk image or
  a relocated copy (`src-tauri/src/agent_setup.rs:52-59`).
- A stock macOS login PATH holds no folder inside the person's home (`/etc/paths`, read here).
- The app bundles one program, the MCP server (`src-tauri/tauri.conf.json:45-47`).
- The cognitive-diff probe of 2026-09-13 "found the one fact that cut missed impacts by 75% —
  meaning unchanged, the code under it moved"
  (`docs/records/decisions/2026-09-19-analysis-brief-across-three-cores-683f0641-e51e-4df0-a8cf-eccb425e5ce8.md`).
  The lead's figures (16 missed impacts down to 4; backlinks and impact lists did not pay) are in no
  committed record found here.
- The coordinating session checked npm on 2026-11-22 (not re-run here): `npm view` returned E404
  for `ontology-atlas` and for `@ontology-atlas/cli`, so both names are free; `atlas` is taken
  (version `1.0.0-alpha.0`). A name is not reserved until the first publish.
- Unknown: whether the engine runs on Node 20 or 22; whether the map's side panel shows the
  "changed after this document was written" line; whether the document editor asks before an
  in-app move away from unsaved edits (its guard at `DocsVaultEditor.tsx:366-372` covers closing the
  window; the planning editor asks at `PlanningPage.tsx:317-321`).

## Problem and alternatives

**Ranked by what each gives back to a person against its cost.**

1. *App screens show commands their reader cannot run.* Every app user meets it; removing or
   replacing the lines is cheap. First, because it is a defect today.
2. *A person in a terminal has no Atlas answer about the change in front of them.* The highest
   value for tier 1 and unproven outside the app, so a probe comes before the build.
3. *61 mirrored commands and a 10,336-line test cost every change to `cli/` and `mcp/`.* It gives
   back maintainer time, and nothing to a user directly. Deleting waits until the callers have moved.
4. *Nobody without a checkout can get the command.* The app bundle solves it for app users; npm,
   plugins and Homebrew widen reach and are the only irreversible steps, so they come last.

**The request is partly a symptom.** "Rebuild the CLI" follows from "the command mirrors MCP", and
the cause under that is that the command never had a person: its commands were written for agents
that now have MCP. So the rebuilt command is specified from one moment, not from the old list.

| Way | Value | Usability | Feasibility | Local-first | Why it lost or won |
|---|---|---|---|---|---|
| Keep the 62 commands and publish them | none new | 62 names, one useful to a person | ready | fine | Mirrors what agents already have; keeps the test cost |
| Remove the command (the owner's first question) | removes cost | terminal and CI get nothing | easiest | fine | A CI runner cannot install the app, so a pull request check has no channel at all |
| App only: a "copy brief" button | reaches app users | leaves the terminal to press it | small | fine | The moment is in the terminal and in review, before the app is open |
| **Four commands that end in the app** | the drift line where the change is read | `git`-shaped | engine exists | no network | Chosen, behind the probe |

**What changed in the proposed shape, and why.**

- `status` is not the headline. A whole-vault count on this repository reads "75 of 96
  changed", mostly from one structure cleanup. If that cleanup changed no meaning, which nobody has
  checked, it is the case the falsifier in
  `docs/records/decisions/2026-09-19-drift-line-names-its-evidence-3030afde-cf44-4d45-887e-92ec3dfb3903.md`
  describes. `status` keeps one line for the count as a backlog; `brief` is the first command.
- `brief` measures the change, not the whole history: which documents name a file this change
  touched and were not updated in it. A file that only moved is said to have moved. Each file shows
  its changed line counts, so a two-line import rewrite reads as one.
- `check` reports and exits 0 unless the caller names states with `--fail-on`. A default that turns
  a pull request red on a timestamp trains people to bypass it.
- `open` is a command, not a link. A node address in the `ontology-atlas://` scheme is what
  `docs/DECISIONS.md:599` kept out ("no uid or node addresses"), and that stays out. The command
  starts the app with arguments instead. That is a second inbound door, so `docs/DECISIONS.md:599`
  is narrowed, not left standing whole. On macOS a web page cannot reach it. On Windows and Linux a
  pressed scheme URL arrives as an argument too, so there the door is only as closed as its
  grammar, written under "The `open` door".
- Output ends with one `ontology-atlas open` line, for the first document to check, not one per row.
- The command has one name, `ontology-atlas`, and no short `atlas`. MongoDB's Atlas CLI is common
  among tier-1 developers and installs `atlas` through Homebrew and npm. Two names would put a
  command in docs, screenshots and agent instructions that some readers do not have, and a global
  npm install would collide with the existing file. With one name the package, the command, the
  plugin and the brand match, and a person who wants it shorter makes their own alias.
- Sources are stated per group, in plain words, not as a tag on every line.
- The states are the engine's own four, not three: a path that is gone needs a different act
  (fix the path) than a file that changed (re-read the meaning). The brief adds a fifth, `updated`,
  for a document changed in the same change as its code. The engine's date rule would call that
  document current, and Atlas has not checked the new text, so it is never reported as current.

## Flow

1. When the person runs `ontology-atlas brief` in a repository after an agent's change, Atlas reads the
   uncommitted changes and prints which documents to check, each with the file and its line counts.
   With no uncommitted changes it reads the newest commit and says so on the first line.
2. When they run `ontology-atlas brief main..HEAD`, Atlas reads that range instead, and says how many
   uncommitted files are not part of it.
3. When the agent rewrote a document in the same change, Atlas lists it under "Updated with the
   code" and says it did not check the new text. This is where the agent can be wrong, and Atlas
   does not vouch for it.
4. When a document names only a folder, or Git cannot date a file, Atlas lists it under "Unknown"
   with the reason. It is never counted as fine.
5. When they run `ontology-atlas open capabilities/checkout-total`, the app comes forward. If it
   is already showing that folder and nothing is waiting on the person, it selects the document on
   the map and opens its panel. The command prints one line and returns; it cannot see what the
   app then did, and says so.
6. When opening would change something the person has not agreed to, the app asks first, because
   the command may have been run by an agent. It asks for a folder the app has not opened before,
   for a switch away from the folder on screen, for unsaved edits, and for an agent approval that
   is waiting. "Not now" changes nothing.
7. When a pull request is opened, CI runs `ontology-atlas check origin/main..HEAD --comment`, and a
   workflow step the team wrote posts the printed Markdown. Atlas itself posts nothing.
8. When the person presses "Install the ontology-atlas command" in the app's Settings, the app
   shows the one file it will write and its contents, writes it, and says whether a new terminal
   will find it. Until a terminal will, the app shows no command line on any other screen.

## States

| State | Terminal | Web | macOS app |
|---|---|---|---|
| No Atlas folder | `cli.error.noFolder`, exit 2; next: open the folder in the app or `ontology-atlas init` | Out of scope — the hosted web cannot be started on a local folder from a terminal | First run, unchanged |
| Not a Git repository | `brief`, `check`: `cli.error.noGit`, exit 2. `status`: counts documents, Git line reads unknown, exit 0 | Out of scope — same reason | `toCheckEvidenceUnreadable`, unchanged |
| Nothing to check | `cli.brief.nothing`, exit 0 | Out of scope — same reason | `toCheckEmpty`, unchanged |
| Documents to check | The groups below; last line `cli.next.open` | Out of scope — same reason | After `ontology-atlas open`: map focused on the document, panel names the same file |
| Unknown | `cli.brief.unknownHeading` with the reason per document | Out of scope — same reason | Unchanged |
| Largest measured change (3,468 files, 99 documents) | First 20 rows per group, then `cli.more` with the count and `--all` | Out of scope — same reason | "To check" keeps its own row limit (`toCheckDialogMore`) |
| `open`: app not installed | `cli.error.noApp`, exit 2; names the document's file path and the download page | Out of scope — a web page cannot be told a local path | Not reached |
| `open`: same folder, nothing waiting | `cli.open.sent`, exit 0 | Out of scope — same reason | Map focused on the document, panel open |
| `open`: a new folder, another folder on screen, unsaved edits, or an approval waiting | `cli.open.sent`, exit 0 | Out of scope — same reason | Dialog `appCommand.openTitle` with one `appCommand.openReason*` line per fact; "Open" or "Not now" |
| `open`: a folder the app refuses (home, disk root, system folder, app bundle) | `cli.open.sent`, exit 0 | Out of scope — same reason | Notice `appCommand.openRefused`; the window does not move |
| `open`: arguments outside the grammar | Not reached from the command | Out of scope — same reason | Nothing on screen; the reason is logged, the argument is not |
| `open`: no such document | `cli.error.noDocument` with the closest slug, exit 2 | Out of scope — same reason | Not reached |
| Command not installed | Shell reports command not found | Out of scope — a browser cannot write to PATH | Settings row `appCommand.body`, button `appCommand.install`; no other screen shows a command line |
| Installed, and a new terminal finds it | `ontology-atlas --version` prints the version and where it runs from | Out of scope — same reason | `appCommand.installed`, button `appCommand.remove`; other screens may show command lines |
| Installed, and a new terminal does not find it | Shell reports command not found | Out of scope — same reason | `appCommand.notOnPath` with the line to copy and "Check again"; no other screen shows a command line |
| A file or link is already at the install path | Not reached | Out of scope — same reason | `appCommand.fileExists`; the app never writes over or follows it |
| Another copy comes first on PATH | Runs the other copy; `--version` names its location | Out of scope — same reason | `appCommand.otherCopyFirst` names that path; no other screen shows a command line |
| The app runs from a disk image or a temporary copy | Not reached | Out of scope — same reason | `appCommand.moveAppFirst`; install is not offered |
| Remove, after the file was replaced | Not reached | Out of scope — same reason | `appCommand.notOurs`; the file is left as it is |
| Install could not write | Not reached | Out of scope — same reason | `appCommand.failed`; nothing changed; choose another folder |

## Copy

Human output follows the terminal's language (`--lang`, then `ATLAS_LANG`, then `LC_ALL`,
`LC_MESSAGES`, `LANG`), in the app's four languages, English otherwise. `--json` is never
translated. Colour is used only on a terminal and never when `NO_COLOR` is set. Paths are relative
to the repository and use `/` on every platform. The command has one name, so every printed line
names `ontology-atlas` literally.

**A name is data, never layout and never a command.** A slug, a title and a path come from files
that anyone who can commit wrote. Three rules hold for every output:

- Each name prints on one line. A control character in it (a newline, an escape sequence, a
  direction override) prints as a visible escape such as `\n` or `\x1b`.
- On the `Next` line and in the JSON `open` field the slug is quoted for a shell by the rule the
  app's copied packets use (`src/shared/config/agent/cli-invocation.ts:28-30`), unless it holds only
  ASCII letters, digits, `/`, `.`, `_` and `-`.
- In `--comment` every name sits inside a code span fenced with more backticks than the name holds,
  so a link, a mention or HTML in a name is shown as text and not rendered.

This spec holds English only: `pnpm docs:language` counts any Hangul line under `docs/specs/` as a
violation (`scripts/quality/markdown-language/check.mjs:17-22`). Three sentences are reused word for
word from the app, so their Korean, Japanese and Chinese already exist under the same keys in
`messages/<locale>/projectPages.json`. The other strings are authored in all four languages in the
slice that adds each command; the Korean drafts went to the lead with this spec.

```text
$ ontology-atlas brief
Change   uncommitted changes · 5 files
Folder   atlas/ · 96 documents name a source file

To check · 2 documents were not updated, and a file they name changed
(Atlas compared Git with the documents.)

  Checkout total   capabilities/checkout-total
    src/cart/total.ts changed after this document was written. (+18 -4)
  Coupon rules   capabilities/coupon-rules
    src/cart/coupon.ts is not at that path in this repository. It moved to src/pricing/coupon.ts with no other change.

Updated with the code · 1 document
(The author's claim. Atlas did not check the new text.)

  Order history   capabilities/order-history
    src/orders/history.ts changed, and this document changed with it. (+40 -12)

Unknown · 1 document
(Atlas cannot tell whether these still hold.)

  Cart   domains/cart
    This document names only the folder src/cart/, where 3 files changed. Name a file in it to make it checkable.

In no document · 2 of 5 changed files
(Atlas knows nothing about these files.)

  src/cart/tax.ts (+61 -0)
  src/cart/tax.test.ts (+88 -0)

Next   ontology-atlas open capabilities/checkout-total
```

```text
$ ontology-atlas status
Folder          atlas/ · 99 documents · 96 name a source file
Now             Uncommitted changes touch files named by 2 documents that were not updated. Run: ontology-atlas brief
Since written   21 unchanged · 75 name a file that changed after · 0 name a path that is gone · 0 unknown
```

```text
$ ontology-atlas check origin/main..HEAD --fail-on stale,missing
Change   origin/main..HEAD · 3 commits · 14 files
To check · 2 documents were not updated, and a file they name changed
  capabilities/checkout-total   src/cart/total.ts (+18 -4)
  capabilities/coupon-rules     src/cart/coupon.ts moved to src/pricing/coupon.ts
Unknown · 1 document     In no document · 6 of 14 changed files
Result   failed: 2 documents are in a state named by --fail-on stale,missing
```

```text
$ ontology-atlas open capabilities/checkout-total
Asked Ontology Atlas to open Checkout total. If the app asks a question, answer it there.
```

| Key | Where it appears | English |
|---|---|---|
| `cli.brief.changeUncommitted` | `brief`, `status`, line 1 | `uncommitted changes · {files} files` |
| `cli.brief.changeNewestCommit` | `brief`, under line 1, clean tree | `(No uncommitted changes, so Atlas read the newest commit.)` |
| `cli.brief.rangeExcludesUncommitted` | `brief <range>`, under line 1 | `{count} uncommitted files are not part of {range}.` |
| `cli.brief.toCheckHeading` | `brief`, `check` | `To check · {count} documents were not updated, and a file they name changed` |
| `projectPages.detail.toCheckStaleMoved` (reused) | to-check row | `{path} changed after this document was written.` |
| `projectPages.detail.toCheckStaleGone` (reused) | to-check row, path gone | `{path} is not at that path in this repository.` |
| `cli.brief.movedOnly` | after the row above | `It moved to {path} with no other change.` |
| `cli.brief.updatedHeading` | `brief` | `Updated with the code · {count} documents` |
| `cli.brief.updatedRow` | updated row | `{path} changed, and this document changed with it.` |
| `cli.brief.unknownHeading` | `brief` | `Unknown · {count} documents` |
| `cli.brief.unknownFolderOnly` | unknown row | `This document names only the folder {path}, where {count} files changed. Name a file in it to make it checkable.` |
| `cli.brief.unknownUnreadable` | unknown row | `Atlas could not read this document: {reason}.` |
| `cli.brief.noDocumentHeading` | `brief` | `In no document · {count} of {files} changed files` |
| `cli.brief.nothing` | `brief`, zero to check | `Nothing to check in this change: no document names a file it touched. That does not say the meaning is right.` |
| `projectPages.detail.toCheckEvidenceNoPaths` wording | `status`, `brief`, no paths | `No document names a source file, so there is nothing to compare with Git history.` |
| `cli.source.atlas` / `.author` / `.unknown` / `.none` | under each heading | `(Atlas compared Git with the documents.)` / `(The author's claim. Atlas did not check the new text.)` / `(Atlas cannot tell whether these still hold.)` / `(Atlas knows nothing about these files.)` |
| `cli.status.clean` | `status`, clean tree | `No uncommitted changes.` |
| `cli.more` | any group over 20 rows | `{count} more are not listed. Add --all to list them.` |
| `cli.next.open` | last line of `brief` | `Next   ontology-atlas open {slug}` |
| `cli.check.reported` | `check`, no `--fail-on` | `Result   reported, not failed (no --fail-on given)` |
| `cli.check.passed` / `.failed` | `check --fail-on` | `Result   passed: no document is in a state named by --fail-on {states}` / `Result   failed: {count} documents are in a state named by --fail-on {states}` |
| `cli.open.sent` | `open` | `Asked Ontology Atlas to open {title}. If the app asks a question, answer it there.` |
| `cli.error.noFolder` | stderr, exit 2 | `ontology-atlas: no Atlas folder in {path} or above it. Open this folder in the Ontology Atlas app, or run: ontology-atlas init` |
| `cli.error.noGit` | stderr, exit 2 | `ontology-atlas: {path} is not in a Git repository, so Atlas cannot tell which files changed. ontology-atlas status still counts the documents.` |
| `cli.error.noCommit` | stderr, exit 2 | `ontology-atlas: Git has no commit named {name} here. On a CI runner, fetch the full history first (actions/checkout with fetch-depth: 0).` |
| `cli.error.noDocument` | stderr, exit 2 | `ontology-atlas: {typed} is not a document in {folder}. Closest: {slug}` |
| `cli.error.noApp` | stderr, exit 2 | `ontology-atlas: Ontology Atlas is not installed on this computer, so there is nothing to open. The document is {file}. The app: https://ontologyatlas.com/download` |
| `cli.error.unknownCommand` | stderr, exit 2 | `ontology-atlas: unknown command "{typed}". Did you mean {closest}? Run ontology-atlas --help for the list.` |
| `appCommand.title` / `.body` | app Settings | `ontology-atlas command` / `Run Atlas from a terminal in any project. Installing writes one file, {path}, which starts the copy of the command inside this app.` |
| `appCommand.install` / `.remove` | buttons | `Install the ontology-atlas command` / `Remove the command` |
| `appCommand.installed` | after install | `The ontology-atlas command is at {path}. It runs version {version} from this app.` |
| `appCommand.notOnPath` | after install, not found | `The command is at {path}, but a new terminal will not find it yet: {dir} is not on your PATH. Add this line to your shell profile, open a new terminal, then press Check again: {line}` |
| `appCommand.checkAgain` | button | `Check again` |
| `appCommand.fileExists` | before install | `A file that Atlas did not write is already at {path}. Atlas left it as it is. Remove or rename that file, then install again.` |
| `appCommand.otherCopyFirst` | after install | `A terminal runs {otherPath} first, not this app's copy at {path}. Remove one of the two so that commands shown in Atlas match what runs.` |
| `appCommand.moveAppFirst` | instead of install | `Ontology Atlas is running from a disk image or a temporary copy, so the command would stop working when it closes. Move Ontology Atlas to the Applications folder, open it from there, then install the command.` |
| `appCommand.notOurs` | on remove | `The file at {path} is no longer the one Atlas wrote. Atlas left it as it is.` |
| `appCommand.removed` / `.failed` | after remove / on error | `Removed {path}. Nothing else was changed.` / `Could not write {path}: {reason}. Nothing was changed. Choose another folder.` |
| `appCommand.openTitle` / `.openBody` | dialog | `Open {title} in {folder}?` / `A terminal command asked for this.` |
| `appCommand.openReasonNewFolder` | dialog, new folder | `Atlas has not opened {folder} before.` |
| `appCommand.openReasonOtherFolder` | dialog, other folder on screen | `Atlas is showing {current} now and will switch to {folder}.` |
| `appCommand.openReasonUnsaved` | dialog, unsaved edits | `{document} has edits that are not saved.` |
| `appCommand.openReasonApproval` | dialog, approval waiting | `An agent in {current} is waiting for your answer.` |
| `appCommand.openConfirm` / `.openDismiss` | dialog buttons | `Open` / `Not now` |
| `appCommand.openRefused` | notice | `A terminal command asked to open {folder}. Atlas does not open that folder: {reason}.` |

`check --comment` prints Markdown with the same sentences: a heading `Atlas: {count} documents to
check`, one bullet per document, the unknown and in-no-document counts, and a last line naming
`ontology-atlas open {slug}` in a code span. It carries no absolute path.

## The `open` door

`open` lets a local process ask the app to show one document. It is the app's second inbound door
after `ontology-atlas://mcp?install=`, and it follows the same manner: reject, never repair.

- **Grammar.** The app answers exactly three launch arguments in this order: the literal
  `--open-document`, one absolute folder path, one slug. Any other count, order or flag is refused
  whole. A launch in which any argument holds `://` or starts with `ontology-atlas:` is never read
  as this door.
  The slug is at most 512 bytes, in NFC, with no `..` segment, no leading `/`, no backslash, no
  control character and none of `?`, `#`, `%`; a `uid` is never accepted. Nothing is trimmed,
  decoded or corrected.
- **Folder.** Rust canonicalises the folder and applies the refusals it applies to a folder named
  at launch (`src-tauri/src/vault/grants.rs:174-185`). A refused folder is named in a notice and the
  window does not move.
- **The grant.** Rust keeps the pending folder and gives the page only a request number, the
  folder's name and the slug. Rust grants the folder only when the person presses "Open", from the
  request it kept; a path sent by the page is never granted through this door. A newer request
  replaces an older one, and "Not now" forgets it.
- **Asking.** A folder already granted and on screen, with nothing waiting, opens the document with
  no dialog. Every other case asks: a new folder, another folder on screen, unsaved edits, an agent
  approval waiting. After "Open" the app moves exactly as it does when the person navigates by
  hand, so an editor with unsaved edits asks its own question next.
- **What a refusal does.** It is logged with its reason and dropped. The argument itself is not
  logged. Nothing is written, enabled or run.
- **Gate.** `tests/contract/security/launch-argument-one-door.contract.test.ts`, added through
  `/gate-probe` beside `url-scheme-one-door`, holds the grammar, holds that a scheme URL in the
  arguments never reaches this door, and holds that the grant is called only from the press.

## Exit codes

One table for every command, in line with `docs/DECISIONS.md:977`: an exit code says whether the
input could be answered, not whether the answer is empty.

| Code | Meaning | Examples |
|---|---|---|
| 0 | Answered | Nothing to check; documents to check with no `--fail-on`; `status` outside Git |
| 1 | Answered, and a state the caller named with `--fail-on` was found | `check --fail-on stale` with one stale document. Only `check` returns 1 |
| 2 | Could not answer | No Atlas folder, no Git for `brief` or `check`, unknown commit, unknown document, unknown command or flag, app not installed for `open` |

`--fail-on` takes `stale`, `missing`, `unknown`, `updated`, comma-separated. Any other value is exit
2 with the closest value named.

## JSON for agents and CI

`--json` on `status`, `brief`, `check` and `open` prints exactly one JSON document on stdout on
every path, including errors. Field names and state values never change with the language.

```json
{
  "schema": "atlas.brief/v1",
  "ok": true,
  "folder": "atlas",
  "change": { "kind": "range", "range": "origin/main..HEAD", "base": "4a0f795", "head": "8673a47", "commits": 3, "files": 14, "uncommittedFilesExcluded": 0 },
  "counts": { "toCheck": 2, "updatedWithCode": 1, "unknown": 1, "filesInNoDocument": 6 },
  "documents": [
    { "slug": "capabilities/checkout-total", "uid": "0b0e…", "title": "Checkout total", "kind": "capability",
      "state": "stale", "source": "atlas", "documentChanged": false,
      "files": [{ "path": "src/cart/total.ts", "change": "modified", "added": 18, "removed": 4 }],
      "open": "ontology-atlas open capabilities/checkout-total" },
    { "slug": "capabilities/coupon-rules", "state": "missing", "source": "atlas", "documentChanged": false,
      "files": [{ "path": "src/cart/coupon.ts", "change": "renamed", "to": "src/pricing/coupon.ts", "added": 0, "removed": 0 }] },
    { "slug": "capabilities/order-history", "state": "updated", "source": "author", "documentChanged": true },
    { "slug": "domains/cart", "state": "unknown", "source": "unknown", "reason": "folder-only" }
  ],
  "filesInNoDocument": { "total": 6, "listed": ["src/cart/tax.ts", "src/cart/tax.test.ts"], "truncated": true },
  "result": { "failOn": ["stale", "missing"], "failed": true }
}
```

- In a brief, `state` is one of `stale`, `missing`, `unknown`, `updated`. The first three are
  values of `mcp/src/drift/evidence-verdict.mjs:24`. `updated` is the brief's own: the document
  changed with the code and Atlas did not check its text. A brief never says `current`.
  `source` is `atlas`, `author` or `unknown`.
- The `open` field is a shell line, with the slug quoted by the rule under Copy.
- `result` appears only on `check`. `status` uses `atlas.status/v1` with `sinceWritten` counts in the
  shape of `evidenceDrift.counts`. `open` uses `atlas.open/v1` with `"sent": true`; the command
  cannot see whether the app opened the document or asked.
- An error is `{ "schema": "atlas.error/v1", "ok": false, "error": { "code": "no_folder", "message": "…", "next": "…" } }`,
  with codes `no_folder`, `no_git`, `no_commit`, `no_document`, `no_app`, `usage`.
- No absolute path and no file content appear in any JSON or `--comment` output.

## Edge cases

- **Zero, one, largest.** Zero changed files: `cli.brief.nothing`. One document: singular wording
  through the catalogue's plural rule. Largest measured: 3,468 files over 99 documents; 20 rows per
  group, then `cli.more`.
- **First run, no Atlas folder.** Exit 2 with the two next steps. `ontology-atlas init` creates the same
  folder the app's first run creates, and no agent configuration.
- **No Git.** `brief` and `check` exit 2; `status` answers with the Git line unknown.
- **Uncommitted changes.** `brief` with no range reads staged, unstaged and new unignored files.
  With a range it reads only the range and counts what it left out.
- **Shallow clone on a CI runner.** The base commit is absent: `cli.error.noCommit`, exit 2, never
  an empty answer.
- **Windows paths.** A document path written with `\` is read as `/`. Output always uses `/`. A
  path that differs from Git's only by letter case is reported as gone, with the closest path named.
  The `Next` line is quoted for PowerShell there (a single quote doubled). Windows runs are
  confirmed by CI only.
- **Hangul.** Slugs, titles and file paths print as written; a typed slug is normalized to NFC
  before matching; Git's octal path quoting is never shown.
- **Folder moved, renamed or unreadable.** The folder is found by its contents from the working
  directory upward, so a rename needs no setting. An unreadable document is one `unknown` row.
- **Two edits at once.** `status`, `brief`, `check` and `open` write nothing, so a concurrent edit
  cannot be lost.
- **Offline.** No command uses the network. `check --comment` prints; it does not post.
- **A folder inside a larger repository.** When document paths are relative to a sub-folder that Git
  does not mark, `--repo <path>` names it. The app's own binding lives in the ignored
  `.ontology-atlas/project-sources.json` (`cli/README.md`, `connect-source` row), so a CI runner
  cannot read it.
- **The app moved or deleted after the command was installed.** The installed file prints
  `cli.error.noApp` with its expected location instead of a shell error.
- **Several copies on one machine.** `ontology-atlas --version` prints the version and the path it
  runs from. The command, the plugin and the app share the app's version number. The app's row
  names another copy that a terminal would run first.

## What is deleted, and in what order

**Commands.** All 61 runners in `cli/src/lib/cli-commands.mjs:9-71` and their modules under
`cli/src/commands/` and `cli/src/lib/`. Each has an MCP tool or an app screen that does the same
work. `init` stays, narrowed to creating the folder from `cli/templates/`. `export` (JSON-LD and
GraphML) and `wiki-index --write` have no MCP twin; they go, and return on the first request.

**Tests.** `cli/src/integration.test.mjs`, the test files beside deleted modules, the 13
`integration:cli*` scripts, and their rows in `scripts/lib/check-rules/cli.mjs:36-113`. One test
file per kept command replaces them.

**Screens.** The copyable command lines built by the 11 files listed under Today. Lines whose work
the app already does (connect, verify, validate) are removed. Lines inside text handed to an agent
are rewritten to name the MCP tool. `CliBridgeBody` is rewritten around `ontology-atlas init` at
step 3. This slice is being built now.

**Internal scripts.** The ten `dogfood:*` scripts and the release gate call the engine under
`mcp/src/` and `mcp/scripts/verify.mjs` directly, and so do both session hooks
(`.claude/hooks/inject-ontology-summary.sh:39-40`, `.codex/hooks/inject-ontology-summary.sh:42-43`).
They are internal checks and need no public command. `scripts/docs/build-docs-surface.mjs:12` keeps
reading the command list, which shrinks to five.

**When MCP is unavailable.** Today the server prints old commands as a way around itself, its
verifier requires them to run (`mcp/scripts/verify/checks/agent-brief.mjs:153-190`), and the sync
workflow tells an agent to write through `add|import|validate`
(`.agents/skills/ontology-sync/workflow.md:28-32`). From step 4 there is no write path around MCP.
An agent without MCP reads the vault's Markdown files directly, writes nothing to the vault, and
tells the person that the Atlas connection is missing and that the app's Connect Agent button
restores it. `ontology-atlas status` and `brief` still answer, read-only, where the command is
installed. The server's `cliFallbackCommands` field, its verifier check and the workflow paragraph
go together at step 4.

**Modules that code outside `cli/` imports.** Regenerated by script on 2026-11-22: 29 files import
18 modules. Each module is kept, moved, or deleted with the contract that needed it.

| Module under `cli/src/` | Imported by | What happens |
|---|---|---|
| `lib/cli-commands.mjs` | docs surface builder and its test, `launch-docs-current.test.ts`, `npm-channel-retired` | Kept; lists five commands |
| `lib/mcp-bridge/schema.mjs`, `parse-frontmatter.mjs`, `validate.mjs`, `absorb.mjs` | 2 scripts, 8 vault-format, MCP and CLI contracts | Deleted. Each only re-exports an `mcp/src` module; importers name that module. `absorb.contract` loses its "both bindings" case |
| `lib/mcp-bridge/mcp-module.mjs` | `check-mcp-source-dependencies.mjs` | Deleted with the two-package resolver; the dependency check moves to `mcp/` |
| `lib/mcp-bridge/mcp-call.mjs`, `lib/query-result-contract/agent-brief/agent-brief.mjs` | an MCP restart test, `smoke-memory-loop.mjs` | Moved to `mcp/` as test support |
| `lib/mcp-bridge/mcp-metadata.mjs` | 2 packaging checks, `smoke-clean-onboarding.mjs` | Moved to `mcp/src` |
| `lib/relation-types.mjs` | `check-package-contracts.test.mjs` | Deleted with `relate`; the check reads the MCP schema's list |
| `lib/vault-files/atomic-write.mjs`, `write-vault.mjs`, `walk-vault.mjs` | `vault-integrity-guards`, `library-never-enters-the-graph` | Deleted: the kept commands write nothing to a vault, and `init` only creates new files. The contracts keep their MCP half |
| `lib/agent-setup/agent-files.mjs` | `agent-instruction-files`, `agent-files`, `skill-parity`, `vault-agent-guide` | Deleted. The app's copy (`src/entities/agent-files/`) becomes the one classifier; `agent-files.contract`, which held the two copies equal, goes |
| `lib/export-format/interop-format.mjs` | `interop-format.contract` | Deleted with `export` and that contract; the app's copy stays |
| `lib/git/git-snapshot.mjs` | `atlas-git-summary.contract` | Deleted with `snapshot`; the contract keeps the app copy against its fixtures |
| `commands/library/wiki-validate.mjs` | `wiki-report.contract` | Deleted; the contract keeps its MCP and app surfaces |
| `commands/local-vault/validate.mjs` | `known-codes-drift.contract` | Deleted with that contract and the other `tests/contract/cli/` files that test deleted commands |

Two of these are security contracts, and each keeps the half that guards a write:

- `tests/contract/security/vault-integrity-guards.contract.test.ts:25-27` imports the CLI's writer
  and walker beside MCP's. The MCP half (atomic write, slug-to-path, walk) survives unchanged. The
  CLI half goes only when no kept command writes into a vault.
- `tests/contract/security/agent-instruction-files.contract.test.ts:4` reads the classifier's rules
  from the CLI copy. Both of its assertions survive: every instruction file the classifier names is
  refused by the vault write tools and by auto-approve. It reads the rules from the app's copy.

| Step | What happens | What still works after it |
|---|---|---|
| 0 | Probe (below). Nothing in the product changes | Everything |
| 1 | App screens stop showing lines that cannot run: lines whose work the app does are removed, lines handed to an agent name the MCP tool. Does not wait for the probe | Old commands, all callers |
| 2 | `status`, `brief`, `check`, `open` are added beside the old commands; the app accepts the `open` arguments, with its contract | Old commands, all callers |
| 3 | The app bundles the command and gains the install row. A screen shows an `ontology-atlas` line only when the command is installed and a new terminal finds it. `npm-channel-retired` is rewritten through `/gate-probe` to allow that line in those screens only; every npm form stays banned | Old commands, internal callers |
| 4 | Internal callers and the 29 importers move off the old modules; MCP answers stop printing old commands | Old commands exist, unused |
| 5 | Old commands, their modules and their tests are deleted | The five commands |
| 6 | The plugin is built from the packed package and tried from a local folder, under its own decision record | Unchanged |
| 7 | The package is published to npm, after `npm pack --dry-run` and the owner's yes at that moment; `npm-channel-retired` admits the published form | Unchanged |
| 8 | The plugin is listed in this repository's own marketplace; then the Homebrew tap | Unchanged |

Steps 2, 3, 4, 5 and 7 each change a public contract: the command set, what the app may write
outside a vault, what MCP answers, what is published. Each waits for the decision record named
below. Two standing rules are amended in the slice that first contradicts them:
`.claude/rules/surfaces.md:151-164` ("Two distribution channels only", and "installs into an
app-owned location") at step 3 and again at step 7, and `AGENTS.md:16` ("There is no npm package")
at step 7.

## Distribution

- **App.** The app carries the command beside its MCP server and adds one Settings row. Pressing
  the button shows the file and its contents, then writes one file. The folder is one inside the
  person's home that is already on their login PATH; when there is none, as on a stock macOS
  account, it is `~/.local/bin` and the row shows the one line to add to the shell profile. The app
  does not edit a shell profile, ask for an administrator password or download anything.
- **Installed means found.** The app counts the command as installed only when the file is written
  and a new terminal would run that file. Until then the row says what is missing and no other
  screen shows a command line.
- **What the app refuses.** It never writes over or follows a file or link already at the path. It
  does not offer install while it runs from a disk image or a temporary copy, because the file
  would name a location that disappears. "Remove the command" deletes only a file the app wrote and
  can still recognise.
- **No bare line in a public release before step 7.** Until the package is published, nothing a
  release hands a reader as an instruction (the root README, the guide, release notes, the download
  page, a screenshot) shows a bare `ontology-atlas <command>` line or any npm form. A stranger could
  publish that name first, and a reader who then installed it by name would run the stranger's
  code. The app's own screens are the exception, and only in the installed-and-found state. Where
  a command must be documented earlier (`cli/README.md`, this spec), the text beside it says the
  command comes from the app's install row and is not on npm.
- **npm, last.** One package, `ontology-atlas`, with one command of the same name. It is one bundled
  file with no `dependencies` and no lifecycle scripts, and the `npm pack --dry-run` output is read
  for exactly that before the owner is asked. It holds the command, the MCP server
  (`ontology-atlas mcp`) and the plugin files. Publishing needs the owner's explicit yes at that
  moment (`.claude/rules/forbidden.md:84`).
- **`ontology-atlas-mcp` is never published.** Old guidance told people to run the server through
  `npx` (`docs/DECISIONS.md:4624`; both package names are in `.claude/rules/surfaces.md:153-154`),
  so that name stays one a stranger could take.
- **Owner option: reserve the names early.** Publishing an empty placeholder under `ontology-atlas`
  and `ontology-atlas-mcp` now would close both openings. It is a publish, so it needs the owner's
  yes; this spec does not assume it.
- **Homebrew.** An own tap (`wlsdks/tap`) with a formula named `ontology-atlas` that installs the
  published package at a pinned checksum. homebrew-core is not attempted.

## Agent plugins

The plugin stays in the order at step 6, but this spec does not decide its details: it cannot test
them yet. The plugin slice writes its own decision record and its own acceptance criteria, one of
which is that the hook's line is seen in a real session and is printed once per change of its
count, not at every stop. What follows is the intended shape.

Plugin format facts were read on 2026-11-22 by the coordinating session from
`code.claude.com/docs/en/plugins/`, `developers.openai.com/plugins/build/plugins`,
`developers.openai.com/plugins/deploy/submission` and `learn.chatgpt.com/docs/plugins`. They were
not re-read here.

**One package, several doors.** The plugin is the npm package seen by an agent host, not a second
product. The package root carries `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, one
`skills/` folder, one `.mcp.json`, and `hooks/hooks.json`. The repository carries
`.claude-plugin/marketplace.json`, which Claude Code reads and Codex reads as its compatible form;
its plugin entry names the npm package as its source at a pinned version. The plugin is named
`ontology-atlas` and is never renamed.

| Part | What the plugin carries | Runs by itself? |
|---|---|---|
| MCP server | The server inside the installed plugin, started as `node ${CLAUDE_PLUGIN_ROOT}/…`. Not `npx`: a session start then downloads nothing, and the version is the one the person installed | Starts with the session. Read tools answer without asking |
| Vault writes | The server's write tools | Never. The host's permission prompt decides; the Codex manifest sets write tools to ask |
| Skills | `brief`, `sync`, `bootstrap`, `extract`, `review`, `grow`, `absorb`, invoked in Claude Code as `/ontology-atlas:brief` and so on. Codex documents no slash commands, so there they are skills only | Only when the person or the agent invokes them |
| Hook | Claude Code only: when the agent stops, the `status` sentence, because it measures uncommitted changes and not the session: `Atlas: uncommitted changes touch files named by 2 documents that were not updated. /ontology-atlas:brief`. Silent at zero | Yes, so it is read-only, has no network, writes nothing, blocks nothing, and gives up silently after 2 s |
| Command | `bin/ontology-atlas`, the same program | No |

- **Codex ships without the hook.** Codex skips plugin hooks until the person trusts them, and a
  plugin with lifecycle hooks cannot be listed in its public directory. The same line is the last
  step of the `sync` skill there.
- **Never automatic, on any host:** creating an Atlas folder, any write, installing the app,
  posting a comment, any network request.
- **The extension rule changes first.** `.claude/rules/forbidden.md:71-75` names MCP tools and
  skills as the extension mechanism. A hook that Atlas ships is a third kind of thing that runs in
  the host. The slice that ships it amends that rule to name hooks with the limits above.
- **Two Atlas servers in one session are allowed.** The plugin does not look for a server the app
  configured: reading agent configuration is fenced to the app's own reader
  (`.claude/rules/surfaces.md:57-70`), and `patch_concept(expected_mtime)` already refuses the
  second of two writers (`.claude/rules/surfaces.md:118-119`).
- **Install flow, Claude Code.** `/plugin marketplace add wlsdks/ontology-atlas`, then
  `/plugin install ontology-atlas@ontology-atlas` (plugin and marketplace share the name). The
  install pane lists the server, skills and hook. Updates are by `claude plugin update`; automatic
  update stays off.
- **Install flow, Codex.** `codex plugin marketplace add wlsdks/ontology-atlas`, then `/plugins`
  inside Codex.
- **The app** shows these two flows as text to copy. It does not install a plugin for the person.
- **The repository's own skills.** `.claude/skills/` and `.agents/skills/` are contributor
  workflows for building Atlas and never ship. The package's `skills/` is the one authored source of
  user workflows. `ontology-atlas init` copies from it for hosts with no plugin support, replacing
  `cli/templates/vault/.claude/skills/atlas-*`, and a derive-and-compare check holds the copies
  equal. Where a contributor skill follows the same procedure, it points at the shipped file, as
  `.claude/skills/ontology-sync/SKILL.md:8` already points at a shared workflow.
- **Listing is self-hosted first.** The marketplace file in this repository serves both hosts and
  needs no review. Submitting to Anthropic's directory and to the Codex directory (the build without
  the hook) is a separate, later step: only after the probe has passed and the plugin has been used
  locally, and only with the owner's yes.
- TODO for the plugin slice: the exact manifest fields and the Codex `interface` and `policy`
  entries.

## Probe

A sealed probe in the manner of the 2026-09-13 one, on `brief` alone.

- **Changes.** Ten merged changes in this repository, each read at its own commit with the vault as
  it stood then: seven real agent-written changes to product code, and three mechanical controls
  (renames or import rewrites that change no behaviour).
- **Keys.** One per change, written from the diff and the pull request text alone, before the
  brief exists, in terms of code and behaviour and never in vault slugs. The keys are hashed before
  any packet is built, and the hashes go into the result.
- **Arms.** A: `git diff --stat` and the change's own description. A': the same packet, read again,
  as the noise floor. B: A plus the text of `ontology-atlas brief <range>`, produced by a throwaway
  script kept outside the repository. C: the full diff, as the ceiling.
- **Readers.** Text only: a reader gets its packet and no repository access. Two fresh readers per
  arm per change, on a smaller model, not told the hypothesis. Each answers: what behaviour
  changed, what else is affected, what do you not know.
- **Scoring.** The scorer gets the answers with the arm labels stripped.
- **Pass line.** All three hold, summed over the ten changes:
  1. B's missed impacts are below A's by at least 30%, and by more than the gap between A and A'.
  2. B's wrong beliefs are not above A's.
  3. On the three controls, no B reader reports a behaviour change that the key does not hold.
- **Ceiling.** C is reported beside them: how much of what a full-diff reading finds B recovers.
  It is not part of the pass line.
- **The name.** The owner, watching the recording for acceptance criterion 1, is asked whether
  `ontology-atlas` is too long to type.
- **If it fails.** No public command is built. Steps 1, 4 and 5 still run, because app screens that
  show lines nobody can run are a defect either way and the mirrored commands still cost every
  change. What remains of `cli/` is `init`. Steps 2, 3 and 6 to 8 do not happen.
- The result is one decision record; the readers' answers are attached to the pull request.

## Out of scope

- Posting the pull request comment: it needs a token and sends data off the machine; the team's
  own workflow step does it.
- A node address in the `ontology-atlas://` scheme: that part of `docs/DECISIONS.md:599` stands.
- Blocking a merge by default: the timestamp rule over-reports after a mechanical change.
- Impact lists, backlinks and scores in any output: the lead reports that the 2026-09-13 probe
  found they changed no answer; a declared edge that is absent is not evidence that a change is safe.
- Approving or editing a document from the terminal: writes stay in the app and in MCP.
- The app installing a plugin or the npm package for the person.
- A Linux or Windows view: `open` answers "not installed" where there is no app.

## Acceptance criteria

1. **Given** a real agent change in this repository, **when** the lead runs the probe's brief
   script in a terminal and follows its last line into the app, **then** a recording of at most one
   minute shows the brief, the `open` step and the app on the named document, and the owner, after
   watching it, says whether it is useful. Checked by the recording attached to the pull request and
   the owner's answer quoted in it. A "not useful" returns this spec to Problem. This proves the
   output and the path into the app; the owner's answer is the only person-side evidence.
2. **Given** the ten changes and four arms, **when** the probe runs, **then** it meets all three
   parts of the pass line. Checked by the decision record that states the key hashes, missed impacts
   and wrong beliefs per arm, the gap between A and A', and the ceiling. This is the recovery proof.
3. **Given** a fixture repository whose change modifies one named file, moves another, edits one
   document and adds two unnamed files, **when** `ontology-atlas brief` runs, **then** the output is the
   block under Copy, the same run under `LANG=ko_KR.UTF-8` prints the three reused sentences exactly
   as `messages/ko/projectPages.json:166-167,183` holds them, and `--json` is byte-identical under both
   languages. The fixture also plants four names: a document file `capabilities/a$(touch X).md`, a
   title holding a newline followed by a forged `Next` line, a title holding an escape sequence, and
   the title `](https://example.invalid) @org/team`. Then: running the printed `Next` line through
   `sh` creates no file `X`; stdout holds one line that starts with `Next` and no escape byte; and
   in `--comment` each planted name appears only inside a code span. Checked by
   `cli/src/commands/brief.test.mjs`.
4. **Given** the same fixture, **when** each row of the exit code table is reproduced, **then** the
   code and the one-document JSON rule hold, and an empty change exits 0. Checked by
   `cli/src/commands/exit-codes.test.mjs`.
5. **Given** a generated repository the size of the largest measured change (3,468 changed files,
   650 of them renamed, 99 documents), **when** `ontology-atlas brief` runs on that range, **then** it
   answers in under 2 s of CPU time, lists moved-only files as moved, and prints no absolute path.
   Checked by `cli/src/commands/brief-large-range.test.mjs`. The fixture is generated because a CI
   checkout holds one commit.
6. **Given** the installed app and a terminal, **when** `ontology-atlas open <slug>` runs, **then**
   the app comes forward with that document selected and its panel names the file the terminal
   named. A new folder, another folder on screen, unsaved edits and a waiting approval each show the
   dialog first, and "Not now" changes nothing and loses no edit. Checked by an installed-app walk.
   Launch arguments outside the grammar, a scheme URL among them, and a grant without a press are
   refused: checked by `tests/contract/security/launch-argument-one-door.contract.test.ts`.
7. **Given** a clean macOS account with the installed app, a stock PATH and no checkout, **when**
   the person presses "Install the ontology-atlas command", **then** the row says a new terminal
   will not find the command yet and shows the line to add, and no other screen shows a command
   line. After they add the line, open a new terminal and press "Check again",
   `ontology-atlas --version` prints the app's version and the screens show command lines. "Remove
   the command" leaves no file behind. Checked by an installed-app walk on a clean account; Windows
   by CI.
8. **Given** the app's message catalogues and source after step 3, **when** the contract runs,
   **then** no screen holds a command line that fails on a machine with only the installed app, a
   bare `ontology-atlas` line appears only in screens that check the installed-and-found state, and
   no npm form appears anywhere. Checked by the rewritten
   `tests/contract/release/npm-channel-retired.contract.test.ts`.

## Risks

1. **The brief cries wolf.** One structure cleanup left 75 of 96 documents stale (measured today).
   Answer: measure the change, not history; say "moved" for a move; print line counts; put three
   mechanical controls in the probe; never fail `check` by default.
2. **There is nothing to check against.** The brief is as good as the documents; a repository with
   few documents sees only "In no document". Answer: that group is printed as a fact, and the probe
   result states, per change, whether any document names a changed file, so a pass that rests on
   two changes is visible. Outside this repository this is unknown.
3. **The command is not reached.** A stock macOS PATH holds no folder the app can write without a
   password, `ontology-atlas` is fourteen characters to type, and the engine requires Node 24.
   Answer: installed means found, and screens wait for it; one name that matches the package, the
   plugin and the brand; a person can alias it; the probe records whether the name is called too
   long; the Node floor is measured before step 7.

## Later

1. Agent plugins for Claude Code, then Codex: next once the package is packed (step 6).
2. npm, then the Homebrew tap: next once the probe has passed and the old commands are gone.
3. `ontology-atlas mcp` as the one configured server command: next when the plugin needs it.
4. The map panel states the change the terminal measured, not only dates: next if criterion 6
   shows the two disagree.
5. Submission to Anthropic's directory and the Codex directory (the build without the hook): next
   once the probe has passed and the plugin has been used locally; needs the owner's yes.
6. A hook line for Codex: next if Codex allows listed plugins to carry hooks.
7. `export` and a wiki index command: next on the first request from outside this repository.

## Owner question

None — the three questions raised with the first draft were decided on 2026-11-22. The command has
one name, `ontology-atlas`; to reverse it before step 7, change the name in the package and the app
row, and after step 7 the name is public. The plugin is listed from this repository first. The npm
name was checked and is free.

## Decision record

One record, listed in `decisions:`:
`docs/records/decisions/2026-11-22-old-cli-deleted-no-terminal-brief-87de58d1-d9c5-41d3-a583-01ae0e4ca893.md`.
It records the probe's outcome. The prior decisions this plan would have overturned all stand: npm
stays closed (2026-07-27, 2026-09-11), the app installs no command of its own (2026-08-20 (88)),
and the app answers one address with no launch-argument door (2026-09-07). 2026-08-30 (the CLI
runs the MCP modules) lapses with the commands it described.

## Revisions

- 2026-11-22: first draft.
- 2026-11-22: the owner's three answers, through the lead. One command name, `ontology-atlas`, with
  no `atlas` and no fallback; the plugin is listed from this repository first and directory
  submission is a later step that needs the owner's yes; the npm name was checked and is free.
- 2026-11-22: the owner accepted the plan after a plain-language walk-through of its value (what a
  person must re-check after an agent change, without reading the whole diff) and asked to build it
  in this order; both decision records are listed.
- 2026-11-22: the owner asked the lead to run and record criterion 1 instead of doing it
  themselves; the criterion now proves the output and the path into the app, and the owner's
  verdict on the recording is the person-side evidence. Probe readers run on a smaller model to
  keep usage down.
- 2026-11-22: an independent review, verdict "build, with changes". Names in output are data (one
  line, quoted, code spans in `--comment`); `open` gets a written grammar, a press before any grant
  and its own contract, and 2026-09-07 is narrowed, not left standing; installed means found on the
  login PATH; a document changed with its code is `updated`, never `current`; the probe has four
  arms, hashed keys and a noise floor; the importer inventory is regenerated by script (29 files,
  18 modules); no bare command line is public before step 7; the plugin gets its own record.
- 2026-11-22: the probe failed (B 100 missed against A 105 and A' 99; full diff 78). Steps 2, 3
  and 6 to 8 are cancelled and the two draft records are replaced by one record of the outcome. The
  owner agreed: what does not help is not built.
