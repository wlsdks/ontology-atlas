---
id: e4505512-1cda-4ee3-a8b2-285b9e972802
date: 2026-11-19
---
## 2026-11-19 — Search by meaning gets vectors only on this computer

**Why**: owner, 2026-11-19: vector search now, safe, one press, no Ollama required. ACP has no embeddings method. Measured via Ollama on the M2 Max, contended: bge-m3 10–18 passages/s (92–167 min at 50k files), qwen3-embedding:0.6b 10/s; queries 41–63 ms.
**Prior**: extends 183a2c12 (derived index, opened only by the app); keeps (52) (audit line before send, Windows fail-closed) and 2026-08-01 "a door, not a vendor" (OpenAI-compatible `/v1/embeddings`), narrowed to loopback.
**Decision**: two sources. (1) Default once shipped: a built-in model run in-process by a pure-Rust or ONNX runtime chosen by measured size; MIT or Apache-2.0 with licence and NOTICE in the licence screen; downloaded on first press from a pinned Hugging Face revision, SHA-256 verified, kept in app data, one-button delete; its host is a new outbound row. (2) A runner on `localhost`, `127.0.0.0/8` or `::1`, checked in Rust for http and https, `localhost` pinned to loopback, no proxy, no redirect. An Ollama pull (bge-m3, qwen3-embedding:0.6b only) is an outbound row sending no folder content. Audit: `embed-build` start and closing lines, one `embed-query` per press. Vectors: `vectors.sqlite` beside `search.sqlite`, derived. No vector MCP server (second store, second install, text outside the audit log). No sqlite-vec: brute force is 2.5 ms int8 at 50k.
**Dissent**: remote runners and keys are deferred: they send the whole folder.
**Falsifier**: recall@8 gain <15 points, <30 cross-language, or exact-term loss >2; 50k files >60 min; vectors >0.6 × text; query p95 >300 ms; app +25 MB steady or +64 MB peak; built-in runtime >30 MB in the installer; any non-loopback request or unlogged send.
**Owner**: Stark
