---
id: 19077fe5-42e9-4826-89a6-ebd4c4204f9d
date: 2026-11-27
---
## 2026-11-27 — Workshop may send typed Claude Code messages, one at a time, to a model on this computer to list code requests Git never saw done

**Why**: The owner asked for missed requests to be found from session records by a local model overnight. His request to switch five agents to Opus was answered "changed" at 14:52 and reached Git at 23:50. Measured with his 27B model, asking Git only about code requests listed 4 old requests, 3 truly undone. Proof: `docs/specs/2026-11-27-missed-requests.md`.
**Prior**: Reuses the session-line rule of `4919ff56` without its provider send; an exception in `.claude/rules/surface-exceptions.md`. Keeps `e4505512` (loopback only) and `fd3d1a37`: rounds belong to a vault folder and run an agent; this belongs to a repository and a computer.
**Decision**: Runs only on Check now; a nightly run needs its own record. Reads typed text, time, ids and `gitBranch` of lines whose `cwd` is the checkout, under it by whole path parts, or a listed worktree; folders by real path, messages once by `uuid`; never agent text, tool fields or `subagents/`. Sends each message alone to the loopback runner of Agents › Models, pinned, no proxy, refusing a cloud or remote-marked model, after a bundled check with thresholds. Asks Git, through bge-m3, only about code requests 2 days old or more, against commits up to now. Stop cancels within 1 s. Results in app data; the run log reserves its line before sending. A Workshop header fact and dialog, no rail tab.
**Dissent**: The lead favoured Automations; the owner first imagined a tab and a nightly run. The labels are one person's 19 tasks. The measured minimum needs about 19 GB of memory.
**Falsifier**: A session byte beyond the named fields stored or sent; a request to a non-loopback host, through a proxy or to a cloud model; or after a month, Done elsewhere on more than one in three listed requests.
**Owner**: Stark
