---
id: 6c23eb39-bd18-4b1e-b0ed-239da03f2e31
date: 2026-10-01
---
## 2026-10-01 — Admit one hundred thousand tracked folder entries with bounded reads

**Why**: the owner requested 10,000–100,000-record qualification; the current 50,000-entry walk truncates that input before the graph can be evaluated. Synthetic 100,000-node model probes and explicit walk-boundary tests are recorded in scratch; installed-app opening time remains unmeasured.
**Prior**: overturns only the entry count in 2026-09-18 decision 5f741fdb-5ccf-46e7-8fde-e0cd86cae21a; preserves its pruning, depth bound and reported truncation. Keeps 2026-09-28 decision 43d4b4cc-237e-469c-b4e0-eda8eb53ed8c: no graph database or second canonical store.
**Decision**: web and Rust walks admit 100,000 tracked entries, then report truncation; web metadata reads use the existing 16-read pool. Treat capacity, model work, transport cost and interactive frame time as separate measurements.
**Dissent**: more entries increase manifest and IPC memory. A count is not a byte budget, and the synthetic input does not qualify every user's folder or the installed app.
**Falsifier**: failure to open or more than ten seconds to first paint the prior 12,000-document installed-app fixture reopens streaming and worker transport; a heap failure or missing entry in the 100,000-entry boundary probes blocks this change.
**Owner**: jinan
