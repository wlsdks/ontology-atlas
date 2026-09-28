---
id: 43d4b4cc-237e-469c-b4e0-eda8eb53ed8c
date: 2026-09-28
---
## 2026-09-28 — Large wikis scale without a graph database

**Why**: owner, 2026-09-27, asked whether a wiki of up to hundreds of thousands of pages needs a graph database. The study on `bf64f1c41` found every first break in parsing, whole-vault re-reads and walk ceilings, none in graph traversal; the concept graph stays small beside the page corpus.
**Prior**: keeps `.claude/rules/local-first.md` "no second canonical store".
**Decision**: no graph database or new store. Scale by algorithmic fixes first. A derived SQLite index in the OS cache directory (never in the vault, stamp-checked, deletable without loss) is approved only if those fixes miss the exit test on a 100,000-note wiki: app open ≤ 10 s and ≤ 1 GB heap; MCP first call ≤ 5 s, later ≤ 1 s p95. It then gets its own fragment.
**Dissent**: a graph database indexes traversal at any size, but it adds a native dependency and a second truth to a Markdown-first product.
**Falsifier**: a missed exit number starts the index; in-memory path, backlinks or neighbours over 1 s p95 reopens the graph-database question.
**Owner**: Stark
