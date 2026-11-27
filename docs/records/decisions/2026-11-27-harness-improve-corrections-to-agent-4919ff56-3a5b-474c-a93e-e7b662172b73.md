---
id: 4919ff56-3a5b-474c-a93e-e7b662172b73
date: 2026-11-27
---
## 2026-11-27 — Harness Improve may send this repository's typed session messages to the person's own agent to propose rules

**Why**: The owner wants self-improvement felt from the first release and delegated how. Repeated corrections are the strongest signal for a rule, but 274 sessions here held only 16 interrupts or rejections, so finding them needs a model. Proof: `docs/specs/2026-11-27-harness-self-improvement.md`, slice 2, criteria 8-12.
**Prior**: Continues `d73dd377`; the eighth exception in `.claude/rules/surfaces.md`. The agent's provider traffic is outside `.ontology-atlas/llm-audit.jsonl`. Keeps (92): no permission is auto-allowed.
**Decision**: Off until switched on. Reads session lines whose `cwd` is the main checkout or a listed worktree (30 days, at most 400 files): typed text only (not meta, sidechain, compact summary or a wrapper tag), a tool call's name and `file_path`, the interrupt or rejection marker. The run pauses on Send with every message shown; only an id and the text leave, at most 300 of 600 characters, after a log line with the request's SHA-256. The agent runs with no MCP server, in a fresh config folder deleted after the run, and every permission is answered `reject_once`. Atlas drops proposals failing its text checks; the person's Keep is the final gate.
**Dissent**: The messages go out again under the account the agent uses in Atlas, which may differ from the session's own, for Codex a second provider; paraphrased planted text passes the copy check.
**Falsifier**: A session byte beyond the named fields sent or logged; a send before the person presses Send or without its log line; a tool call allowed in the session.
**Owner**: Stark
