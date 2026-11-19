---
id: e4505512-1cda-4ee3-a8b2-285b9e972802
date: 2026-11-19
---
## 2026-11-19 — Search by meaning gets vectors only on this computer

**Why**: owner, 2026-11-19: vector search now, safe, one press. ACP has no embeddings method. Via Ollama on the M2 Max, contended: bge-m3 10–18 passages/s (92–167 min at 50k files), qwen3-embedding:0.6b 10/s; queries 41–63 ms.
**Prior**: extends 183a2c12 (derived index, app-only); keeps (52) (line before send) and lifts its Windows refusal with handle checks; narrows 2026-08-01 "a door, not a vendor" to loopback.
**Decision**: two local sources: a built-in model, or a runner on `localhost`, `127.0.0.0/8` or `::1`, checked in Rust for http and https, `localhost` pinned, no proxy or redirect. Audit: `embed-build` start and closing lines, one `embed-query` per press, `model-download` start and closing lines (host, model, revision, bytes; no folder content). Vectors: derived `vectors.sqlite` beside `search.sqlite`. No vector MCP server (second store and install, text outside the log); no sqlite-vec (brute force 2.5 ms int8 at 50k).
**Dissent**: remote runners and keys are deferred: they send the whole folder. Ollama cloud models (`:cloud`, `remote_host`) forward text off the machine and are refused, so someone with only a cloud embedding model gets none.
**Falsifier**: recall@8 gain under 15 points, under 30 cross-language, or exact-term loss over 2; 50k files over 60 min; vectors over 0.6 × text; query p95 over 300 ms; app +25 MB steady or +64 MB peak; any non-loopback request or unlogged send.
**Owner**: Stark
