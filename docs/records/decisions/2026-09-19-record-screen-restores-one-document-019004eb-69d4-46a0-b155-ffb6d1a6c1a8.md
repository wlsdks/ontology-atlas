---
id: 019004eb-69d4-46a0-b155-ffb6d1a6c1a8
date: 2026-09-19
---
## 2026-09-19 — The Record screen restores one document behind a confirm that names what is lost

**Why**: the Record screen's own copy (`atlasGit.notInitializedHint`) promises that earlier content can be brought back once git is connected, yet `src-tauri/src/git.rs` held eleven git commands and no restore; a person who saw an agent's bad edit on screen had to leave for a terminal. The owner asked for the next slice on this screen to be simple, powerful and trustworthy.
**Prior**: extends the owner ruling cited in `AtlasGitPanel.tsx` (2026-07-25) that a person pressing a button in a folder they chose is not automatic execution; keeps 2026-08-13 "The boundary between the MCP production gate and ontology meaning judgment": this command is app-only and never joins the MCP or ACP surface without its own record.
**Decision**: one Tauri command `git_restore_file(vault, path, source)` touches exactly the named path with `git restore --source --worktree --staged`; it refuses a path outside the vault, a never-committed file against HEAD, a source without the file, and a source whose `uid`, `slug` or `merged_uids` differs from the file on disk. Two doors on screen with different confirms: discard (says the lines are unrecoverable) and restore-from-commit (says the result stays uncommitted and reversible); both name the untouched documents that remain; nothing runs before the confirm click.
**Dissent**: the identity guard is ontology logic inside a git command; a plainer reading is "restore is a text revert, then let vault validation catch it". Kept as the falsifier, not the design, because a post-restore validation line arrives after the links are already broken.
**Falsifier**: a person restores a pre-merge revision, sees no refusal, and the map still resolves every link: then the guard is overbuilt and becomes a post-restore validation line. Also: in the first walkthrough a person who restores one file of a two-file commit can state what remains without re-reading the list: then the residue line is noise.
**Owner**: jinan
