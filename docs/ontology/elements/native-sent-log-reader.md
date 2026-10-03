---
uid: 938f4ff2-057d-4377-b8fe-6f15d251127f
slug: elements/native-sent-log-reader
kind: element
title: Native sent-log reader
domain: domains/agent-access
path: src-tauri/src/audit_read.rs
created_by: "agent:codex-mcp-client"
---

Reads the granted vault's fixed `.ontology-atlas/llm-audit.jsonl` path in raw chunks for the Models sent-log count and five recent records.

The native module reserves a caller-owned slot before file I/O, validates the opened file and current path generation around pulls and completion, and closes on terminal paths or lease expiry. Four slots bound executing source reads; responses retained by Tauri or the browser are outside that allocation bound. Source changes, failed access and expired reads are unavailable with Retry rather than fresh zero or partial evidence.

The renderer keeps the existing JSONL admission and normalization contract and publishes count and tail only after completion. This reader does not change transfer approval, acquire the writer lock, write audit history, archive records or delete data. The bounded native path uses Unix identity metadata. Other native platforms explicitly retain the existing file transport; failed bounded reads never switch to whole-file transport.

Implementation evidence: `src-tauri/src/audit_read.rs`, `src-tauri/src/audit_read/tests.rs`, `src/shared/lib/tauri-vault-fs.ts`, `src/shared/lib/llm-audit-log.ts`, and `src/widgets/app-settings-menu/model/use-ai-connection.ts`.

Source-level responsibilities are confirmed by the reviewed implementation. Runtime evidence is scoped to the recorded fixtures; this entry does not claim broader accepted project meaning or an aggregate process-memory guarantee.

## Uncertainty

- Windows bounded identity support is unverified. Existing Windows file reads remain, without a new chunking or memory claim.
- Queued IPC buffer lifetime and WebKit memory are outside the source-allocation cap. Physical peak memory is not established by vector capacity.
- Installed-app recovery evidence remains required before landing; source review alone does not establish general accepted project meaning.