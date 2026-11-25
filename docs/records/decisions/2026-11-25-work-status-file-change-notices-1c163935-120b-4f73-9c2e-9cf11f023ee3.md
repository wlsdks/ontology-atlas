---
id: 1c163935-120b-4f73-9c2e-9cf11f023ee3
date: 2026-11-25
---
## 2026-11-25 — Work status counts file changes in the repository's worktrees

**Why**: The owner, 2026-11-25, approved the file-change pulse. A room learns of an edit from a Git read every 15 s times the running worktrees (90 s for six), so "is it still writing" is answered late, and an edit made with no command is unseen until then.
**Prior**: Builds a narrowed form of Record 4 as drafted in `docs/specs/2026-11-22-work-status-criteria.md` and never recorded: no CPU beat, no Moving, Quiet or Stalled state, nothing while hidden. Keeps "visible only" of `docs/records/decisions/2026-11-21-work-status-destination-dac7de97-cd83-4c93-8b29-5fecd5db4389.md`.
**Decision**: macOS only, while Work status is visible and its Watch file changes switch (on by default) is on: Atlas takes the OS's file-change notices, through the `notify` crate the app already ships, for the folder of each worktree drawn as a room. A path under `.git` or a fixed list of dependency and build folder names is dropped first; Git, through `runner.rs`, says whether any other path is ignored, at most one call per worktree in 10 s, and an ignored path is not counted. Atlas keeps in memory, per worktree, the time of the last counted change and counts in 10-second steps for 60 minutes (99 at most). No file is opened; no name or path from a notice reaches the page, a log, a file or the network. A counted change flashes the room's light once and makes that worktree's Git read due.
**Dissent**: A person's own save counts like an agent's. A tool that writes only ignored files shows nothing. Counting stops while the screen is hidden, so the hour has gaps.
**Falsifier**: A file name from a notice in a payload, log or file; a count from `.git` or an ignored path; a file opened by this reader; a watcher alive while hidden or switched off; more than one Git call per worktree in 10 s.
**Owner**: Stark
