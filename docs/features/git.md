---
title: Git
doc_type: feature
status: current
area: git
routes: [/git]
---

# Git

### `/git` — Git (primary desktop destination; redesigned 2026-07-27; named "Git" in both locales since 2026-09-19)

The rail tile (`navRail.git`), the page headline (`atlasGit.title`) and the tile's title (`atlasGit.tileTitle*`) say **Git** in Korean and English; until 2026-09-19 the Korean said the plain word for "record" and the English said "History". The owner asked why the screen hid the word: Atlas keeps no history of its own — durable history, restore and discard are git's — so the plain name is the honest one. Git's trademark policy (Software Freedom Conservancy, U.S. reg. 4680534) permits factual reference to the Git software and identifying it as a component of a product; only portmanteaus, implied affiliation and the logo need permission. Sentences that describe the act (`initButton`, `scopeNotice`, `stepStart`) keep their verb.

Architecture was added without replacing this destination. Git keeps its primary
desktop rail tile, uncommitted-change badge, `G G` shortcut, and contextual
change-review, snapshot, and history links.

**One sentence on what this screen does**: Verify what concept I changed and decide whether to leave it in one git commit. Therefore, the most prominent things on the screen are **the list of changed concepts and the "Leave" button** pair; everything else is either evidence for that judgment or merely the top/bottom borders of the screen.

The screen layout splits into two stages. First, **is this screen even in a state to do work** (`data-stage`) — if the browser can't run git or the vault hasn't been selected yet, it stops here. If it can work, it then splits by **whether there is something to decide now** (`data-shape`).

#### State where work cannot start yet (`web` · `no-vault` · `not-initialized` · `loading` · `error`)
- These states are all drawn in **the same size, same position** (`--git-setup-measure`
  one 520px cell, centered on screen). If the width changes per stage, users feel like they're jumping to different pages every time
- Shows what to do in one line: Open app → select folder → start recording.
  Registering a remote repository is optional so it's not included in this line. No additional menus or decorative links here
- In the browser, `Get App` is the primary button, and copying CLI commands for terminal use is secondary

#### State with uncommitted changes (`decide`)
- Left: the timeline — the "now" row for uncommitted changes, then the past steps. Clicking the "now" row opens the uncommitted changes on the right
- Right, **read as documents** (owner direction B, 2026-09-19 — "the design itself is poor", chosen from three sketched directions): one line of totals (`1 added · 2 edited`), then a chip per changed document named by its concept with its status mark and kind glyph (non-concept files such as `.gitignore` are chips too, in the file face, after the documents), then the chosen document **whole, in the reading face**, with the changed lines marked where they are — an added line on the success tint, a removed line on the danger tint and struck through, still readable. The leading `---` block is kept apart as the front matter box (`atlasGit.docReaderInfoBox`) in the mono face; headings and list items keep their shape. No `+`, no `-`, no terminal face for prose, no kind label over a single row, no header repeating the left row. The whole document comes from `git_document_diff` (the file with every line as context; an untracked file is all added lines); when that read is unavailable the hunk diff from `git_diff` is drawn instead and the header says so
- The document with changed lines opens by default; a newly created document opens on its own chip. The document's one destructive door, discard, sits at the foot of the document
- Bottom fixed bar (left column): Indigo-filled `Leave N items` button → confirmation step (editable commit title, whether to push, default off). Text explaining what is being recorded is also here — because files are actually written here
- The width for splitting into 2 columns is `xl` (1280). Making it 2 columns at 1024 compresses the list and cuts off concept names

#### State with nothing to leave (`recall`)
- Does not split into 2 columns. A single-screen view where **the previous commit list is the body** (`--git-single-measure`)
- What's in one commit line: how recent · simple summary (`Added 3 · Modified 2`) · author · short hash. Expanding shows full hash · ISO format time · **original commit title** (record needed for later tracking)
- The primary button position remains inactive (`All left`). If the button disappears entirely based on state, users have to figure out what to press next every time
- The list is one tab stop; arrows, Page Up/Down, Home and End move between its rows and Enter presses one (2026-09-19, the Library lists' roving hook). Doors that could only open on a refusal are not drawn: no restore door on a file the commit deleted, no discard door on a never-committed or renamed document.
- The list reads ten steps at a time and **ends with a fact, never a blank** (2026-09-19): while git holds older steps, the last row is `Show older steps` and fetches the next ten in place; once the first step is on screen, a quiet last line says so. Before this, ten were read and the column simply stopped, so a folder with forty steps kept thirty out of reach with nothing on screen to say it. The depth a person opened is remembered with the read, so returning to the folder keeps it
- **The rail's Record dot follows the folder too** (2026-09-19): it used to re-read only on mount and on window focus, so after a commit or a restore the Record screen could say "all committed" while the rail still showed the dot until the window lost and regained focus. It now also re-reads once per `vault-changed` the watcher reports (coalesced, still no polling).
- **The screen follows the folder while it is open** (2026-09-19): the app's file watcher already emits `vault-changed` for the loaded vault; this screen now listens and re-reads status, diff and history (read-only, debounced) so the count on the commit button and the preview line describe the folder as it is now, not as it was on arrival. While this screen is itself writing (a commit, `git init`, a remote action) the watcher's echo of that write is skipped because each of those paths re-reads when it finishes

#### Only simple language on screen
- Commit titles automatically created by Atlas (`ontology snapshot: +3 concepts, …`) are converted to human language when shown on screen. Conversely, manually written commits or those made by other tools are left as-is since the original text is already human language (`describeSnapshotSubject`). This holds in every place the title is drawn (2026-09-19): the row's third column says `automatic title · 1 edited` for such a step, since an automatic title carries no *why*, and the commit detail's headline is the same human wording with the raw title kept one line down as the audit trail. Until then the rule held only for rows without a concept to name; on the real screen, where the name column holds the concept, every automatic step read `ontology snapshot: ~1 u…`
- Git's internal notation (`diff --git` · `index <sha>..<sha>` ·
  `@@ -a,b +c,d @@`) is not exposed on screen. However, a dashed line is **left** for skipped sections — hiding the fact that it was skipped makes that diff a lie

#### Restoring one document (2026-09-19)
The screen's own copy had promised that earlier content can be brought back (`atlasGit.notInitializedHint`) while no restore existed. Now one Tauri command, `git_restore_file(vault, path, source)`, puts **exactly one document** back to its content at `source` with `git restore --source --worktree --staged -- <path>`, and two doors on screen open it:
- **Discard** (`source = HEAD`): on the chosen document in the uncommitted list, when it has ever been committed. The confirm says how many added and removed lines go away, that git holds no copy of them so this cannot be undone, and that the other N uncommitted documents stay as they are. A never-committed document gets no door, because discarding it would be deleting it; the Rust side refuses that too (`restore-untracked`).
- **Restore this version** (`source = <hash>`): in a commit's detail, under the file list for the active file, and in the default concept lens for the focused concept's own document. The door itself names the file it puts back (`Restore <path> to this version`, 2026-09-25), so which document it acts on is readable before it is pressed. The confirm names the document and the commit's time, says when the document's own uncommitted lines would go with it, that the result stays an uncommitted change the person can read line by line and discard, and which of the commit's other documents stay untouched.
- After a restore from a commit the screen shows the result: the "now" row is selected with that document chosen, so the restored lines are what the right column reads, the same rule as after a commit. After a discard the document simply leaves the list.
- The command refuses a path outside the vault (`restore-path-invalid`), a source without the document (`restore-source-missing`), and a source whose frontmatter identity differs from the file on disk in `uid`, `slug`, or by dropping `merged_uids` (`restore-identity-mismatch`), because neighbours link to the current identity and `git restore` is identity-blind. Every refusal on screen ends with the sentence that the document was not changed (`atlasGit.restoreFailedSafe`). Decision record: `docs/records/decisions/2026-09-19-record-screen-restores-one-document-*.md`.

#### One document's own timeline (2026-09-19)
A commit's detail lists **the other steps that changed the focused document** — under the restore door in the concept lens and under the file list in the files lens — read from `git_history` scoped to that path (its optional `path` argument, bounded to the vault like every path the screen hands back). Twelve are read plus one more, so the list can say when older steps exist. Pressing a row jumps to that step; when the step lies below the depth the list has read, the list reads on a page at a time until the row exists, then selects it and scrolls it into view. Before this, "when else did this concept change" meant scanning every row for the concept's name.

**The jump keeps the document** (2026-09-25). The step opens on the same document, in the lens it was read in — the same concept pressed, or the same file open — and that chip or row is brought into view. A step that deleted the document opens it in the files lens, where the missing restore door is explained. A step whose file list does not hold the document (git lists a merge that resolved a conflict in the document's history, but prints no files for a merge) says so in the reader and selects nothing in its place: no other document is chosen for the person, no restore door is drawn, and the document's own steps stay listed beneath. Only a press on another chip or file, or a plain press on a step in the list, moves the selection. Before this the jump cleared the focus, so the older step opened on its first document — the vault guide in a first commit — and the restore door beneath it put back `README.md` instead of the document being followed (found with the real-bridge QA harness on a real git vault).

#### What a step changed, read in its default lens (2026-09-25)
- "Concepts changed" counts concepts by the census rule (`isCanonicalConcept`): the vault README (`vault-readme`) is a file of the step, listed under "Files changed", never a concept chip, a row's name or a document's "other steps" title. A real vault's founding step read 99 over 98 concept documents. A kind the map does not draw (`document`, `vault-readme`, an unknown kind) wears the vault tree's page mark, never the element's glyph.
- The concepts lens reads what the step wrote in the focused concept's document, in the same whole-document reader as the files lens, under a "What it wrote" label between the concept's card and the document's other steps with the restore door. It used to draw the card and the history only; the change itself was one lens away.

#### Where the steps can go (2026-09-25)
The header's location line and the dock's last line say which of four states the branch is in, read from `git_status` without contacting any remote (`hasOrigin` comes from `git remote get-url origin`, plus `detached` and `headShortHash`):
- **Tracking** — the branch has an upstream: `main → origin/main` with Fetch, Pull and Push.
- **No remote** — no `origin` at all: "no remote repository yet" and the address form that registers one. This is the only state that form appears in; anywhere else it would have rewritten a real `origin` with `git remote set-url`, which is what it did before for every branch without an upstream.
- **Never sent** — `origin` exists and this branch was never pushed: the line says so and offers one press that sends the branch and records `origin/<branch>` as its upstream (`git_snapshot(push, setUpstream)` → `git push --set-upstream origin HEAD`). With uncommitted changes the press opens the commit confirm first, like Push, and its hint names the first send.
- **Detached HEAD** — a commit is checked out: the badge shows its short hash instead of `HEAD`, and both lines say sending needs a branch. No button.
A bridge that does not report `hasOrigin` is read as unknown, never as "no remote": the line says only that no destination is set, and offers nothing. Push with nothing to commit now sends the steps already recorded; before, `git_snapshot` returned before the push.

Registering a remote stores an address; only the first send creates the upstream Fetch, Pull and Push work from. The connect button stops reading "Connecting…" when git answers, and the header reads "never sent" from that same frame, before the status read lands. A remote action's result is announced with the screen it describes, and a first send's result takes the focus of the button that left. A save that was sent is said once ("Saved 1 and sent to …"); a failed send says git's reason.

#### Nothing is written until the user clicks
When the screen first opens, only read-only tools are called (`git_status` / `git_diff` / `git_history`). Tools that change something (`git_init` · `git_set_remote` · `git_snapshot` · `git_restore_file`) are executed only when the user presses their button (`onClick`).
