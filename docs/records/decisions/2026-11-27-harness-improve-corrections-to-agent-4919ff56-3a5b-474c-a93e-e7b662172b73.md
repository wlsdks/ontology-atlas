---
id: 4919ff56-3a5b-474c-a93e-e7b662172b73
date: 2026-11-27
---
## 2026-11-27 — Harness Improve may send this repository's typed session messages to the person's own agent to propose rules

**Why**: The owner wants self-improvement felt from the first release and delegated how. A correction repeated across sessions is the strongest signal for a rule, but 274 sessions here held only 16 interrupts or rejections against about 1,100 typed messages, so finding corrections needs a model. Proof: `docs/specs/2026-11-27-harness-self-improvement.md`, slice 2, criteria 8-12.
**Prior**: Continues the run of `d73dd377`; adds the eighth exception in `.claude/rules/surfaces.md`. The agent's provider traffic is outside `.ontology-atlas/llm-audit.jsonl`, and the screen says so. Keeps `ffd59b03` and (92): the agent writes nothing and every permission request is answered `reject_once`.
**Decision**: Off until switched on, naming agent and provider. Reads this repository's session files (main checkout and listed worktrees, 30 days, at most 400), keeping only typed text, a tool call's name and `file_path`, and the interrupt or rejection marker. Sends at most 300 messages typed right after a tool call, 600 characters each, secret-shaped lines removed, after logging the send with its SHA-256 in app data, to the agent in an empty folder. Atlas drops a proposal resting on fewer than two sessions, holding a URL, backtick, command or eight copied words, or naming an unlisted target. A kept rule is a new memory note or one line appended to `AGENTS.md`, `CLAUDE.md` or an existing `.claude/rules/*.md`, with the version and undo of `d73dd377`.
**Dissent**: Typed messages go out again, for Codex to a second provider; planted text can steer the grouping, though each line still needs a Keep.
**Falsifier**: A session byte beyond the named fields in a request, page or log; a send without a log line first; a kept rule repeating eight session words or holding a command or link; a tool call allowed in the session.
**Owner**: Stark
