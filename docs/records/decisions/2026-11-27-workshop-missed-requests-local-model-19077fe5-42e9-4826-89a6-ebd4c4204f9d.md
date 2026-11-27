---
id: 19077fe5-42e9-4826-89a6-ebd4c4204f9d
date: 2026-11-27
---
## 2026-11-27 — Workshop may send typed Claude Code messages, one at a time, to a model on this computer to list code requests Git never saw done

**Why**: The owner asked for missed requests to be found from session records by a local model overnight. His request to switch five agents to Opus was answered "changed" at 14:52 and reached Git at 23:50. Measured with his 27B model, asking Git only about code requests listed 4 old requests, 3 truly undone. Proof: `docs/specs/2026-11-27-missed-requests.md`.
**Prior**: Reuses the session-line rule of `4919ff56` without its provider send; tenth exception in `.claude/rules/surfaces.md`. Keeps `e4505512` (loopback only) and `fd3d1a37`: this per-computer switch is no vault schedule, since `rounds.json` travels with the folder.
**Decision**: Off until Check now or the nightly switch. Reads typed text, time, ids and `gitBranch` of lines whose `cwd` is the checkout, under it or a listed worktree; never agent text, tool fields or `subagents/`. Sends each message alone to the loopback runner of Agents › Models, after the model passes a bundled check. Asks Git, through bge-m3, only about code requests 2 days old or more. Keeps results in app data only. Nightly runs need power and 10 idle minutes and stop on input; the runner's priority is never changed. A Workshop header fact and dialog, no rail tab.
**Dissent**: The lead favoured Automations; the owner first imagined a tab. The labels are one person's 19 tasks. The measured minimum needs about 19 GB of memory.
**Falsifier**: A session byte beyond the named fields stored or sent; a request to a non-loopback host; a run on battery or during input; or after a month, Done elsewhere on more than one in three listed requests.
**Owner**: Stark
