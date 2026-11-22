---
title: "Agent settings in Harness: every scope shown, explained, and hooks edited in place"
doc_type: spec
status: draft
area: harness
date: 2026-11-22
decisions: []
---

# Agent settings in Harness: every scope shown, explained, and hooks edited in place

Harness Setup reads one repository. Claude Code and Codex also read settings from the person's
home folder, from a per-project file Git ignores and from an organisation's policy, and the hooks
in those files apply in this repository too. This spec shows every one of those places in Setup,
explains each in one centred popup, keeps versions of each file's hooks so a changed or deleted
hook can be found and put back, and lets a person add, remove, edit, move and switch hooks through
the shared agent config writer, in six slices with their own acceptance criteria.

## Person and moment

1. **The owner, who runs Claude Code and Codex on about ten worktrees (observed).** His words,
   2026-11-22: "Inside a project there are `.agents` and `.claude`, and there are global settings
   too. I want all of that to be easy to choose and set inside Atlas. Most people don't even know
   these exist and miss them. Explain what each one is in a popup, and make the differences
   understandable." Earlier that day: "I want hook management to be easy, directly inside Atlas."
   He opens Harness, sees one repository's hooks, and leaves for an editor and two vendors'
   documentation to learn where else a hook can live or to change one. Later that day: "Let hooks
   be managed with versions, with something like a save, so I can pick any version and switch to
   it any time. It was stressful when I made a hook, forgot about it, deleted it, and couldn't get
   it back."
2. **Someone learning coding agents (not observed).** The owner's claim that most people miss these
   files is his, not a capture. Acceptance criterion 4 captures three cold readers before slice 3
   is called done.
3. **Someone who wants an ontology without agents.** No moment here: with no agent tool there is
   nothing to set. They are served only by the popup's explanation, which also opens on the web.

## Today

- **Harness reads the connected repository only, and writes nothing.** The files are the table in
  `.claude/rules/surfaces.md:77-90`; "A new path, or any value, needs a new decision record"
  (`:90`). The reading goes through read-only commands (`docs/features/harness.md:114`).
- **Two hook files are read:** `.claude/settings.json` and `.codex/hooks.json`
  (`src/entities/agent-files/model/repo-scan.ts:62-65`). A settings file is reduced to hook
  `command` strings and permission-rule counts (`src-tauri/src/harness_source/projection.rs:34-47`,
  `:63-86`); the matcher, type, timeout and `async` of a hook are dropped.
- **The Local file is refused by name:** `settings.local.json` and `auth.json` are in
  `DENIED_NAMES` (`src-tauri/src/harness_source/scope.rs:71-72`).
- **Measured on this Mac, 2026-11-22, event names and counts only:** the two project files hold 22
  hook entries (Claude Code 7, Codex 15). The two User files hold 25 more that Harness does not
  read: `~/.claude/settings.json` has 16 entries on 16 events and `~/.codex/hooks.json` has 9. The
  main checkout has a `.claude/settings.local.json` with no `hooks` key (its keys are
  `permissions`, `enabledMcpjsonServers`, `skillOverrides`); `.gitignore:10` ignores it. No
  managed settings file exists. Harness shows 22 of the 47 hook entries those four files hold.
- **This Mac also has four other Claude Code settings folders,** set through `CLAUDE_CONFIG_DIR`
  by the terminal app that starts the owner's sessions; three hold a `settings.json` with 16 hook
  entries each. A session started there reads that file as User and not `~/.claude/settings.json`.
  Atlas cannot see which folder a session uses.
- **Codex's review state is in a file (observed, undocumented).** `~/.codex/config.toml` on this
  Mac has 47 `[hooks.state."<hooks.json path>:<event>:<group>:<handler>"]` tables with the keys
  `trusted_hash` (47) and `enabled` (9). No Codex page read for this spec names them; Harness
  says today that the approval "lives in no file" (`messages/en/harness.json:28`).
- **A wired hook is never drawn as running:** `hookWired` means the script exists
  (`src/entities/agent-files/model/hook-wiring.ts:1-4`, `docs/features/harness.md:85`).
- **Atlas already reads two home-folder files for server names only** (`~/.claude.json`,
  `~/.codex/config.toml`; `src-tauri/src/connectors.rs:71`, `:104`; `surfaces.md:57-70`) and
  replaces a config file atomically, refusing links (`src-tauri/src/agent_setup.rs:285`).
- **The web cannot read a dot folder** (`messages/en/harness.json:29-30`) and writing agent config
  from the web is rejected (`surfaces.md:128-130`). On Windows the Harness reading fails and says
  so (`docs/features/harness.md:128`).
- **The agent config writer is specified, not built.** The revision of
  `docs/specs/2026-11-21-work-status-destination.md` in the `docs/work-status-rooms` worktree
  (uncommitted, as of 13:46 on 2026-11-22) gives it seven rules under "Agent state from the
  agent's own hooks" (since its revision of the same day: "The hook entries" under "Waiting for
  you: the agent's own state"), builds it in that spec's slice 9, "Hook entries", and records it
  as Record 3, whose text is in `docs/specs/2026-11-22-work-status-criteria.md`. Its rule 4
  saves a version of the affected hook set before every write and keeps no separate backup. That
  file still leaves the history's folders to this spec; the lead decided on 2026-11-22 that the
  version store (app data, the `hooks` key only, retention, mode 0600) is defined there with the
  writer and built in its slice 9, a text this draft has not read. The copy of that spec on this
  branch still says Atlas never "edits an agent's configuration" (`:818-819`).
- **Nothing keeps an earlier hook outside Git.** In this repository 23 commits changed
  `.claude/settings.json` and 12 changed `.codex/hooks.json` (`git log`, 2026-11-22); the User and
  Local files are in no repository. `git worktree remove` deletes ignored files
  (`docs/specs/2026-11-21-work-status-destination.md:147`). IndexedDB and the app's derived index
  may hold no user state (`.claude/rules/local-first.md:36-39`).
- **Vendor facts in Scope model were read 2026-11-22** on code.claude.com/docs/en (settings, hooks,
  permissions, skills, sub-agents, memory, mcp, managed-settings) and learn.chatgpt.com/docs.

## Problem and alternatives

**Ranked by the value each gives back against its cost.** (1) Hooks from every scope, shown with
where each lives: the highest value, because a hook runs code and can stop an action, and 25 of 47
here are invisible; one new read boundary. (2) The explanation popup: what the owner asked for in
words, no read at all. (3) Hook history: his third request, the one he called stressful;
recording needs no writer and holds only what it has seen, so it starts as early as it can. (4)
Hook edits and restore: need the writer. (5) Skills, subagents and instruction files: the popup
explains where each lives and which one wins, where the two orders surprise people; naming the
ones in the home folder needs a folder listing there, so that part is Later. (6) Permission
rules: rule text can hold a pasted token, so anything beyond counts needs its own record. (7) MCP
servers: Agents already lists them. Slices
follow this order; hooks come first because all three requests name them.

**Cause or symptom.** Each tool spreads one behaviour over three or four files with different
reach and combining rules, and no screen lays them side by side. Editing is the symptom the owner
named; seeing and understanding come first, so slices 1 and 2 change no settings file.

| Option | Gives back | Costs | Verdict |
|---|---|---|---|
| Status quo: Setup lists one repository; an editor and the vendors' pages for the rest | everything, to someone who already knows the files exist | the person the owner describes never finds them | loses |
| A third Harness view holding a kind-by-scope table | one overview | a second place for the same hooks; two earlier Harness tables were overturned (`6a495b79`, `b9dba267`, by `c52ae218`) | loses |
| A Settings destination of its own | room | an eleventh rail door for what Setup already lists | loses |
| **Scope as a grouping inside Setup's item pane, plus one popup** | every hook where the person already looks, the explanation one press away | pane 2 gains group headings | **chosen** |

**Switching one hook off.** Claude Code's documentation says "There is no way to disable an
individual hook while keeping it in the configuration". Remove with Undo is not durable, and an
invented key inside the settings file draws Claude Code's schema warning. Slice 6 moves the entry
verbatim to a parked file no tool reads, one beside each settings file and in the same Git
state, and moves it back; a parked entry can also be restored by hand with a paste.

## Scope model

Names on screen are the vendors' own: **User**, **Project**, **Local**, **Managed** (Claude Code)
and **User**, **Project**, **System** (Codex). `~` is `%USERPROFILE%` on Windows.

| Kind | Tool | Where it can live | How several combine (vendor pages) | This spec |
|---|---|---|---|---|
| Hooks | Claude Code | User `~/.claude/settings.json`; Project `.claude/settings.json`; Local `.claude/settings.local.json`; Managed | every file's hooks run; the same handler in two settings files runs once; no file removes or switches off another's hook; `disableAllHooks` is one value, taken from the highest of Managed, Local, Project, User, and cannot switch off managed hooks | read 1, history 2, edit 3 to 6 |
| Hooks | Codex | User `~/.codex/hooks.json`; Project `.codex/hooks.json`, trusted projects only; System `/etc/codex/hooks.json` or `%ProgramData%\OpenAI\Codex\hooks.json`; inline `[hooks]` in each layer's `config.toml`; no Local | every file's hooks run; the same command in two files can run twice; a new or changed hook is skipped until reviewed in `/hooks` | read 1, history 2, edit `hooks.json` 3 to 5 |
| Permission rules | Claude Code | the same four settings files | the lists join; deny, ask, allow are checked in that order and the first match decides; a managed rule cannot be overridden | counts per scope in 1; text Later |
| Approval and sandbox | Codex | `config.toml`: User, Project (closest wins, trusted only), System | one value: flags, then Project, profile, User, System | Later |
| Skills | Claude Code | User `~/.claude/skills/`; Project `.claude/skills/`; Managed | same name: Managed over User, User over Project, so a User skill replaces a Project one | explained in 1; home-folder names Later |
| Skills | Codex | User `~/.agents/skills`; Project `.agents/skills` from the working folder up to the root; Admin `/etc/codex/skills` | same name: not merged, both listed | explained in 1; home-folder names Later |
| Subagents | Claude Code | User `~/.claude/agents/`; Project `.claude/agents/`; Managed | same name: Managed, then Project, then User, so a Project subagent replaces a User one: the reverse of skills | explained in 1; home-folder names Later |
| Subagents | Codex | User `~/.codex/agents/*.toml`; Project `.codex/agents/*.toml` | not stated in the pages read (unknown) | explained in 1; home-folder names Later; Harness reads `.agents/agents` today, which those pages do not name |
| Instruction files, rules | Claude Code | User `~/.claude/CLAUDE.md`, `~/.claude/rules/`; Project `CLAUDE.md` at the root or inside `.claude/`, `.claude/rules/`; Local `CLAUDE.local.md`; Managed | all are read, top folder down; none replaces another | explained in 1; home-folder names Later |
| Instruction files | Codex | User `~/.codex/AGENTS.md`; Project `AGENTS.md` from the root down | joined root down within 32 KiB; in one folder `AGENTS.override.md` replaces `AGENTS.md` | explained in 1; home-folder names Later |
| MCP servers | both | Claude Code: User and Local in `~/.claude.json`, Project `.mcp.json`; Codex: `config.toml` User and Project | Claude Code warns when one name is in two scopes; which wins was not verified | Later |

Three more documented facts shape the screens. Claude Code keeps the Local file at the repository
root, and in a linked worktree uses the main checkout's file; on Windows it stays beside
`.claude/settings.json`. Claude Code holds back every settings-file hook until the folder's trust
dialog is accepted, or a parent folder's; Atlas does not read whether it was, so no sentence on
screen says a hook runs. Claude Code picks up a saved settings file in running
sessions; managed settings sent by MDM or the console are not files Atlas can read.

## Flow

1. When the person opens Harness Setup with a repository connected, Atlas draws Setup as today and
   then fills in the hooks of the User, Local, Managed and System files. Pane 2 lists a hook
   category's rows under one heading per file that exists, each naming the scope, the tool and
   the file: the repository's own first, as today (Project, Local), then User, then Managed.
2. When hooks are set in files outside the repository, Atlas shows one line under the explainer
   (`scope.outside`) with a chip that selects the first of them. With none, nothing is drawn.
3. When the person presses **Where settings live** in the Setup header, or the help mark on a
   file heading, Atlas opens the popup on that tool and scope (see The popup).
4. When the person presses **Add hook** on a hook category or in the popup, Atlas opens a centred
   popup whose three sections are visible together: *What it runs* (a built-in template or typed
   fields), *Where it lives* (the tool, then one equal-height card per scope that tool has), and
   *Review the change* (the absolute path, the exact diff, who is affected, when it takes
   effect), which fills in once the first two are complete.
5. When the person presses **Write to {file}**, the writer saves a version of the file's hooks,
   replaces the file atomically and Atlas shows a toast with **Undo**; the new row is selected.
6. When the person selects a hook from a file Atlas may change, pane 3 offers **Edit**, **Move**,
   **Remove** and, from slice 6, **Turn off**. Each opens the same Review step before any write.
   Edit on a hook Atlas did not add asks one more confirm first; a hook Work status added carries
   its tag and offers only **Turn off**.
7. When the person presses **Undo**, the writer puts back the version saved before the write, or
   removes a file the write created. If the file's hooks changed since, it reverses only that one
   entry and says so; if the entry itself changed, it touches nothing and points to History.
8. When the file changed after Atlas read it (Claude Code itself writes the Local file when a
   person answers "don't ask again"), nothing is written; the popup says the file changed, rereads
   it, shows the new diff and keeps what the person typed.
9. When the evidence is missing, Atlas says which: a settings file that is not valid JSON is named
   and never rewritten; a policy sent by MDM and Codex's review state are named in the popup as
   unread. For a settings folder moved with `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, the popup's User
   row offers **Show another settings file**: the person picks a `settings.json` or `hooks.json`
   in the system file picker and it is listed as another User file until the app closes. A
   picked file inside a Git work tree is refused unless it is that repository's own settings file.
10. When an agent, a vault document, a wiki page or pull-request text asks for a hook, nothing
    happens: no MCP tool, ACP request or document action reaches the writer, no field is
    prefilled from them, and a script in a rendered document that calls the writer's propose and
    then its confirm writes nothing.
11. When a listed file's hooks differ from the newest version Atlas holds, Atlas records a version
    marked **Changed outside Atlas**: within 5 s while the app is open, otherwise the next time
    it reads the file. Every Atlas write records the hooks before and after it.
12. When the person presses **History** on a file heading, Atlas opens the History popup on that
    file: versions newest first on the left, the selected one compared with the file now on the
    right. Typing in its search field keeps the versions and deleted hooks that match.
13. When the person presses **Save this version**, Atlas records the file's hooks now under the
    name typed, or under the time when no name is typed.
14. When the person presses **Restore this version**, or **Bring back** on one hook, Atlas opens
    the same Review step; the write goes through the writer, the toast offers **Undo**, and the
    restore is itself the newest version.
15. When no version holds what the person searched for, Atlas says since when it has versions of
    that file and that a hook added and removed while Atlas was closed was never recorded.

**Templates in slice 3** are fixed in the app and chosen by id: *Notify me when Claude Code waits
for me* (`Notification`; the vendor guide's `osascript` line on macOS and `notify-send` line on
Linux; not offered on Windows until a command is verified there); *Run a command after every file
edit* (`PostToolUse`, matcher `Edit|Write`, command typed); *Start from an empty hook*.

## States

| State | Web | macOS app |
|---|---|---|
| No repository connected | the blueprint arrival and `browserOnly`, as today; **Where settings live** opens the popup with explanations only (`where.webNote`) | today's connect stage, plus **Where settings live**; User files alone are Later 2 |
| Loading | Out of scope: nothing is read | repository rows as today; other files' headings arrive as each is read, `scope.reading`; input never waits |
| Empty: a file that does not exist | Out of scope | no heading in pane 2; the popup's stack and the Where card say `scope.noFile`, and **Add hook** creates it |
| Empty: no hook in any file | Out of scope | today's empty category, with **Add hook** |
| One hook | Out of scope | one row under its file heading |
| Error: a file is not valid JSON | Out of scope | `scope.invalid` under its heading; no action on it; other files stay listed |
| Error: a file cannot be opened | Out of scope | `scope.unreadable` with the reason; **Read files again** |
| Partial: a hook Atlas only names | Out of scope | an `http`, `mcp_tool`, `prompt` or `agent` hook shows its event and `scope.typeOnly`; inline `[hooks]` in `config.toml` show `finding.codexInline`; neither is editable |
| Managed or System file present | Out of scope | its heading and rows, no actions, `scope.managedCaption` |
| Organisation allows only its hooks | Out of scope | `finding.managedOnly` stands where **Add hook** would be; no write is offered |
| All hooks off | Out of scope | `finding.allOff` naming the file and the line to remove; no button |
| A hook off (slice 6) | Out of scope | its row stays under its heading with `off.tag`; **Turn on** |
| Review open | Out of scope | path, diff, `review.*` sentences; **Write to {file}** and Cancel |
| Written; undone | Out of scope | toast `done.*` with **Undo**; then `done.undone` |
| Refused: file changed, link, not writable | Out of scope | `error.changed`, `error.link` or `error.notWritable` in the popup; typed text kept; nothing written |
| Undo after the file changed | Out of scope | `done.undoneEntry`; or `error.undoChanged` pointing to History |
| A settings file the person chose | Out of scope | a second User heading with its path; `scope.another` again after the app restarts; one inside another Git repository shows `scope.pickedInRepo` and is not read |
| A hook Atlas did not add; a hook Work status added | Out of scope | Edit asks `edit.notAtlas` first; `tag.workStatus` with its hint, **Turn off** only |
| The connected folder is a linked worktree | Out of scope | Review of a Local write adds `review.worktreeLocal`; a move to or from Local shows `move.worktreeRefused` |
| History: only the first version | Out of scope | `history.empty` with the one row; **Save this version** |
| History: versions | Out of scope | rows with time, name or `history.summary`, and source; the diff on the right; **Restore this version**, **Bring back**, **Copy command** |
| History: an outside change | Out of scope | a row marked `history.source.outside` with `history.outsideNote` |
| History: search with no match | Out of scope | `history.noMatch`; the typed text stays |
| History: saved; Save refused | Out of scope | `history.saveDone`; `history.full` with the name kept |
| History: a version or the folder cannot be read | Out of scope | `history.damaged` on that row; `history.unreadable` in place of the list; the settings file is untouched |
| History: restored; brought back | Out of scope | toast `history.restored` or `history.broughtBack` with **Undo** |
| History: the settings file is gone | Out of scope | `history.gone`; rows and **Copy command** stay, restore is not offered |
| Largest measured: 47 hook entries in four files, 16 events in one | Out of scope | every row; headings stay pinned while pane 2 scrolls |
| Windows app | the same web cells | the Harness reading fails as today (`failedUnsupported`); the popup opens with explanations and Windows paths |

Every web cell that reads "Out of scope" has one reason: a browser cannot open a file in the home
folder or a dot folder, and has no absolute path to write (`surfaces.md:128-130`).

## The popup

One centred dialog, the shared `Dialog`. It opens on one sentence that says what a hook is
(`where.whatHook`). A switch picks the tool; a row of kinds picks what is explained: Hooks and
Permission rules with their counts, and Skills, Subagents and Instruction files as explanation
with the Project items Setup already lists. Left: that tool's scopes as one stack ordered by
reach, the widest on top, each with its reach in plain words and how many items it holds now. The
order is not a priority (`where.order`): the line under the stack says how the selected kind
combines, and for hooks it says that every scope's hooks run and none overrides another. Right:
the selected scope. Nothing unfolds.

```
Where Claude Code settings live                         [ Claude Code | Codex ]
A hook is a command the agent runs by itself at a set moment. ...
Hooks   Permission rules   Skills   Subagents   Instruction files
+-------------------------------------+  Local
| Managed   your organisation    none |  File            /Users/.../repo/.claude/settings.local.json
| User      every project, you     16 |  Who it affects  You, in this project only.
| Project   this project, team      7 |  In Git          Not committed. ...
| Local     this project, you       0 |  In it now       No hooks. Allow 1.
+-------------------------------------+  How it differs  Unlike Project, ... Unlike User, ...
Hooks from every scope all run. None overrides another. ...     [ Add hook here ]
```

The right side answers five things in this order: the file (its absolute path, or the pattern on
the web), who it affects, whether Git commits it, what is in it now, and how it differs from its
neighbours. Under the stack is the combining rule for the selected kind and tool
(`where.combine.*`); the foot lists what Atlas does not read (`where.notRead`). The stack is the
one diagram: a row brightens when selected, and it is static under reduced motion.

## What Setup points out

A fact from files, never a score, drawn only when true. Each sits where it applies.

| Finding | Shown as | Condition |
|---|---|---|
| Hooks set outside this repository | line `scope.outside` with a chip that selects the first | an entry in a User, Managed or System file |
| The same hook in two files | `tag.twoFilesClaude` or `tag.twoFilesCodex` | identical event, matcher and command in two files of one tool |
| One tool blocks and the other does not | line `finding.toolGap` on Blocking hooks | both tools have files here; one has an entry on a guardrail event and the other none |
| Codex has not reviewed it | today's `hookApprovalGate` on every Codex row | always: Atlas does not read the review state |
| All hooks off | line `finding.allOff`, read only | the highest file that sets `disableAllHooks` sets it true |
| Added by Work status | tag `tag.workStatus` | the entry's command is Work status's helper |
| Only the organisation's hooks run | line `finding.managedOnly` | the managed file sets `allowManagedHooksOnly` |
| Local file can be committed | line `finding.localTracked` | Git tracks the Local file or does not ignore it |
| Local file a worktree does not use | line `finding.worktreeLocal` | the connected folder is a linked worktree holding its own Local file (macOS, Linux) |
| Codex hooks defined inline | line `finding.codexInline` | a `config.toml` has a `[hooks.<Event>]` table |

Only two join the existing problem line (`docs/features/harness.md:51`): a settings file that is
not valid JSON, and `finding.managedOnly` while the person's files hold hooks.

## Hook history

A **version** is the hooks of one settings file at one moment: the file's `hooks` value and
nothing else from the file. Versions are kept in the hook version store, which the Work status
spec defines with the agent config writer and builds in its slice 9: where it sits in the app's
data, what a version file holds, how many are kept and who can read them are that spec's. This
spec adds what a person does with it: versions recorded when Atlas was not the one writing, named
saves, the History popup, search, restore, and the Git history of the two Project files. The
settings file stays the only truth; deleting history loses the way back and changes no setting.

**One history per settings file,** keyed by the file's absolute path. The owner's sessions use
several settings folders (`CLAUDE_CONFIG_DIR`), so `~/.claude/settings.json` and each
`settings.json` he picks have separate histories that never merge, and a picked file's history is
there again the next time he picks it.

| Version | Recorded when | Shown as |
|---|---|---|
| First seen | Atlas reads a file it holds no version of | `history.source.first` |
| Changed in Atlas | by the store's own rule, around every write the writer makes, for Work status's writes as for Harness's | `history.source.atlas` and `history.summary` |
| Changed outside Atlas | the file's hooks differ from the newest version: within 5 s through a file watch on the listed files while the app is open, otherwise at the next read | `history.source.outside` |
| Saved by you | the person presses **Save this version**, with a name or without | `history.source.saved` and the name |
| Committed | never recorded: read from Git for the two Project files, the last 50 commits that changed each | `history.source.committed` |

**What a version can and cannot tell.** Atlas names its own writes and calls every other change
"outside Atlas"; it never guesses whether a person, an editor or an agent made it. Changes made
while the app was closed arrive as one version, and a hook added and removed in that time was
never seen. A change to any other key records nothing. A file deleted outside Atlas records a
version with no hooks, so its hooks appear under Deleted hooks. History begins when this slice
first reads a file.

**Git, for the two Project files, is shown alongside and not instead.** It is already there,
shared and portable, but holds committed states only: a hook added and deleted between two
commits is absent, and it has nothing for User or Local. Committed rows are read, never stored.

**What this spec needs from the store,** each of which fails a criterion here if absent:

- one history per settings file, a picked file included;
- a version recorded by a caller that is not the writer (First seen, Changed outside Atlas, Saved
  by you), holding the `hooks` value only;
- a saved version, with its name, that the store's retention never removes; when the store is
  full of saved versions, Save refuses and says so (`history.full`);
- one version, or one file's whole history, deleted on the person's press;
- its limit, its count kept and its folder as values, which `history.kept` and `history.full`
  show; this spec fixes none of those numbers;
- listing and search in Rust, so the page receives only the fields the reader returns, and no
  version reaches the vault, IndexedDB, the derived index, a log, an agent turn or a model call.

A hook's own text is the hook, so the store keeps it: a hook removed because its command held a
token stays in history until the person deletes that history, and `history.kept` says so.

**The History popup.** One centred dialog opened by **History** on a file heading. Top: a switch
between the listed files, a switch between **Versions** and **Deleted hooks**, and the search
field. Left: rows newest first, each with its time, its name or what changed, and its source;
commits of a Project file sit among them by time. Right: the selected version compared with the
file as it is now, hook by hook, with **Restore this version**; each hook the file lacks now has
**Bring back** and **Copy command**. Deleted hooks lists every hook some version holds and the
file lacks now, once each, with when it was last there. Search matches an event, a matcher, the
command text and a version's name. The foot names the folder and what is kept, with **Delete
this version** on a selected row and **Delete all history of {file}** behind a confirm whose
default is Cancel.

**Restore (slice 4).** Through the writer, after Review. Restoring a version replaces the file's
`hooks` value with the version's and leaves every other key as it is; Bring back adds one entry
to the event it had. The only target is the file the version came from. The hooks the file holds
are recorded first and the result after, so Undo and a second restore both reverse it. A hook
Atlas only names is restored byte for byte and the diff shows its event and type. Codex skips
restored hooks until the person reviews them again.

## Reading and writing

**Read (the fourth written exception in `surfaces.md`).** Fixed file names or a file the person
picked, never a folder listing and never a path the page sends:

| | |
|---|---|
| Files | `~/.claude/settings.json`; the Local `settings.local.json` at the place the vendor rule gives; Claude Code's managed file (`/Library/Application Support/ClaudeCode/`, `/etc/claude-code/`, `C:\Program Files\ClaudeCode\`); `~/.codex/hooks.json`; the System `hooks.json`; table headers named `[hooks.<Event>]` in `~/.codex/config.toml` and the project's; a file named `settings.json` or `hooks.json` that the person picked in the system file picker, held by Rust until the app closes and refused when it sits inside a Git work tree, unless it is that repository's own settings file; for the two Project files, the last 50 committed versions of each, through `src-tauri/src/git/runner.rs`, into the same struct |
| Returned | per hook: event, matcher, type, and for a `command` hook its command, timeout and `async`; per file: existence, size, modified time, `disableAllHooks`, `allowManagedHooksOnly`, permission-rule counts; whether Git ignores or tracks the Local file |
| Never returned | `env`, `apiKeyHelper` or any other key; an `http` hook's address or headers; a `prompt` or `agent` hook's text; permission-rule text; any `[hooks.state]` header; `~/.claude/.credentials.json`, `~/.codex/auth.json`, sessions, history |
| How | every component of each path opened without following a link, so a `.claude` folder that is a link is refused as the file itself would be; a regular file under 1 MiB, parsed into a struct that names only the fields above; an error carries no file content; from slice 2 a file watch on these files while the app is open rereads one when it changes |
| Gates | a planted secret in every unreturned field is absent from the serialized record; the path table for macOS, Linux and Windows; the file list is a constant |

The `settings.local.json` entry stays in `DENIED_NAMES` for Harness's text reads; only this reader
opens it, into that struct.

**Write.** Only through the agent config writer and under its seven rules, only after Review, and
only these five files or a User file the person picked: `~/.claude/settings.json`, the project's
`.claude/settings.json`, the Local `settings.local.json`, `~/.codex/hooks.json`, the project's
`.codex/hooks.json`; from slice 6 also one parked file beside each Claude Code file,
`settings.hooks-off.json` for a User or Project file and `settings.local.hooks-off.json` for the
Local one. Never `config.toml`, `~/.claude.json`, a managed or System file, a script under
`.claude/hooks/`, `.gitignore`, `disableAllHooks` or any key that is not a hook entry, or any
trust or review key. This spec asks two things of the writer beyond Work status's use, both
decided by the lead on 2026-11-22: an existing entry or a restored version as a command source,
and a change to entries Atlas did not add. The version store is Atlas's own and is not an
agent's settings.

- **A command comes from one of four places:** a built-in template chosen by id; text the person
  typed in the popup; for Move and Turn on, an entry already in one of those files; or, for
  Restore and Bring back, a saved version of the same file, put back only into that file. For
  the last two the page names the entry by position and content hash and Rust copies the command
  from the file or version it read, so the command never passes through the page.
- **A confirm counts only from Atlas's own Review step,** for the proposal id Rust issued when
  that step opened. The same calls made by a script in a rendered document write nothing; how
  Rust tells the two apart is the planner's to solve and criterion 8 is what proves it.
- **A move never widens where a command runs on this computer.** User to Project, User to Local,
  and Local to or from Project are offered; Project or Local to User is not, and
  `move.widerRefused` says why. A hook never moves between tools or between two User files.
- **In a linked worktree the Local file is the main checkout's,** read by sessions in every
  worktree. A move to or from it is refused there (`move.worktreeRefused`), because one press
  would add or drop a hook for the agents in all of them, and Review of any other write to it
  says so (`review.worktreeLocal`).
- **A write changes only the entries Review showed.** Every other byte of the file is preserved,
  including keys Atlas does not read. A new entry is appended as the last group of its event.
- **A diff holds only hook entry lines,** never a neighbouring key such as `env`: in Review, in
  History and in the writer's log alike. The log keeps the path, the time, the event and a hash
  of the entry, never the command.
- **Entries Atlas did not add.** Remove, Move and Turn off go through Review like any other.
  Edit asks one more confirm that says Atlas did not add the hook (`edit.notAtlas`). An entry
  Work status added is recognised by its helper, tagged `tag.workStatus`, and removed only in
  Work status; Harness offers Turn off for it and nothing else.
- **Removing a Codex entry** may change what Codex holds as reviewed for the file's other
  entries: its records are keyed by an entry's position (Today, observed). Probe before slice 3:
  remove one of three reviewed hooks and see which ones Codex asks about again;
  `review.codexRemove` ships with the words the probe supports, or not at all.
- **A parked file has the Git state of the file beside it:** a Project hook's parked file is
  committed with the repository. A Local hook is parked only when Git ignores
  `settings.local.hooks-off.json`; `.gitignore:10` names only `settings.local.json` today, so
  Atlas refuses and names the line to add (`off.localNotIgnored`).
- **Atlas never runs, test-fires, trusts or reviews a hook,** and never accepts a trust dialog.
- **The Local file** is written at the place the vendor rule gives; Review shows that path.

## Copy

ko is in the pull request body, as in `docs/specs/2026-11-21-work-status-destination.md`: Hangul
in `docs/` fails `pnpm docs:language`. Namespace `harness`. `{file}` is a path as shown on screen.

| Key | Where it appears | English |
|---|---|---|
| `scope.user` / `.project` / `.local` / `.managed` / `.system` | Headings, cards, stack | User / Project / Local / Managed / System |
| `scope.heading` | Pane 2 file heading | {scope} · {tool} · {file} |
| `scope.userCaption` | Stack, card | Every project on this computer. Only you. |
| `scope.projectCaption` | Stack, card | This repository. Teammates get it when you commit. |
| `scope.localCaption` | Stack, card | This project, on this computer only. Git does not commit it. |
| `scope.managedCaption` | Stack, heading | Set by your organisation. Atlas shows it and cannot change it. |
| `scope.systemCaption` | Stack, heading | Set for every user of this computer. Atlas shows it and cannot change it. |
| `scope.outside` | Under the explainer | {count, plural, one {# hook is set in a file outside this repository} other {# hooks are set in files outside this repository}} |
| `scope.reading` | Pane 2 foot | Reading {file} |
| `scope.noFile` | Popup stack, Where card | {file} does not exist yet. Adding a hook here creates it. |
| `scope.invalid` | Under a heading | {file} is not valid JSON, so Atlas read nothing from it and will not change it. Fix it in an editor, then press Read files again. |
| `scope.unreadable` | Under a heading | Atlas could not open {file}: {reason}. Nothing from it is listed. |
| `scope.typeOnly` | Row detail | This is a {type} hook. Atlas shows that it exists and not what it sends. |
| `scope.another` / `scope.alsoRead` | Popup, User row / pane 1 foot | Show another settings file / Also read: hook entries in {files}. Nothing leaves this computer. |
| `scope.pickedInRepo` | After a pick | {file} is inside the Git repository {repo} and is not one of that repository's own settings files, so Atlas did not read it. |
| `tag.workStatus` / hint | Row | Added by Work status / Work status added this hook to show what the agent is doing. Remove it in Work status. |
| `tag.twoFilesClaude` / hint | Row | In two files / {fileA} and {fileB} both define this hook. Claude Code runs it once. |
| `tag.twoFilesCodex` / hint | Row | Can run twice / {fileA} and {fileB} both register this command. Codex can run it twice for one event. |
| `finding.toolGap` | Blocking hooks | {toolA} has hooks that can stop an action in this repository and {toolB} has none, so {toolB} is not stopped where {toolA} is. |
| `finding.allOff` | Under Claude Code headings | {file} sets disableAllHooks, so Claude Code skips the hooks in your User, Project and Local files here. Hooks your organisation manages still run. Removing that line from {file} turns them back on. |
| `finding.managedOnly` | Problem line, headings | Your organisation allows only its own hooks, so Claude Code skips the {count} hooks in your User, Project and Local files. |
| `finding.localTracked` | Under the Local heading | Git can commit {file}. Add .claude/settings.local.json to .gitignore to keep it on this computer. |
| `finding.worktreeLocal` | Under the Local heading | {folder} is a linked worktree. Claude Code reads {mainFile} in the main checkout and not {file}. |
| `finding.codexInline` | Under a Codex heading | {file} also defines hooks for {events}. Atlas shows their events, not their commands, and changes only hooks.json. |
| `where.open` / `where.title` | Setup header / popup | Where settings live / Where {tool} settings live |
| `where.whatHook` | Popup, first line | A hook is a command the agent runs by itself at a set moment, such as before it uses a tool or when it finishes a reply. |
| `where.order` | Above the stack | Listed from the widest reach to the narrowest. The order is not a priority. |
| `where.file` / `.affects` / `.git` / `.now` / `.differs` | Popup labels | File / Who it affects / In Git / In it now / How it differs |
| `where.nowHooks` | Popup | {count, plural, =0 {No hooks.} one {# hook.} other {# hooks.}} |
| `where.user.affects` / `.git` / `.differs` | Popup, User | You, in every project on this computer. / Never. It is outside every repository. / Unlike Project, no teammate gets it. Unlike Local, it also applies in your other projects. |
| `where.project.affects` / `.git` / `.differs` | Popup, Project | Everyone who works in this repository. / Committed. A change reaches teammates when you commit and they pull. / Unlike User and Local, a change here changes it for your team. |
| `where.local.affects` / `.git` / `.differs` | Popup, Local | You, in this project only. / Not committed. Claude Code keeps the file out of Git when Claude Code creates it. / Unlike Project, no teammate sees it. Unlike User, it stays in this project. |
| `where.codexProject` | Popup, Codex Project | Codex reads this file only in a project you have trusted in Codex. |
| `where.managed.affects` / `.git` / `.differs` | Popup, Managed | Everyone your organisation sends it to. / No. It is outside every repository. / None of your files overrides it. |
| `where.combine.claudeHooks` | Under the stack | Hooks from every scope all run: Managed, User, Project and Local. None overrides or switches off another, and the same hook in two files runs once. Claude Code holds them all back until you trust the folder in Claude Code. |
| `where.combine.codexHooks` | Under the stack | Hooks from every scope all run and none overrides another. The same command in two files can run twice. Codex skips a new or changed hook until you review it in /hooks. |
| `where.combine.claudePermissions` | Under the stack | Claude Code joins the rule lists of every file, then checks deny, ask and allow in that order. The first match decides. |
| `where.combine.claudeSkills` | Under the stack | When two skills share a name, Managed wins over User and User wins over Project, so your User skill replaces a Project skill of the same name. |
| `where.combine.codexSkills` | Under the stack | Codex lists skills from every folder. Two skills with one name both appear. |
| `where.combine.claudeSubagents` | Under the stack | When two subagents share a name, Claude Code uses Managed, then Project, then User, so a Project subagent replaces your User subagent of the same name. Skills go the other way. |
| `where.combine.claudeInstructions` | Under the stack | Claude Code reads all of them, from the top folder down to the one you start in. None replaces another. |
| `where.combine.codexInstructions` | Under the stack | Codex reads ~/.codex/AGENTS.md, then each AGENTS.md from the repository root down. In one folder, AGENTS.override.md replaces AGENTS.md. |
| `where.notRead` | Popup foot | Atlas does not read a policy your organisation sends without a file, Codex's record of which hooks you reviewed, whether you trusted this folder in Claude Code, or the skills, subagents and instruction files in your home folder. It reads a settings folder moved with CLAUDE_CONFIG_DIR or CODEX_HOME only after you choose its file with Show another settings file. |
| `where.webNote` | Popup foot, web | This browser shows what each file is. The desktop app also shows what is in yours and changes it. |
| `add.action` / `add.here` / `add.title` | Category header / popup / popup title | Add hook / Add hook here / Add a hook |
| `add.stepWhat` / `.stepWhere` / `.stepReview` | Popup steps | What it runs / Where it lives / Review the change |
| `add.template.notify` / body | Template card | Notify me when Claude Code waits for me / Shows a desktop notification on the Notification event. |
| `add.template.afterEdit` / body | Template card | Run a command after every file edit / Runs the command you type after Edit and Write, on the PostToolUse event. |
| `add.template.blank` / body | Template card | Start from an empty hook / You choose the event and type the command. |
| `add.event` / `.matcher` / `.command` / `.timeout` | Field labels | Event / Matcher / Command / Timeout in seconds |
| `add.matcherHint` | Under Matcher | The tools this hook applies to, such as Bash. Empty applies to every tool. |
| `add.commandHint` | Under Command | Runs in your shell with your permissions each time the event happens. Atlas writes exactly what you type. |
| `add.blocks` | Under Event | {tool} waits for a {event} hook and the hook can stop the action. |
| `add.noLocalCodex` | Where step, Codex | Codex has no file for this project that only you have. Its hooks live in User or Project. |
| `review.target` / `.creates` | Review | Atlas will change one file: {file} / Atlas will create {file} |
| `review.shared` | Review, Project | {file} is committed with the repository. Teammates get this change when you commit and they pull. |
| `review.effectClaude` | Review | Claude Code sessions that are running pick this up when the file is saved. |
| `review.effectCodex` | Review | Codex skips a new or changed hook until you review it. Run /hooks in Codex. |
| `review.codexRemove` | Review, removing a Codex entry; only as the probe finds | Removing this entry can make Codex ask you to review the other hooks in {file} again. |
| `review.worktreeLocal` | Review, Local file in a linked worktree | {file} is in the main checkout. Claude Code reads it in every worktree of this repository, so this change applies in all of them. |
| `review.write` / `.cancel` | Review buttons | Write to {file} / Cancel |
| `done.added` / `.removed` / `.edited` | Toast | Added the {event} hook to {file}. / Removed the {event} hook from {file}. / Changed the {event} hook in {file}. |
| `done.moved` | Toast | Moved the {event} hook from {from} to {to}. |
| `error.changed` | Popup | {file} changed after Atlas read it, so nothing was written. The diff below is against the file as it is now; what you typed is kept. |
| `error.link` | Popup | {file} is a link to another file, so Atlas will not write through it. Nothing was written. |
| `error.notWritable` | Popup | Atlas could not write {file}: {reason}. Nothing was changed; what you typed is kept. |
| `done.undo` / `.undone` / `.undoneEntry` | Toast | Undo / {file} is back to what it held before this change. / {file} changed after Atlas wrote it, so Atlas reversed only the {event} hook and kept the other changes. |
| `error.undoChanged` | Toast | The {event} hook in {file} changed after Atlas wrote it, so Atlas restored nothing. The hooks from before Atlas's change are in History. |
| `edit.action` / `move.action` / `remove.action` / `move.title` | Pane 3 / popup title | Edit / Move / Remove / Move this hook to another file |
| `edit.notAtlas` / `.notAtlasConfirm` | Confirm before Edit | Atlas did not add this hook. It was in {file} when Atlas first read it, or was added outside Atlas. Nothing is written until you review the change. / Edit this hook |
| `remove.note` | Review | This deletes the entry from {file}. The script {script} stays on disk. |
| `move.widerRefused` | Where step | A hook in this repository's files runs only here. In User it would run in every project on this computer, so Atlas does not move it there. To run it everywhere, add it to User yourself. |
| `move.worktreeRefused` | Where step, linked worktree | {folder} is a linked worktree, and Claude Code reads the main checkout's Local file in every worktree. A move to or from that file would change every worktree at once, so Atlas does not make it here. |
| `off.action` / `on.action` / `off.tag` | Pane 3, row (slice 6) | Turn off / Turn on / Off |
| `off.note` | Review, slice 6 | Claude Code has no switch for one hook. Atlas moves this entry from {file} to {parkedFile}, which Claude Code does not read. Turn on moves it back. |
| `off.shared` | Review, slice 6, Project | {file} and {parkedFile} are both committed, so this turns the hook off for teammates too when you commit. Claude Code has no way to switch off one Project hook for you alone. |
| `off.localNotIgnored` | Pane 3, Local hook | Git would commit {parkedFile}, and a Local hook stays on this computer. Add {parkedName} to .gitignore, then press Turn off again. |
| `off.codex` | Pane 3, Codex row | Codex has its own switch for one hook. Run /hooks in Codex; Atlas does not change it. |
| `history.open` / `history.title` | File heading / popup | History / History of the hooks in {file} |
| `history.tabVersions` / `.tabDeleted` / `.search` | Popup top | Versions / Deleted hooks / Find a hook by event, matcher or command |
| `history.source.first` / `.atlas` / `.outside` / `.saved` / `.committed` | Version row | First seen by Atlas / Changed in Atlas / Changed outside Atlas / Saved by you / Committed by {author} |
| `history.summary` | Version row | {added} added · {removed} removed · {changed} changed |
| `history.outsideNote` | Under an outside version | Atlas saw this change at {time}. It holds every change made to the hooks in {file} since {previous} as one version. A hook added and removed between those two times was never recorded. |
| `history.compare` / `.same` | Right side | Compared with {file} as it is now / This version holds the same hooks as {file} does now. |
| `history.save` / `.saveName` / `.saveDone` | Popup top / field / toast | Save this version / Name (optional) / Saved the hooks in {file} as {name}. |
| `history.restore` / `.bringBack` / `.copy` | Right side | Restore this version / Bring back / Copy command |
| `history.restoreNote` | Review, slice 4 | This replaces the hooks in {file} with the {count} hooks of the version from {time}. Every other setting in {file} stays as it is. The hooks {file} holds now are kept as a version first. |
| `history.restored` / `.broughtBack` | Toast, slice 4 | Restored the hooks in {file} to the version from {time}. / Brought the {event} hook back to {file}. |
| `history.deletedSeen` | Deleted hooks row | Last in {file} at {time} |
| `history.empty` | Popup, one version | Atlas began keeping versions of the hooks in {file} at {since}. Every change from now on is listed here. |
| `history.noMatch` | Search, no match | No version of {file} holds a hook that matches {query}. Atlas has versions since {since}; a hook added and removed while Atlas was closed was never recorded. |
| `history.committedNote` | Under a committed row | From this repository's Git history. Atlas lists the last 50 commits that changed {file}. |
| `history.kept` | Popup foot | Atlas keeps every version you saved and the last {count} others for each file, in {folder} on this computer. A version holds hooks only, including a hook you removed, until you delete it here. |
| `history.delete` / `.deleteAll` | Popup foot | Delete this version / Delete all history of {file} |
| `history.deleteConfirm` | Confirm | This deletes {count, plural, one {# version} other {# versions}} of the hooks in {file} from this computer. The hooks {file} holds now stay. Deleted versions cannot be brought back. |
| `history.full` | Save refused | The versions you saved for {file} fill the {limit} Atlas keeps for it, so this one was not saved. Delete a saved version, then press Save this version again. |
| `history.damaged` / `.unreadable` | Version row / in place of the list | Atlas cannot read the version from {time}, so it cannot be shown or restored. / Atlas could not read the versions in {folder}: {reason}. The hooks in {file} are not affected. |
| `history.gone` | Popup, file missing | {file} is no longer there. Its versions are kept and can be copied or deleted, not restored. |

## Edge cases

- **Zero:** with no settings file anywhere, the hook categories are today's empty ones and each
  Where card says `scope.noFile`. **One:** one row under one heading. **Largest measured:** 47
  entries in four files, 16 events in one file. **First run:** nothing asks before the other
  files are read; `scope.alsoRead` is the standing statement of what was read.
- **Hangul:** a typed command, matcher or path with Hangul is written as UTF-8 exactly as typed
  and shown unescaped in the diff; a home folder or repository path with Hangul or spaces works.
- **Moved, renamed or unreadable folder:** a missing repository fails the reading as today; a
  missing home file is `scope.noFile`; an unreadable one is `scope.unreadable`, never empty.
- **Two edits at once:** the writer compares the file with what Review showed and refuses on any
  difference (`error.changed`); two Atlas windows behave the same way. **Offline:** all of it
  works; nothing here uses the network.
- **Linked worktree:** Local means the main checkout's file on macOS and Linux; Review shows that
  path and `review.worktreeLocal`, and moves to or from it are refused. **Windows:** the Local
  file is beside `.claude/settings.json`.
- **A Local file Git tracks or does not ignore:** `finding.localTracked`, shown in Review too
  before Atlas creates or changes that file; a write to a tracked one also shows `review.shared`.
- **Below three panes,** where pane 3 is itself the centred dialog, Edit, Move and Remove replace
  that dialog's content; a second dialog never stacks on it.
- **The same hook in Project and User:** both rows stay; Remove acts on the selected file only.
- **A command holding a pasted token:** shown as written, as Claude Code's `/hooks` shows it; it
  is never logged, sent, or given to an agent turn or a model call.
- **History:** zero versions cannot be seen (the first read records one); one is
  `history.empty`; the largest is the store's limit, the saved ones and 23 commits, with rows
  drawn as they are read. A name with Hangul is kept as typed. A moved or renamed repository
  starts a new history and the old one stays under `history.gone`. A file that stops being valid
  JSON records nothing until it parses again. A file changed during Review refuses the restore
  (`error.changed`). Versions are ordered by a counter, so a clock set backwards reorders none.
- **`CLAUDE_CONFIG_DIR` or `CODEX_HOME`:** Atlas reads no environment. It reads the default home
  files, says so (`where.notRead`), and reads another folder's file only once the person picks
  it; a picked file with any other name, a link or a folder is refused with `scope.unreadable`,
  and one inside another repository with `scope.pickedInRepo`. Each picked file has its own
  history.

## Out of scope

- Hooks in plugins and in skill or subagent frontmatter: other files and other lifetimes; the
  skill text Harness already shows is where they are visible.
- Writing `config.toml`: it holds Codex's review state and may hold a server's client secret, and
  one lossy rewrite would undo every review; inline hooks stay read by event name. Setting that
  review state or Claude Code's trust: Atlas names the command and never answers for the person.
- Copying a hook from one tool to the other: the scripts read different input, and `e47518a9`
  keeps the two trees independent. Script files under `.claude/hooks/` and `.codex/hooks/`: a
  template that needs one would add a sixth kind of write.
- Permission-rule text, `env`, and anything else in a settings file; and the web, for every read
  and write: it gets the explanation only.
- Naming the skills, subagents and instruction files in the home folder: that is a folder listing
  there, which the read rule refuses; the popup explains the scopes without it. Writing
  `disableAllHooks`: in a linked worktree the Local file is the main checkout's, so one press
  would switch off blocking hooks for the agents in every worktree; the finding stays read-only.
- History of skills, subagents and instruction files: Git holds the committed ones, and a second
  kind doubles the folder contract. One name saved across several files at once: restore is one
  file and one diff at a time. Sending history to another computer: it can hold tokens.

## Slices

Ordered; file areas are disjoint between slices, except that each slice adds its own key group to
`messages/*/harness.json`. Slices 2 to 6 start once the writer and its version store
(`src-tauri/src/agent_config/`, slice 9 of the Work status spec) are on `main`; slice 1 needs
neither. Hook entries are optional in Work status since its revision of 2026-11-22, so when this
spec's slice 2 is ready first, the writer and the store are built here under the same Record 3. Slice 2 calls the store and never the writer. Slice 3 also waits for the Codex removal
probe.

1. **Every scope, read and explained:** the reader, pane 2 file headings, tags and findings, the
   popup with every kind explained, the web popup, the picked file. `src-tauri/src/harness_scopes/`,
   `tests/fixtures/harness-scope-files.json`, `src/shared/lib/harness-scopes/`,
   `src/entities/agent-scopes/`, `src/widgets/harness-scopes/`, `src/widgets/harness-setup/`, and
   `.claude/rules/surfaces.md`, `.claude/rules/local-first.md`, `docs/features/harness.md`.
2. **Hook history, seen and searchable:** versions on read, on an outside change and on Save,
   recorded into the store; the file watch; the History popup with its diff, search, Deleted
   hooks, commits of the Project files, Copy command and delete. It changes no settings file, and
   history holds only what Atlas has seen. `src-tauri/src/harness_scopes/history/`,
   `src/shared/lib/hook-history/`, `src/entities/hook-history/`,
   `src/widgets/harness-hook-history/`.
3. **Add and remove a hook:** templates, typed fields, Review, Undo.
   `src-tauri/src/harness_scopes/edits/`, `src/features/harness-hook-add/`,
   `tests/contract/desktop/agent-config-write-boundary.contract.test.ts`.
4. **Restore a version, bring back a hook:** `src-tauri/src/harness_scopes/restore/`,
   `src/features/harness-hook-restore/`.
5. **Edit and move:** `src-tauri/src/harness_scopes/moves/`,
   `src/features/harness-hook-move/`.
6. **One hook off and on (Claude Code):** the parked-file contract.
   `src-tauri/src/harness_scopes/parked/`, `src/features/harness-hook-switch/`.

## Acceptance criteria

1. **Slice 1, dogfood.** Given this repository connected in the installed app on the owner's Mac,
   when he opens Harness Setup, then the hook categories list the entries of all four files under
   four headings (22 in the project files, 25 in the User files on 2026-11-22), `scope.outside`
   says 25, and after he picks the settings file of the folder his sessions use, its 16 entries
   stand under a fifth heading and he can say which file one User hook is in. Checked: an
   installed-app walk with a capture, and `src-tauri/src/harness_scopes/tests.rs`.
2. **Slices 1 to 3, nothing secret leaves Rust.** Given fixture files with one planted string in
   `env`, `apiKeyHelper`, an `http` hook's address and header, a permission rule, an unknown key,
   a `[hooks.state]` header and a sibling `auth.json`, when every reader command runs, then the
   string is in no serialized record, error or log; a link in place of any file, and a `.claude`
   folder committed as a link to `../../.claude`, are both refused; a picked file of any other
   name, or inside another Git work tree, is refused; and the reader opens no path outside the
   constant table and the picked file. Given the string in `env` on the line beside a hook, then
   it is in no proposal diff, no version file and no writer log line, and no log line holds a
   command. Checked: `src-tauri/src/harness_scopes/tests.rs`, `history/tests.rs`,
   `edits/tests.rs`.
3. **Slice 1, paths.** Given the table in `tests/fixtures/harness-scope-files.json`, then each
   file resolves to the documented path on macOS, Linux and Windows, including the Local file of
   a linked worktree and a home folder with Hangul and a space. Checked: the same test on the
   macOS and Windows CI jobs; Windows is proven by CI only.
4. **Slice 1, the popup teaches.** Given three readers the owner brings, none of whom has opened
   an agent settings file: one who uses Claude Code every day, one who uses only Codex, and one
   who does not write code and has watched an agent work. When each reads the popup once, then
   each says what a hook is, names the file to put a hook in so teammates get it and the file so
   only they do, and says whether a Project hook replaces a User hook. The pull request names
   each reader by role and date with their answers word for word. Also: on the web the popup
   opens with `where.webNote` and no counts; at 1040x720 nothing is clipped. Checked: those three
   records, and `tests/e2e/harness-scopes.spec.ts`.
5. **Slice 1, findings.** Given one fixture per row of What Setup points out, then each draws its
   tag or line and no other. Checked: `src/entities/agent-scopes/model/scope-findings.test.ts`.
6. **Slice 3, one entry changes.** Given a settings file with unknown keys, an `env` block and its
   own indentation, when a hook is added or removed, then the entry written is the one Review
   showed and every other byte is unchanged. Checked: `src-tauri/src/harness_scopes/edits/tests.rs`.
7. **Slice 3, recovery.** Given a write, when the person presses Undo, then the file is byte for
   byte what it was, restored from the version saved before the write and from no other copy, and
   a file the write created is gone; given another key changed in between,
   then Undo reverses only the entry and keeps that change; given the entry itself changed, Undo
   writes nothing; given the file changed after Review, the write refuses and the typed text is
   still in the popup. Checked: the same tests, and an installed-app walk.
8. **Slice 3, the command boundary.** Given a vault document and a wiki page that each hold a
   script, rendered in the app, that calls the writer's propose command with a hook and then its
   confirm command with the proposal id it received, then no settings file changes and no version
   is recorded; given the same proposal confirmed by pressing **Write to {file}** in Review, then
   the file changes. Given an `AGENTS.md` that says to add a hook, then no field is prefilled and
   nothing is offered; and no MCP tool or ACP method reaches the writer. Checked:
   `tests/e2e/harness-hook-write-boundary.spec.ts` against the app's bridge, and
   `tests/contract/desktop/agent-config-write-boundary.contract.test.ts`.
9. **Slice 5, moves.** Given each pair of files, then only User to Project, User to Local and
   Local to or from Project are offered; in a linked worktree no move to or from Local is
   offered and a Local write's Review holds `review.worktreeLocal`; a move changes both files or
   neither when the second write fails; and no write sets `disableAllHooks`. Checked:
   `src-tauri/src/harness_scopes/moves/tests.rs`.
10. **Slice 6, off and on.** Given a hook turned off and on again, then the settings file is byte
    for byte what it was and its empty parked file is removed; a Project hook and a Local hook
    park in two different files; a Local hook whose parked file Git does not ignore is refused
    with `off.localNotIgnored` and nothing is written; and with a parked file present,
    `claude doctor` on the installed Claude Code reports no rejected entry. Checked:
    `src-tauri/src/harness_scopes/parked/tests.rs`, and a walk with its output in the PR.
11. **Slice 5, entries Atlas did not add.** Given a hook written in an editor, when the person
    presses Edit, then `edit.notAtlas` stands before the fields and Cancel leaves the file
    untouched; given a hook Atlas added, Edit opens the fields at once; given an entry whose
    command is Work status's helper, then it carries `tag.workStatus` and Edit, Move and Remove
    are absent. Checked: `src/features/harness-hook-move/edit-origin.test.tsx`, and
    `src-tauri/src/harness_scopes/moves/tests.rs`.
12. **Slice 2, recorded.** Given a settings file, when Atlas first reads it, when its hooks change
    on disk while the app is open, when two changes are made while the app is closed, and when
    only `env` changes, then there is one First seen version, one outside version within 5 s, one
    outside version at the next read, and none. Checked:
    `src-tauri/src/harness_scopes/history/tests.rs`.
13. **Slice 2, saves and separate histories.** Given `~/.claude/settings.json` and two picked
    `settings.json` files with different hooks, then each History lists only its own file's
    versions, and a picked file's versions are listed again after the app restarts and the file
    is picked again. Given a saved version and enough later changes to pass the store's limit,
    then the saved version is still listed under its name. Given a file with a planted string in
    `env`, a permission rule and `apiKeyHelper`, then no version this slice records holds it.
    Given Delete all history of one file, then the other files' versions remain. The store's own
    place, mode and limit are checked in `docs/specs/2026-11-22-work-status-criteria.md`. Checked:
    `src-tauri/src/harness_scopes/history/tests.rs`.
14. **Slice 2, a deleted hook is found.** Given the installed app open on the owner's Mac, when he
    adds a hook to a settings file in an editor, deletes it there a minute later, opens History,
    chooses Deleted hooks and types part of its command, then that hook is listed with when it
    was last in the file, and Copy command gives its command. Given three commits that changed a
    Project file in a temporary repository, then three Committed rows show their diffs. Checked:
    an installed-app walk with a capture, and `src/entities/hook-history/model/search.test.ts`.
15. **Slice 4, restore with recovery.** Given a version, when the person restores it, then Review
    shows the path and the diff; after the write the file's `hooks` value equals the version's
    byte for byte and every other key is unchanged; history holds the hooks from before and
    after; Undo returns the file byte for byte; Bring back adds exactly one entry; no other file
    is offered as a target; and a file changed after Review refuses the write. Checked:
    `src-tauri/src/harness_scopes/restore/tests.rs`, and an installed-app walk.

## Risks

1. **A person writes a hook without understanding that it runs code with their permissions on
   every event and can stop the agent.** Answer: `add.commandHint` and `add.blocks` sit beside the
   fields, Review shows the whole command, Codex still withholds it until reviewed, and criterion
   4 has to pass before slice 3 ships.
2. **Atlas claims more than a file proves, or a vendor changes a rule.** Answer: every sentence
   says what a file holds and what the vendor's page says the tool does with it, never that a hook
   ran; each combining rule is one catalogue key dated in Scope model; an unparsable file is never
   rewritten; `where.notRead` names what Atlas cannot see.
3. **A write damages a file that also holds permissions and `env`, or a read shows a secret.**
   Answer: the writer's version before each write and atomic replace, criteria 6, 7 and 15 on
   bytes, criteria 2 and 13 on a planted secret, a struct that cannot carry a field it does not
   name, and history that holds hooks only, in files only the person can read, with a delete the
   popup offers.

## Later

1. Codex's review state per hook, read from `[hooks.state]`; next when a probe shows what
   `trusted_hash` covers and that the format survives a Codex update.
2. Remembering a picked settings file across restarts; next when one is picked on three launches.
   One name saved and switched across several files; next when the owner saves two files under
   one name.
3. User files with no repository connected, which is also what the Windows app can show first;
   next when someone opens Harness before connecting.
4. Permission-rule text by scope, with its own record: rule text can hold a pasted token.
5. MCP servers in the popup, from the connector discovery Agents already runs.
6. A hook that needs a script file, such as blocking reads of secret files; next when slice 3's
   templates are used and a sixth write kind is decided.
7. Copying a hook to the twin tool, and editing skills, subagents and instruction files; next
   when a person asks after seeing `finding.toolGap`.
8. Names of the skills, subagents and instruction files in the home folder, with which one wins;
   needs its own record for a folder listing there; next when a person asks which skill a name
   runs. Turning all Claude Code hooks off for one project; next when it can be done without
   reaching every worktree.

## Owner question

None. Decided here, each reversible: the other files are read whenever Setup opens, and from
slice 2 watched while the app is open, with `scope.alsoRead` as the standing statement (reverse:
read on a press, and history records only then); a hook never moves from a
repository's file to User (reverse: a confirm whose default is Cancel); one hook is switched off
through a parked file beside its settings file (reverse: drop slice 6); a hook Work status added
is not edited or removed in Harness (reverse: offer Remove behind the same extra confirm as
Edit); a picked file is held until the app closes (reverse: Later 2); Git commits of a Project
file are listed beside the stored versions (reverse: drop the Committed rows).

## Decision record text (the lead runs `pnpm record:new`)

**Harness reads agent settings from every scope, keeps versions of their hooks and changes hooks in
the files it names.**

**Why**: The owner, 2026-11-22: project and global agent settings should be easy to choose and set
inside Atlas, explained in a popup, because most people do not know they exist; hook management
should be easy inside Atlas; and hooks should have versions he can save and switch between, after a
hook he made, forgot and deleted could not be recovered. Measured the same day on his Mac: the two
project files hold 22 hook entries and the two User files 25 more that Harness does not read; three
other settings folders his sessions use hold 16 each.
**Prior**: Extends `e35a25fe` (Harness reads only the connected repository's harness files) with
fixed files outside that repository, as a fourth exception in `.claude/rules/surfaces.md`. Extends
Record 3 in `docs/specs/2026-11-22-work-status-criteria.md`, which narrowly overturns "Atlas
never edits an agent's configuration", from Atlas's own status entries to hook entries a person
manages in Harness. Its writer gains two abilities under its seven rules: an entry already in one
of the files, or in a saved version of it, as a command source, copied in Rust and never sent by
the page; and a change to entries Atlas did not add. Record 3 also defines the hook version store;
this record adds callers to it and defines none of its place, content, access or limits. Applies
019004eb (Record restores one document behind a confirm that names what changes) to a settings
file's hooks. Keeps `c52ae218` (Setup follows the agent's loop; scope is a grouping inside it),
`3a63ada4` (only what files can prove), `e47518a9` (the two tools' trees stay independent),
2026-08-14 (11) (configured, trusted and running are different states), 2026-08-17 (37) and (59)
(no write through a link; atomic replace), `ffd59b03` (no MCP or CLI write authors agent files),
and `forbidden.md` (Atlas runs no third-party code: it writes a hook and never runs one).
**Decision**: In the installed app, Harness reads hook entries, two switches and permission-rule
counts from the User, Local, Managed and System settings files of Claude Code and Codex, by fixed
name or from a `settings.json` or `hooks.json` the person picked, into a struct that names each
returned field; never `env`, a helper, a header, an address, rule text, a credential file or a
folder listing. Every component of a path is opened without following a link, and a picked file
inside another Git work tree is refused. One popup explains each scope. On a person's press and
after a Review that shows the path and a diff of hook entry lines only, confirmed from that Review
for the proposal Rust issued, the shared writer changes one hook entry in
`~/.claude/settings.json`, the project's `.claude/settings.json`, the Local `settings.local.json`,
`~/.codex/hooks.json`, the project's `.codex/hooks.json` or a picked User file, with Undo. A
command comes only from a built-in template, typed text, an existing entry moved without widening
where it runs on this computer, or a saved version of the same file put back into that file. In a
linked worktree no hook moves to or from the Local file, which every worktree shares. Editing a
hook Atlas did not add takes one more confirm; a hook Work status added is removed only there. One
Claude Code hook is switched off by moving it to a parked file beside its settings file, one per
scope, and a Local hook only when Git ignores that file. Harness records a version of a listed
file's hooks into the store, one history per settings file, when it first sees the file, when the
hooks change outside Atlas (watched while the app is open, otherwise one version at the next
read), and when the person saves one under a name, which retention never removes. For the two
Project files it also lists the last 50 commits from Git. Restore and Bring back go through the
writer after Review and are themselves versions. Atlas never writes `config.toml`,
`~/.claude.json`, a managed file or `disableAllHooks`, never lists the home folder, and never
runs, trusts or reviews a hook. The log keeps an event and a hash, never a command. The web
explains and does neither.
**Dissent**: A hook command can itself hold a token and Atlas shows it. Reading the home folder on
arrival, without a press, is a wider habit than any earlier exception. A parked file is a file no
tool defines, placed in the person's `.claude` folders. The page can ask Rust to copy a command it
never typed, from a file a teammate or an agent wrote. Removing a Codex entry may undo reviews of
its neighbours, which is unproven until the probe before slice 3. History keeps a removed hook,
and any token in its command, on disk until the person deletes it. A watch reads home-folder files
while Harness is not on screen. Managing another product's settings moves Atlas further from a
codebase ontology, as Work status did.
**Falsifier**: The planted string in any record, log or error; a write to a file that is neither
one of the five nor one the person picked; a command written that no person typed, no template
holds and no listed file or version of it held; a write confirmed by anything but Atlas's own
Review step; a `disableAllHooks` Atlas wrote; a parked Local hook Git would commit; a hook that
reached User from a repository's file through Atlas; a settings file that differs outside its
hooks after a write; an Undo that loses a change the person made; a saved version retention
removed; one settings file's history listed under another; a hook removed while Atlas was open
that Deleted hooks cannot find; a restore into a file the version did not come from; three cold
readers who cannot say which file shares a hook with a team; a person who believes from Atlas's
words that a hook ran.

## Revisions

- 2026-11-22: first draft.
- 2026-11-22: aligned with the agent config writer's nine rules in the Work status revision: Undo
  reverses one entry when the file changed since, an organisation lock offers no button, and a
  settings file in another folder is read and written only after the person picks it.
- 2026-11-22: the owner asked for versions of hooks with a save, after losing a hook he had
  deleted. Added Hook history: versions per settings file in the app's local data folder, outside
  changes recorded, named saves, a History popup with search and Deleted hooks, Git commits for
  the Project files, restore through the writer. Slices renumbered: history is 2 and restore 4;
  the earlier 2, 3, 4 and 5 are now 3, 5, 6 and 7. Criteria 12 to 15 added.
- 2026-11-22: applied the lead's twelve decisions on the independent review. The writer is cited
  with its seven rules and no backup: its rule 4 saves into Hook history. An existing entry or a
  saved version is a command source that Rust copies. Deferred to Later: writing
  `disableAllHooks`, and the home-folder names of skills, subagents and instruction files (the
  earlier slice 7; six slices remain). Parked files are one per scope and a Local hook parks only
  when Git ignores its file. Links are refused at every path component; a diff, a version and a
  log hold hook entry lines only; a picked file inside another Git work tree is refused; a
  confirm counts only from Review for the proposal Rust issued. `finding.noTrust` and the
  trust boolean read from `~/.claude.json` are dropped. The popup orders scopes by reach and says
  what a hook is.
  Editing a hook Atlas did not add takes an extra confirm (criterion 11, replacing the names
  criterion); Work status's hooks are tagged; Codex removal needs a probe before slice 3.
- 2026-11-22: the lead moved the hook version store to the Work status spec, where the writer is
  built. This spec no longer defines its folder, file content, mode or limits and removed the
  comparison of places to keep versions; it keeps the recording of outside changes, named saves,
  the History popup, search, restore and the Git rows. History is one per settings file, a picked
  file included. Slice 2 now waits for Work status slice 5; criterion 13 is rewritten.
- 2026-11-22: the Work status spec renumbered its slices: the agent config writer and its version
  store are its slice 9, "Hook entries", optional there because Claude Code's own session list now
  carries the waiting state. References updated; this spec may build the writer first.
