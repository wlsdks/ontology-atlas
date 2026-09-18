---
id: 5f741fdb-5ccf-46e7-8fde-e0cd86cae21a
date: 2026-09-18
---
## 2026-09-18 — The folder walk sees fifty thousand entries before it says it stopped

**Why**: the owner: a wiki piles up thousands of files in no time, plan for tens of thousands. `VAULT_WALK_MAX_ENTRIES` was 4,000 in both walkers, so the 3,000-file fixture sat just under it and a 12,000-file folder was mapped, indexed and counted as a folder it is not.
**Prior**: overturns the count of 2026-07-29, when picking the repository root as the folder killed the WebView (`src-tauri/target`: 984 directories, 9.4 MB across IPC) and 4,000 was set as roughly 20× a normal vault. Extends 2026-09-18 "Past four hundred marks the Library graph is a map of islands", whose dissent named this as the separate decision.
**Decision**: the ceiling is 50,000 entries in TS and Rust, held equal by `tests/contract/vault-walk-rules.contract.test.ts`. The truncation notice and the depth ceiling (12) stay. The tree that motivated 4,000 is pruned by `CACHEDIR.TAG`, which Cargo writes into `target/`, so the count no longer does that job.
**Dissent**: a larger ceiling admits a larger IPC payload and a larger manifest in memory before anyone says stop, and the 2026-07-29 crash was a size problem the count only stood in for. Kept as the falsifier rather than as the ceiling: a count cannot tell a 12,000-page wiki from a 12,000-file build tree, and the tree is what pruning by name and tag is for.
**Falsifier**: the installed app failing to open, or taking more than ten seconds to first paint, a folder of 12,000 ordinary documents (the `wiki-12k` fixture, measured the day of this decision). If that is observed the remedy is a streamed walk, not a lower count.
**Owner**: jinan
