---
id: cab0d7e4-b0d1-4a45-954e-c75964128267
date: 2026-10-10
---
## 2026-10-10 — Retire the backlog task-status store

**Why**: The owner retired it on 2026-10-10. Its 86 records were written and read only by agents, with five writes after 2026-09-14, and it conflicts with the 2026-10-09 rule against agent-only records.
**Prior**: Overturns record 0121dbf8-9041-4cea-8876-17c272b6010f ("Append independent backlog observations and limit speculative CI", 2026-09-13).
**Decision**: Delete docs/BACKLOG.md, its 2026-09-13 snapshot, docs/records/backlog/ and pnpm backlog. Task status lives in open pull requests, branches and commit history.
**Dissent**: Parallel worktrees lose one shared place to see which track is in progress. Open draft pull requests (gh pr list) carry that now.
**Falsifier**: Two agents start the same track in parallel without noticing, or the owner asks for a track's status that pull requests cannot answer.
**Owner**: Repository owner, ordered on 2026-10-10.
