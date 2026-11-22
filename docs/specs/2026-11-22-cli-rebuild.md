---
title: A rebuilt Atlas command for the terminal
doc_type: spec
status: draft
area: cli
date: 2026-11-22
decisions: []
---

# A rebuilt Atlas command for the terminal

The command stops mirroring the MCP tools and becomes the shortest way from a terminal or a pull
request into the app. It keeps four commands, `status`, `brief`, `check` and `open`, plus a narrowed
`init`. Everything else in `cli/` is deleted in an order that leaves nothing broken midway. The
same package later reaches people through the app, npm, agent plugins and Homebrew, in that order.
The first slice is a probe that can stop the build.

## Person and moment

1. **The owner (observed, 2026-11-22, in Korean; the lead's paraphrase).** He asked whether the
   command should be removed, because the most important part of Atlas is the view. He then decided:
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
- App screens show copyable commands in that form. They come from 9 source files that build them:
  `OntologyStarterCta.tsx:27-75`, `agent-setup-packets.ts:26-194`, `agent-readiness.ts:109-173`,
  `topology-analysis.ts:223-416`, `footprint-trail.ts:160`, `vault-health.ts:13`,
  `AgentSetupTroubleshooting.tsx:142,294`, `McpProofPacket.tsx:36,45`, `CliBridgeBody.tsx:7-8`.
  The app tells the person so: "This command runs inside an ontology-atlas source checkout"
  (`messages/en/firstRunStarter.json:39`); "There is no npm package" (`messages/en/atlasGit.json:98`).
- `cli/src/integration.test.mjs` is 10,336 lines and calls its launcher `run(` (`:59`) at 465 sites.
  `package.json:140-262` holds 13 `integration:cli*` scripts. Its 3.5 minute run time was reported
  by the lead and not re-measured here.
- Other code leans on the old command: the release gate (`.github/workflows/release-macos.yml:139`,
  `package.json:237`), ten `dogfood:*` scripts (`package.json:192,222-230,234`), the session hook
  (`.claude/hooks/inject-ontology-summary.sh:39-40`), the vault validator
  (`scripts/vault/validate-vault.mjs:16,25`), and the MCP server, which prints old commands as its
  "when MCP is unavailable" line (`mcp/src/ontology-engine.mjs:261-277`).
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
  the window forward and drops its arguments (`src-tauri/src/lib.rs:106-108`).
- The app bundles one program, the MCP server (`src-tauri/tauri.conf.json:45-47`).
- The cognitive-diff probe of 2026-09-13 "found the one fact that cut missed impacts by 75% —
  meaning unchanged, the code under it moved"
  (`docs/records/decisions/2026-09-19-analysis-brief-across-three-cores-683f0641-e51e-4df0-a8cf-eccb425e5ce8.md`).
  The lead's figures (16 missed impacts down to 4; backlinks and impact lists did not pay) are in no
  committed record found here.
- Unknown: whether the names `ontology-atlas` and `atlas` are free on npm (not looked up; a lookup
  sends the project name to an outside service); whether the engine runs on Node 20 or 22; whether
  the map's side panel shows the "changed after this document was written" line.

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

- `atlas status` is not the headline. A whole-vault count on this repository reads "75 of 96
  changed", mostly from one structure cleanup. If that cleanup changed no meaning, which nobody has
  checked, it is the case the falsifier in
  `docs/records/decisions/2026-09-19-drift-line-names-its-evidence-3030afde-cf44-4d45-887e-92ec3dfb3903.md`
  describes. `status` keeps one line for the count as a backlog; `brief` is the first command.
- `brief` measures the change, not the whole history: which documents name a file this change
  touched and were not updated in it. A file that only moved is said to have moved. Each file shows
  its changed line counts, so a two-line import rewrite reads as one.
- `check` reports and exits 0 unless the caller names states with `--fail-on`. A default that turns
  a pull request red on a timestamp trains people to bypass it.
- `atlas open` is a command, not a link. A node address in the `ontology-atlas://` scheme is what
  `docs/DECISIONS.md:599` kept out ("no uid or node addresses"). The command starts the app with
  arguments instead; a web page cannot do that, and the one-door rule stands.
- Output ends with one `atlas open` line, for the first document to check, not one per row.
- Sources are stated per group, in plain words, not as a tag on every line.
- The four states are the engine's own four, not three: a path that is gone needs a different act
  (fix the path) than a file that changed (re-read the meaning).

## Flow

1. When the person runs `atlas brief` in a repository after an agent's change, Atlas reads the
   uncommitted changes and prints which documents to check, each with the file and its line counts.
   With no uncommitted changes it reads the newest commit and says so on the first line.
2. When they run `atlas brief main..HEAD`, Atlas reads that range instead, and says how many
   uncommitted files are not part of it.
3. When the agent rewrote a document in the same change, Atlas lists it under "Updated with the
   code" and says it did not check the new text. This is where the agent can be wrong, and Atlas
   does not vouch for it.
4. When a document names only a folder, or Git cannot date a file, Atlas lists it under "Unknown"
   with the reason. It is never counted as fine.
5. When they run `atlas open capabilities/checkout-total`, the app comes forward on that folder with
   the document selected on the map and its panel open. The command prints one line and returns.
6. When the folder is one the app has not opened before, the app asks before opening it, because
   the command may have been run by an agent.
7. When a pull request is opened, CI runs `atlas check origin/main..HEAD --comment`, and a workflow
   step the team wrote posts the printed Markdown. Atlas itself posts nothing.
8. When the person presses "Install the atlas command" in the app's Settings, the app shows the one
   file it will write and its contents, writes it, and says whether a terminal will find it.

## States

| State | Terminal | Web | macOS app |
|---|---|---|---|
| No Atlas folder | `cli.error.noFolder`, exit 2; next: open the folder in the app or `atlas init` | Out of scope — the hosted web cannot be started on a local folder from a terminal | First run, unchanged |
| Not a Git repository | `brief`, `check`: `cli.error.noGit`, exit 2. `status`: counts documents, Git line reads unknown, exit 0 | Out of scope — same reason | `toCheckEvidenceUnreadable`, unchanged |
| Nothing to check | `cli.brief.nothing`, exit 0 | Out of scope — same reason | `toCheckEmpty`, unchanged |
| Documents to check | The groups below; last line `cli.next.open` | Out of scope — same reason | After `atlas open`: map focused on the document, panel names the same file |
| Unknown | `cli.brief.unknownHeading` with the reason per document | Out of scope — same reason | Unchanged |
| Largest measured change (3,468 files, 99 documents) | First 20 rows per group, then `cli.more` with the count and `--all` | Out of scope — same reason | "To check" keeps its own row limit (`toCheckDialogMore`) |
| `open`: app not installed | `cli.error.noApp`, exit 2; names the document's file path and the download page | Out of scope — a web page cannot be told a local path | Not reached |
| `open`: folder the app has not opened | Prints `cli.open.asked`, exit 0 | Out of scope — same reason | Dialog `appCommand.openTitle`; "Open folder" or "Not now" |
| `open`: no such document | `cli.error.noDocument` with the closest slug, exit 2 | Out of scope — same reason | Not reached |
| Command not installed | Shell reports command not found | Out of scope — a browser cannot write to PATH | Settings row `appCommand.body`, button `appCommand.install` |
| Command installed | `atlas --version` prints version and where it runs from | Out of scope — same reason | `appCommand.installed`, button `appCommand.remove` |
| Another `atlas` on PATH | Not reached | Out of scope — same reason | `appCommand.otherProgram`; installs as `ontology-atlas` only |
| Install could not write | Not reached | Out of scope — same reason | `appCommand.failed`; nothing changed; choose another folder |

## Copy

Human output follows the terminal's language (`--lang`, then `ATLAS_LANG`, then `LC_ALL`,
`LC_MESSAGES`, `LANG`), in the app's four languages, English otherwise. `--json` is never
translated. Colour is used only on a terminal and never when `NO_COLOR` is set. Paths are relative
to the repository and use `/` on every platform. The printed command name is the name the person
typed (`atlas` or `ontology-atlas`).

This spec holds English only: `pnpm docs:language` counts any Hangul line under `docs/specs/` as a
violation (`scripts/quality/markdown-language/check.mjs:17-22`). Three sentences are reused word for
word from the app, so their Korean, Japanese and Chinese already exist under the same keys in
`messages/<locale>/projectPages.json`. The other strings are authored in all four languages in the
slice that adds each command; the Korean drafts went to the lead with this spec.

```text
$ atlas brief
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

Next   atlas open capabilities/checkout-total
```

```text
$ atlas status
Folder          atlas/ · 99 documents · 96 name a source file
Now             Uncommitted changes touch files named by 2 documents that were not updated. Run: atlas brief
Since written   21 unchanged · 75 name a file that changed after · 0 name a path that is gone · 0 unknown
```

```text
$ atlas check origin/main..HEAD --fail-on stale,missing
Change   origin/main..HEAD · 3 commits · 14 files
To check · 2 documents were not updated, and a file they name changed
  capabilities/checkout-total   src/cart/total.ts (+18 -4)
  capabilities/coupon-rules     src/cart/coupon.ts moved to src/pricing/coupon.ts
Unknown · 1 document     In no document · 6 of 14 changed files
Result   failed: 2 documents are in a state named by --fail-on stale,missing
```

```text
$ atlas open capabilities/checkout-total
Opened Checkout total in Ontology Atlas.
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
| `cli.next.open` | last line of `brief` | `Next   {command} open {slug}` |
| `cli.check.reported` | `check`, no `--fail-on` | `Result   reported, not failed (no --fail-on given)` |
| `cli.check.passed` / `.failed` | `check --fail-on` | `Result   passed: no document is in a state named by --fail-on {states}` / `Result   failed: {count} documents are in a state named by --fail-on {states}` |
| `cli.open.done` / `.asked` | `open` | `Opened {title} in Ontology Atlas.` / `Ontology Atlas is asking whether to open {folder}. Answer in the app.` |
| `cli.error.noFolder` | stderr, exit 2 | `{command}: no Atlas folder in {path} or above it. Open this folder in the Ontology Atlas app, or run: {command} init` |
| `cli.error.noGit` | stderr, exit 2 | `{command}: {path} is not in a Git repository, so Atlas cannot tell which files changed. {command} status still counts the documents.` |
| `cli.error.noCommit` | stderr, exit 2 | `{command}: Git has no commit named {name} here. On a CI runner, fetch the full history first (actions/checkout with fetch-depth: 0).` |
| `cli.error.noDocument` | stderr, exit 2 | `{command}: {typed} is not a document in {folder}. Closest: {slug}` |
| `cli.error.noApp` | stderr, exit 2 | `{command}: Ontology Atlas is not installed on this computer, so there is nothing to open. The document is {file}. The app: https://ontologyatlas.com/download` |
| `cli.error.unknownCommand` | stderr, exit 2 | `{command}: unknown command "{typed}". Did you mean {closest}? Run {command} --help for the list.` |
| `appCommand.title` / `.body` | app Settings | `atlas command` / `Run Atlas from a terminal in any project. Installing writes one file, {path}, which starts the copy of the command inside this app.` |
| `appCommand.install` / `.remove` | buttons | `Install the atlas command` / `Remove the command` |
| `appCommand.installed` | after install | `The atlas command is at {path}. It runs version {version} from this app.` |
| `appCommand.notOnPath` | after install | `{dir} is not on your PATH, so a terminal will not find atlas yet. Add this line to your shell profile: {line}` |
| `appCommand.otherProgram` | before install | `Another program named atlas is already at {path}. Atlas did not replace it and installed its command as ontology-atlas at {newPath}.` |
| `appCommand.removed` / `.failed` | after remove / on error | `Removed {path}. Nothing else was changed.` / `Could not write {path}: {reason}. Nothing was changed. Choose another folder.` |
| `appCommand.openTitle` / `.openBody` | dialog | `Open {folder} in Atlas?` / `A terminal command asked to open this folder. Atlas has not opened it before.` |
| `appCommand.openConfirm` / `.openDismiss` | dialog buttons | `Open folder` / `Not now` |

`check --comment` prints Markdown with the same sentences: a heading `Atlas: {count} documents to
check`, one bullet per document, the unknown and in-no-document counts, and a last line naming
`atlas open {slug}` in backticks. It carries no absolute path.

## Exit codes

One table for every command, in line with `docs/DECISIONS.md:977`: an exit code says whether the
input could be answered, not whether the answer is empty.

| Code | Meaning | Examples |
|---|---|---|
| 0 | Answered | Nothing to check; documents to check with no `--fail-on`; `status` outside Git |
| 1 | Answered, and a state the caller named with `--fail-on` was found | `check --fail-on stale` with one stale document. Only `check` returns 1 |
| 2 | Could not answer | No Atlas folder, no Git for `brief` or `check`, unknown commit, unknown document, unknown command or flag, app not installed for `open` |

`--fail-on` takes `stale`, `missing`, `unknown`, comma-separated. Any other value is exit 2 with the
closest value named.

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
      "open": "atlas open capabilities/checkout-total" },
    { "slug": "capabilities/coupon-rules", "state": "missing", "source": "atlas", "documentChanged": false,
      "files": [{ "path": "src/cart/coupon.ts", "change": "renamed", "to": "src/pricing/coupon.ts", "added": 0, "removed": 0 }] },
    { "slug": "capabilities/order-history", "state": "current", "source": "author", "documentChanged": true },
    { "slug": "domains/cart", "state": "unknown", "source": "unknown", "reason": "folder-only" }
  ],
  "filesInNoDocument": { "total": 6, "listed": ["src/cart/tax.ts", "src/cart/tax.test.ts"], "truncated": true },
  "result": { "failOn": ["stale", "missing"], "failed": true }
}
```

- `state` is one of `current`, `stale`, `missing`, `unknown`, the values of
  `mcp/src/drift/evidence-verdict.mjs:24`. `source` is `atlas`, `author` or `unknown`.
- `result` appears only on `check`. `status` uses `atlas.status/v1` with `sinceWritten` counts in the
  shape of `evidenceDrift.counts`. `open` uses `atlas.open/v1` with `opened`, `asked` or neither.
- An error is `{ "schema": "atlas.error/v1", "ok": false, "error": { "code": "no_folder", "message": "…", "next": "…" } }`,
  with codes `no_folder`, `no_git`, `no_commit`, `no_document`, `no_app`, `usage`.
- No absolute path and no file content appear in any JSON or `--comment` output.

## Edge cases

- **Zero, one, largest.** Zero changed files: `cli.brief.nothing`. One document: singular wording
  through the catalogue's plural rule. Largest measured: 3,468 files over 99 documents; 20 rows per
  group, then `cli.more`.
- **First run, no Atlas folder.** Exit 2 with the two next steps. `atlas init` creates the same
  folder the app's first run creates, and no agent configuration.
- **No Git.** `brief` and `check` exit 2; `status` answers with the Git line unknown.
- **Uncommitted changes.** `brief` with no range reads staged, unstaged and new unignored files.
  With a range it reads only the range and counts what it left out.
- **Shallow clone on a CI runner.** The base commit is absent: `cli.error.noCommit`, exit 2, never
  an empty answer.
- **Windows paths.** A document path written with `\` is read as `/`. Output always uses `/`. A
  path that differs from Git's only by letter case is reported as gone, with the closest path named.
  Windows runs are confirmed by CI only.
- **Hangul.** Slugs, titles and file paths print as written; a typed slug is normalized to NFC
  before matching; Git's octal path quoting is never shown.
- **Folder moved, renamed or unreadable.** The folder is found by its contents from the working
  directory upward, so a rename needs no setting. An unreadable document is one `unknown` row.
- **Two edits at once.** The four commands write nothing, so a concurrent edit cannot be lost.
- **Offline.** No command uses the network. `check --comment` prints; it does not post.
- **A folder inside a larger repository.** When document paths are relative to a sub-folder that Git
  does not mark, `--repo <path>` names it. The app's own binding lives in the ignored
  `.ontology-atlas/project-sources.json` (`cli/README.md`, `connect-source` row), so a CI runner
  cannot read it.
- **The app moved or deleted after the command was installed.** The installed file prints
  `cli.error.noApp` with its expected location instead of a shell error.
- **Several copies on one machine.** `atlas --version` prints the version and the path it runs
  from. The command, the plugin and the app share the app's version number.

## What is deleted, and in what order

**Commands.** All 61 runners in `cli/src/lib/cli-commands.mjs:9-71` and their modules under
`cli/src/commands/` and `cli/src/lib/`. Each has an MCP tool or an app screen that does the same
work. `init` stays, narrowed to creating the folder from `cli/templates/`. `export` (JSON-LD and
GraphML) and `wiki-index --write` have no MCP twin; they go, and return on the first request.

**Tests.** `cli/src/integration.test.mjs`, the test files beside deleted modules, the 13
`integration:cli*` scripts, and their rows in `scripts/lib/check-rules/cli.mjs:36-113`. One test
file per kept command replaces them.

**Screens.** The copyable command lines built by the 9 files listed under Today. Lines whose work
the app already does (connect, verify, validate) are removed. Lines inside text handed to an agent
are rewritten to name the MCP tool. `CliBridgeBody` is rewritten around `atlas init` at step 3.

**Internal scripts.** The ten `dogfood:*` scripts and the release gate call the engine under
`mcp/src/` and `mcp/scripts/verify.mjs` directly, and so does the session hook. They are internal
checks and need no public command.

| Step | What happens | What still works after it |
|---|---|---|
| 0 | Probe (below). Nothing in the product changes | Everything |
| 1 | App screens stop showing lines that cannot run: lines whose work the app does are removed, lines handed to an agent name the MCP tool. Does not wait for the probe | Old commands, all callers |
| 2 | `status`, `brief`, `check`, `open` are added beside the old commands; the app accepts `open` | Old commands, all callers |
| 3 | The app bundles the command and gains the install row. A screen shows an `atlas` line only when the command is installed, and the install row otherwise | Old commands, internal callers |
| 4 | Internal callers move off the old commands; MCP answers stop printing old commands | Old commands exist, unused |
| 5 | Old commands and their tests are deleted; `npm-channel-retired` is rewritten to hold "only the published form" | The five commands |
| 6 | The plugin is built from the packed package and tried from a local folder | Unchanged |
| 7 | The package is published to npm, after `npm pack --dry-run` and the owner's yes at that moment | Unchanged |
| 8 | The plugin is listed; then the Homebrew tap | Unchanged |

Steps 2, 4, 5 and 7 each change a public contract (the command set, what MCP answers, what is
published) and need the decision record named below to be accepted first.

## Distribution

- **App.** The app carries the command beside its MCP server and adds one Settings row. Pressing
  the button shows the file and its contents, then writes one file in a folder the person owns
  (`~/.local/bin/atlas` on macOS; a per-user folder already on PATH on Windows). No administrator
  password, no edit to a shell profile, no download. "Remove the command" deletes that file. The
  file names this app's own location, so it cannot start another copy. The app never replaces a
  file it did not write.
- **npm, last.** One package, `ontology-atlas`, with the commands `atlas` and `ontology-atlas`. It
  holds the command, the MCP server (`atlas mcp`) and the plugin files. `ontology-atlas-mcp` is not
  published as a second package. Publishing needs `npm pack --dry-run` and the owner's explicit yes
  at that moment (`.claude/rules/forbidden.md:84`).
- **Homebrew.** An own tap (`wlsdks/tap`), a formula that installs the published package at a
  pinned checksum and declares the formulae it conflicts with. homebrew-core is not attempted.

## Agent plugins

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
| Hook | Claude Code only: when the agent stops, one line if uncommitted changes touch files named by documents that were not updated: `Atlas: 2 documents name files this session changed and were not updated. /ontology-atlas:brief`. Silent at zero | Yes, so it is read-only, has no network, writes nothing, blocks nothing, and gives up silently after 2 s |
| Command | `bin/atlas`, the same program | No |

- **Codex ships without the hook.** Codex skips plugin hooks until the person trusts them, and a
  plugin with lifecycle hooks cannot be listed in its public directory. The same line is the last
  step of the `sync` skill there.
- **Never automatic, on any host:** creating an Atlas folder, any write, installing the app,
  posting a comment, any network request.
- **The extension rule changes first.** `.claude/rules/forbidden.md:71-75` names MCP tools and
  skills as the extension mechanism. A hook that Atlas ships is a third kind of thing that runs in
  the host. The slice that ships it amends that rule to name hooks with the limits above.
- **One Atlas server per session.** When the project already has an Atlas server written by the
  app's Connect Agent, the plugin's server lists no tools and `connection_info` says which
  configuration to remove. Two servers would be two writers on the same documents.
- **Install flow, Claude Code.** `/plugin marketplace add wlsdks/ontology-atlas`, then
  `/plugin install ontology-atlas@ontology-atlas` (plugin and marketplace share the name). The
  install pane lists the server, skills and hook. Updates are by `claude plugin update`; automatic
  update stays off.
- **Install flow, Codex.** `codex plugin marketplace add wlsdks/ontology-atlas`, then `/plugins`
  inside Codex.
- **The app** shows these two flows as text to copy. It does not install a plugin for the person.
- **The repository's own skills.** `.claude/skills/` and `.agents/skills/` are contributor
  workflows for building Atlas and never ship. The package's `skills/` is the one authored source of
  user workflows. `atlas init` copies from it for hosts with no plugin support, replacing
  `cli/templates/vault/.claude/skills/atlas-*`, and a derive-and-compare check holds the copies
  equal. Where a contributor skill follows the same procedure, it points at the shipped file, as
  `.claude/skills/ontology-sync/SKILL.md:8` already points at a shared workflow.
- TODO for the plugin slice: the exact manifest fields, the Codex `interface` and `policy` entries,
  and whether a public directory listing is sought (Anthropic's needs a paid plan and a review).

## Probe

A sealed probe in the manner of the 2026-09-13 one, on `brief` alone.

- **Changes.** Ten real, merged, agent-written changes to product code in this repository, each
  read at its own commit with the vault as it stood then. At least five touch files that documents
  name. One is a mechanical change (renames or import rewrites only).
- **Arms.** A: `git diff --stat` and the change's own description. B: A plus the text of
  `atlas brief <range>`, produced by a throwaway script kept outside the repository. No MCP, no app.
- **Readers.** Three fresh agent readers per arm per change, not told the hypothesis. Each answers:
  what behaviour changed, what else is affected, what do you not know.
- **Key.** Written from the full diff before any reader runs.
- **Pass line.** Summed over the ten changes: missed impacts in B are at least 30% below A; wrong
  beliefs in B are not above A; B misses more than A in at most two changes; on the mechanical
  change no B reader reports a behaviour change that the key does not hold.
- **If it fails.** No public command is built. Steps 1, 4 and 5 still run, because app screens that
  show lines nobody can run are a defect either way and the mirrored commands still cost every
  change. What remains of `cli/` is `init`. Steps 2, 3 and 6 to 8 do not happen.
- The result is one decision record; the readers' answers are attached to the pull request.

## Out of scope

- Posting the pull request comment: it needs a token and sends data off the machine; the team's
  own workflow step does it.
- A node address in the `ontology-atlas://` scheme: `docs/DECISIONS.md:599` stands.
- Blocking a merge by default: the timestamp rule over-reports after a mechanical change.
- Impact lists, backlinks and scores in any output: the lead reports that the 2026-09-13 probe
  found they changed no answer; a declared edge that is absent is not evidence that a change is safe.
- Approving or editing a document from the terminal: writes stay in the app and in MCP.
- The app installing a plugin or the npm package for the person.
- A Linux or Windows view: `open` answers "not installed" where there is no app.

## Acceptance criteria

1. **Given** the owner after a real agent change in his own repository, **when** he runs the
   probe's brief script in his terminal, **then** a screen recording shows what he does next, and it is
   opening a listed document or naming a decision. Checked by the recording attached to the pull
   request. If he does neither, this spec returns to Problem.
2. **Given** the ten changes and two arms, **when** the probe runs, **then** it meets the pass line.
   Checked by the decision record that states the four numbers. This is the recovery proof.
3. **Given** a fixture repository whose change modifies one named file, moves another, edits one
   document and adds two unnamed files, **when** `atlas brief` runs, **then** the output is the
   block under Copy, the same run under `LANG=ko_KR.UTF-8` prints the three reused sentences exactly
   as `messages/ko/projectPages.json:166-167,183` holds them, and `--json` is byte-identical under both
   languages. Checked by `cli/src/commands/brief.test.mjs`.
4. **Given** the same fixture, **when** each row of the exit code table is reproduced, **then** the
   code and the one-document JSON rule hold, and an empty change exits 0. Checked by
   `cli/src/commands/exit-codes.test.mjs`.
5. **Given** a generated repository the size of the largest measured change (3,468 changed files,
   650 of them renamed, 99 documents), **when** `atlas brief` runs on that range, **then** it
   answers in under 2 s of CPU time, lists moved-only files as moved, and prints no absolute path.
   Checked by `cli/src/commands/brief-large-range.test.mjs`. The fixture is generated because a CI
   checkout holds one commit.
6. **Given** the installed app and a terminal, **when** `atlas open <slug>` runs, **then** the app
   comes forward with that document selected and its panel names the file the terminal named; a
   folder the app has not opened shows the dialog first. Checked by an installed-app walk.
7. **Given** a Mac with the installed app and no checkout, **when** the person presses "Install the
   atlas command" and opens a new terminal, **then** `atlas --version` prints the app's version, and
   "Remove the command" leaves no file behind. Checked by an installed-app walk; Windows by CI.
8. **Given** the app's message catalogues and source after step 3, **when** the contract runs,
   **then** no screen holds a command line that fails on a machine with only the installed app.
   Checked by the rewritten `tests/contract/release/npm-channel-retired.contract.test.ts`.

## Risks

1. **The brief cries wolf.** One structure cleanup left 75 of 96 documents stale (measured today).
   Answer: measure the change, not history; say "moved" for a move; print line counts; put a
   mechanical change in the probe; never fail `check` by default.
2. **There is nothing to check against.** The brief is as good as the documents; a repository with
   few documents sees only "In no document". Answer: that group is printed as a fact, and the probe
   requires five changes that touch named files. Outside this repository this is unknown.
3. **The command cannot be reached or runs the wrong program.** Other developer tools are also
   installed as `atlas`, and the engine requires Node 24. Answer: both names ship; the app refuses
   to shadow; output echoes the typed name; `--version` prints the origin; the Node floor is
   measured before step 7.

## Later

1. Agent plugins for Claude Code, then Codex: next once the package is packed (step 6).
2. npm, then the Homebrew tap: next once the probe has passed and the old commands are gone.
3. `atlas mcp` as the one configured server command: next when the plugin needs it.
4. The map panel states the change the terminal measured, not only dates: next if criterion 6
   shows the two disagree.
5. A hook line for Codex: next if Codex allows listed plugins to carry hooks.
6. `export` and a wiki index command: next on the first request from outside this repository.

## Owner question

Should the command be named `atlas`, given that other developer tools also install an `atlas`
command? Decided here: yes, with `ontology-atlas` shipped beside it, so `atlas` stays the name that
is short to type. To reverse it before step 7, change the names in the package and the app row;
after step 7 the name is public.

## Decision record

Drafted as
`docs/records/decisions/2026-11-22-atlas-command-rebuilt-and-published-e64b4ebe-ea86-48bc-a629-6cc1b8a3dd30.md`.
The lead lists it in `decisions:` once the owner accepts the wording. A record is capped at 2,000
bytes, so the reasons it compresses are given here in full.

| Prior decision | What happens to it | Reason |
|---|---|---|
| 2026-07-27 "The app embeds MCP … and the npm publish plan is dropped" (`docs/DECISIONS.md:4622`) | Its npm clause is overturned. The embedded server and Connect Agent stand | It dropped npm because an installed app could not connect an agent and the only guidance was a failing `npx` line. Connect Agent fixed that. What is published now is a terminal command for a person in review and for CI, which the app bundle cannot reach |
| 2026-09-11 "… a release bundle; the image is prepared, not published" (`docs/DECISIONS.md:248`) | Its clause that the npm door stays shut until registry inflow is observed is overturned. The `.mcpb` bundle stands as one more door | Its own dissent, "npm is still the one-line install for a CLI agent", was conceded and deferred. The owner has now decided it |
| 2026-08-20 (88) "The app installs the agent CLI for you" (`docs/DECISIONS.md:2210`) | Condition three (an app-only location) is overturned for Atlas's own command only. It stands for another vendor's CLI | A command that a terminal cannot find is not installed. The other three conditions hold: a press, the exact file shown first, a version that is the app's own |
| 2026-08-30 "The CLI executes the MCP modules instead of copying them" (`docs/DECISIONS.md:1472`) | Stands, extended to one package | No second copy of the logic |
| 2026-09-04 "A CLI exit code says whether the input could be answered" (`docs/DECISIONS.md:977`) | Stands | The exit code table follows it |
| 2026-09-07 "The installed app answers one address" (`docs/DECISIONS.md:599`) | Stands | `atlas open` passes arguments and mints no URL |
| `tests/contract/release/npm-channel-retired.contract.test.ts` | Rewritten at step 5 | From "no npm form anywhere" to "only the published form" |

## Revisions

- 2026-11-22: first draft.
