---
id: 6bb6462f-c424-47a3-ad0e-02735ad533c3
date: 2026-09-27
kind: process
status: reported
harness_area: rules-loading
---
**Observed**: a delegated agent on `fix/acp-chat-free-scroll` edited `src/**` in `/Users/jinan/side-project/ontology-atlas/.claude/worktrees/agent-a279390d8a2c2c7ae` while its session loaded rules from `/Users/jinan/orca/workspaces/ontology-atlas/main-5/.claude/rules/`; only the always-loaded `forbidden`, `git` and `local-first` appeared, never `architecture.md` (`paths: src/**`), so its comment rule was unseen. About 16 KB of history-narrating comments were written, and `pnpm checks:changed -- --run` failed only at step 13/17 (`pnpm test:contracts`, `source-comment-bytes`: src-features 44090 > 40098, src-widgets 139293 > 130431, tests-contract 4232 > 3825, tests-e2e 6796 > 3872).
**Cost**: one lost checks:changed round (12 passing steps, about 5 minutes) plus a rewrite pass of about 25 tool calls.
**Suspected cause**: path-scoped rule globs resolve against the session's project root, and a worktree outside that root never matches them, so every path-loaded rule is silent there.
**Proposed change**: skill: `/parallel-brief` tells a worktree agent to read the `.claude/rules/` files whose `paths` cover the areas it will edit before writing, because they do not load outside the project root.
