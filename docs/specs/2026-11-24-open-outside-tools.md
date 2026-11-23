---
title: Open the editor, a terminal or the pull request in one press
doc_type: spec
status: draft
area: desktop
date: 2026-11-24
decisions: []
---

# Open the editor, a terminal or the pull request in one press

Split on 2026-11-24 from `docs/specs/2026-11-23-review-agent-work-by-meaning.md`, where it was the
third ability in the owner's priority: Atlas is where a person judges, development happens
elsewhere, and the way out should cost one press. It is the only part of that work that changes a
standing rule, so it carries its own decision record and reviewer. No capture of this moment
exists; criterion 1 makes one.

## Person and moment

A developer who already runs coding agents, each in its own Git worktree. A waiting room in Work
status says to answer in the terminal or app where the session runs
(`docs/features/work-status.md:109-110`) and offers Copy folder path
(`docs/features/work-status.md:297-298`). He copies the path, finds or opens a terminal window,
changes folder, and does the same again for the editor when he wants to read a patch. From the
code reader of `docs/specs/2026-11-24-read-code-in-place.md` he wants the same file at the same
line in his editor.

## Today

- **Atlas reveals and never launches**: `src-tauri/src/library/reveal.rs:43`, the reveal row of
  `.claude/rules/surfaces.md:55`, decision 2026-08-17 (33) (`docs/DECISIONS.md:2705`), and the test
  that the WebView holds no opener permission (`src-tauri/src/app_shell/mod.rs:229-235`).
- **`open_external_url` passes only `http` and `https`**, because any other scheme could open
  arbitrary things (`src-tauri/src/app_shell/mod.rs:20-26,64-69`).
- **Planned and not built**: Work status slice 6 plans Open in editor and Open in terminal with a
  chooser (`docs/specs/2026-11-21-work-status-destination.md:964-968`), and says a new window is
  not the agent's own session (`docs/specs/2026-11-21-work-status-destination.md:78`). Its Record 6
  is drafted (`docs/specs/2026-11-22-work-status-criteria.md:424-440`) and no fragment records it.
- **Atlas never drives a terminal** (`docs/specs/2026-11-22-work-status-coordination.md:160`).
- **On the owner's Mac** (Spotlight metadata, 2026-11-24): Visual Studio Code, IntelliJ IDEA,
  Xcode, Sublime Text, Android Studio, Terminal and iTerm are installed. Cursor, Zed, Ghostty and
  Warp are not.
- **The copy exists**: `messages/{en,ko,ja,zh}/openIn.json`, written 2026-11-24 and read by no
  code yet.
- **Unknown**: how each editor answers its documented file-at-line form; what each does with a
  folder it has not been told to trust; how an application is found by identifier on Windows and
  Linux.

## Problem and alternatives

Atlas knows the folder, the file and the line, and hands over a string. The person does the
opening by hand, several times a day per room.

| Way | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo: Copy folder path | the path | paste, change folder, find the window | none | holds | loses: it is the hunt the owner named |
| Ask the OS to open the path with its default application | one press | opens whatever the file's kind is bound to | one call | a file's default can be a program that runs it | rejected: decision 2026-08-17 (33) exists because of it |
| An editor's own address scheme through `open_external_url` | one press, with the line | good where the scheme is registered | widens the allow-list beyond `http` and `https` | any registered scheme becomes reachable from the page | rejected: the allow-list is the guard |
| **A closed list of applications, found by identifier, opened by Rust on one checked folder or one file and line** | one press to the place | names the application before the press | three fixed calls | starts only a program the person already uses, with no argument of the page's making | chosen |

**What changes for someone who uses the room panel today.** Copy folder path stays where it is;
the buttons stand beside it.

### Decisions

1. **Three fixed openers, in Rust**: a listed worktree's folder in an editor, the same folder in
   a terminal, one file at one line in an editor. Nothing else is opened.
2. **The applications are a closed list.** An application joins it only after an installed-app
   walk shows each of its forms lands. The first list is what the owner's Mac can walk: Visual
   Studio Code, IntelliJ IDEA, Terminal, iTerm.
3. **Opening a terminal opens a new window in the folder.** Atlas does not know which tab holds
   the session; the help sentence says so. Nothing is typed, pasted or run.
4. **The pull request is a search in the browser** until Work status knows its number:
   `https://github.com/<owner>/<repo>/pulls?q=is%3Apr+head%3A<branch>`, offered only when the
   repository's host is exactly `github.com`, through `open_external_url`.
5. **macOS first.** Windows and Linux show the path, Copy and their file manager's reveal, and say
   so (`openIn.otherSystem`).
6. **Where they stand**: the Folder section of the room panel's Git tab (folder in editor, folder
   in terminal, pull request), and the foot of the code reader (file at line) once that reader is
   built. The chooser is a menu above its button naming the applications found; the choice is a
   display preference kept on this Mac (`.claude/rules/surfaces.md:158`), never in the folder.

## Flow

1. When the room panel's Git tab opens, Atlas asks which listed applications are installed and
   names the one it will open on each button; with several and no choice yet, the button reads
   **Open in editor** and its first press opens the chooser.
2. When the person presses **Open in {app}**, Rust checks the folder again and asks the OS for
   that one thing; the button's words change to `openIn.opened` for two seconds.
3. When the person presses **Open in terminal**, a new window of that terminal opens in the
   folder, and the help sentence has already said the session stays where it runs.
4. When the person presses **Find its pull request on GitHub**, the browser opens the search.
5. When the folder is gone, is a link, is an application bundle, or the application was removed,
   Rust refuses, a toast says what was not opened and why, and nothing starts.
6. When no listed application is installed, the button's place holds `openIn.none.*` with Copy
   path.

## States

| State | Web | macOS app |
|---|---|---|
| Empty: no listed application installed | not drawn: a browser cannot start an application | `none.editor`, `none.terminal`, each with Copy path |
| Loading | not drawn | the buttons hold their place and width while the installed list is read, at most once per panel open |
| One found | not drawn | `named` with `help.folder`, `help.file` or `help.terminal` |
| Several found, none chosen | not drawn | `editor` or `terminal`; the press opens the chooser (`choose.*`) |
| Chosen | not drawn | `named`, with `change` in the menu |
| Opened | not drawn | `opened` for two seconds, then the button's own words |
| Error: refused | not drawn | toast `refused` with one `reason.*`; the button stays |
| Partial: the host is not `github.com` | not drawn | the pull-request button is not drawn; the others are |
| Windows and Linux | not drawn | `otherSystem` with Copy path |
| Offline | not drawn | the same as online; only the browser page a pull-request press opens needs a connection, and the browser says so |
| Largest measured: 34 worktrees | not drawn | one panel is open at a time; the installed list is read for that panel only |

## What leaves the machine

Nothing from Atlas. **Find its pull request on GitHub** opens the person's browser at a
github.com address holding the owner, repository and branch names; the browser sends that
request, and the help sentence says so before the press. An opened editor or terminal is the
person's own program. No row is added to `src/widgets/app-settings-menu/model/outbound-paths.ts`.

## Security

The page sends an opener four things: a worktree id Atlas listed (or "the open folder's connected
code"), an application identifier, a repository-relative path, a line number. It never sends an
absolute path, a command, a flag or an address.

- **Rust resolves the root itself**: a listed worktree, checked again, or the vault's one recorded
  binding inside its grant, never a path the page sends (the rule Harness reads follow,
  `.claude/rules/surfaces.md:87`, decision e35a25fe).
- **The path** must be relative with no `..`, no control character and no segment starting with
  `-` (the shape of `isPersistableRelativePath`, `mcp/src/meaning/source-range-citation.mjs:16`);
  each component is opened without following a link; a file opener needs a regular file, a folder
  opener a real directory that is not an application bundle (decision 2026-08-17 (33)).
- **The line** is an integer from 1 to 9,999,999. **The application** is found by its identifier
  in the OS's own registry (on macOS, Launch Services by bundle identifier) when the surface
  opens: no `PATH`, no disk search, no network, and the application is not started to find it.
- **Rust builds the one OS call**, with no shell; one launch per press and at most one a second.
  The WebView still holds no opener permission.
- **What vault text can do**: a `path:` or a cite chooses which existing file inside the connected
  code folder the editor opens, and at which line. Nothing else.
- **What agent text can do**: branch names and file names are drawn as plain text and pass the
  same path check. They cannot choose an application, add an argument or reach outside the folder.

## Copy

The words are in `messages/{en,ko,ja,zh}/openIn.json`; this revision changes none.

| Key | Where it appears | English |
|---|---|---|
| `openIn.editor` / `.terminal` / `.named` / `.change` | Buttons | Open in editor / Open in terminal / Open in {app} / Change application |
| `.choose.editor` / `.terminal` | Chooser | Choose the editor Atlas opens. You can change it here later. / Choose the terminal Atlas opens. You can change it here later. |
| `.help.folder` / `.file` | Button help | Opens {folder} in {app}. / Opens {path} at line {line} in {app}. |
| `.help.terminal` | Button help | Opens a new {app} window in {folder}. Atlas types nothing into it, and the session stays in the window it runs in. |
| `.opened` / `.refused` | Button / toast | Opened in {app} / {target} was not opened: {reason} Nothing was started. |
| `.reason.gone` / `.notFolder` / `.notFile` / `.outside` | Inside `refused` | It is no longer there. / It is not a folder. / It is not a file. / It is outside the folder Atlas was given. |
| `.reason.appMissing` | Inside `refused` | {app} is no longer installed. Press Change application. |
| `.none.editor` / `.terminal` | In place of the button | No editor Atlas can open was found on this Mac. Copy the path to open it yourself. / No terminal Atlas can open was found on this Mac. Copy the folder path to open it yourself. |
| `.otherSystem` | Windows and Linux | Atlas opens editors and terminals on macOS only. Copy the path to open it yourself. |
| `.pullRequest` / `.pullRequestHelp` | Room panel, Git tab | Find its pull request on GitHub / Opens github.com in your browser and searches {repo} for pull requests from {branch}. Your browser sends that request. Atlas sends nothing. |

## Edge cases

- **Zero, one, most**: no listed application is `none.*`; one is named on the button; four found
  are four rows in the chooser; 34 worktrees read the installed list once per open panel.
- **First run**: no editor chosen and one found, the button names it; several found, the first
  press opens the chooser and the second opens the folder.
- **Hangul**: a folder or file name with Hangul reaches the application as it is on disk; a branch
  name with Hangul is percent-encoded in the pull-request address.
- **Moved, renamed, unreadable**: a worktree folder that is gone is `reason.gone`; a folder
  replaced by a link or an application bundle is `reason.notFolder`; a chosen application that was
  removed is `reason.appMissing` and the chooser opens on the next press.
- **Two presses at once**: a second press within a second does nothing and says nothing.
- **Offline**: every opener works; the browser reports its own page.

## Out of scope

- **A terminal or an editor inside Atlas**: the owner's rejection in the review spec stands.
- **Landing in the session's own tab or window**: Atlas does not know it (Later 1).
- **Typing, pasting or running anything in the opened window**: Record 2 of the coordination spec.
- **Opening a workspace, a project file or a diff view**: each is a second argument, which the
  record's falsifier forbids.
- **Approving, merging or commenting on a pull request**: Atlas writes nothing to GitHub.
- **Windows and Linux**: no person can walk them yet (Later 3).

## The decision record and its reviewer

This is a one-way change: **Atlas starts another application.** It needs one record, written with
`pnpm record:new` before the build merges and listed in this file's `decisions:` by the lead.

- **Title**: Atlas opens a listed folder, or one file at one line, in an application from a
  closed list.
- **Prior**: narrows "reveal, never launch" (decision 2026-08-17 (33) and the reveal row of
  `.claude/rules/surfaces.md:55`) for these three calls, as a written exception in that rule
  file; keeps the WebView without an opener permission and "Atlas never drives a terminal". It
  replaces the drafted Record 6 of `docs/specs/2026-11-22-work-status-criteria.md:424-440`, which
  allowed a folder only.
- **Falsifier**: any program started that is not on the list, or on a path that is not a listed
  worktree or the connected code folder; an argument beyond the folder, or the one file and line;
  a launch with no press; an opener permission granted to the WebView.
- **Dissent to keep**: every launch is a way to run something; the list will lag behind the
  editors people use; a new terminal window is not the tab the agent runs in.
- **Reviewer**: one `reviewer`, independent of the builder, reads the Rust opener, its tests and
  the record against the Security section before the pull request is marked ready. The opener's
  path and argument handling is a security decision, so it lands only after that review.

Build order: the opener and its tests, then the Git tab's buttons, then the reader's foot.
`src-tauri/src/open_app/`, `src/shared/lib/desktop-shell/tauri-open-app.ts`,
`src/features/open-in/`, the exception in `.claude/rules/surfaces.md`,
`docs/features/work-status.md`.

## Acceptance criteria

1. **The capture, first.** Given the owner's Mac, when each of the four applications is asked by
   hand for a folder, and each editor for a file at a line, in a folder it has and has not been
   told to trust, then the pull request states for each form what opened, at which line, and what
   it asked the person. An application whose form does not land leaves the list before any button
   is drawn. Checked: the probe's notes in the first pull request.
2. **An opener cannot be turned.** Given a worktree id Atlas did not list, a folder replaced by a
   link or by `Evil.app`, a path with `..`, a leading `-`, a newline, `?` or `#`, a line of 0 and
   of 10^12, an identifier outside the list and a `code` planted first on `PATH`, then nothing
   starts and each refusal names its reason; a valid press spawns exactly one OS call; a
   `.code-workspace` file opens as text or is refused, never as a workspace; the WebView still
   holds no opener permission. Checked: `src-tauri/src/open_app/tests.rs`,
   `the_webview_gets_no_opener_permission`.
3. **Every state shows its words.** Given a stubbed bridge answering none, one, four and refused,
   then each row of States shows its key, the buttons keep their place and width while the list
   is read, `opened` returns to the button's words after two seconds with no frame interval above
   50 ms, and a second press within a second starts nothing. Checked:
   `tests/e2e/work-status-open-in.spec.ts`; `pnpm ui:look` at 1040, 1512 and 1920.
4. **The web and the other systems draw no opener.** Given the web build and a Windows build, then
   no opener button is drawn, and Windows shows `otherSystem` with Copy path. Checked:
   `tests/e2e/web-surface-smoke.spec.ts`, `src/features/open-in/model/open-in-availability.test.ts`.
5. **The walk, which is the recovery proof.** On the owner's Mac, in a rebuilt installed app with
   at least three agent worktrees: Open in editor lands Visual Studio Code and IntelliJ IDEA on
   the folder, and from the reader on the cited line; Open in terminal opens Terminal and iTerm
   in the folder with nothing typed; the pull-request press opens the browser on the search; a
   folder removed by hand is refused with its reason. Then for one working day the owner notes
   each time he leaves Atlas and why: no note says "to find the folder". Checked: the walk's
   recording and the day's notes in the pull request.

## Risks

1. **A launch runs something.** An editor may run a folder's tasks, or treat a file as a project.
   Design: a real directory or a regular file only, no second argument, never a workspace file as
   a workspace. Probe: criterion 1 in an untrusted folder, and criterion 2.
2. **The list lags behind the editors people use.** Cursor, Zed, Ghostty and Warp are not on the
   Mac that can walk them. Design: `none.*` and Copy path keep the old way whole. Probe: the
   first report naming an application; it joins by Later 2.
3. **A new terminal window is not where the agent runs, so he still hunts.** Design: the help
   sentence says it before the press. Probe: in criterion 5's notes, count "could not find the
   tab"; any makes Later 1 next.

## Later

1. Bring the session's own terminal window forward (Work status Later 10), with its own decision
   record. Next when a day note says "could not find the tab".
2. More applications on the list (Cursor, Zed, Xcode, Sublime Text, Android Studio, Ghostty,
   Warp), each after its walk on a Mac that has it.
3. The openers on Windows and Linux. Next when a person can walk them there; until then only CI
   would run that code.
4. Open pull request #N in place of the search, once Work status knows the number.

## Owner question

None. Starting another application is the lead's decision to record, with the falsifier above;
the first list (decision 2) and the new terminal window (decision 3) reverse by Later 2 and
Later 1. It spends no money, publishes nothing, and sends nothing from Atlas.

## Revisions

- 2026-11-24: split from `docs/specs/2026-11-23-review-agent-work-by-meaning.md` for length and
  because it alone needs a decision record: that spec's former decisions 9 to 11, the opener half
  of its decision 12, slice 3, the opener rules of its Security section, criterion 5 and the
  opener steps of its walk, unchanged in content. New here: the alternatives table, the capture
  of criterion 1, the record's title, prior, falsifier and reviewer, and the states for reading
  the installed list.
