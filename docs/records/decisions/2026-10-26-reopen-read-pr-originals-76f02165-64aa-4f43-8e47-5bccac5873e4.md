---
id: 76f02165-64aa-4f43-8e47-5bccac5873e4
date: 2026-10-26
---
## 2026-10-26 — Reopen explicitly read PR originals locally

**Why**: A native run read 39 PRs, then restart lost them and GitHub rate limits blocked rereading. Restore existing author evidence without another request.
**Prior**: Retain b1a09b49 public-only explicit reads, local integration proof and proposed-meaning boundaries; supersede only the original spec's session-only PR retention. Current code has no persistent PR store.
**Decision**: Save bounded public originals in app-owned private native storage, scoped to granted canonical folder/object and remote, independent of HEAD. Restore only after fresh local receipt and merge proof; label historical copies and unchecked discovery. No automatic network/model work. Explicit refresh reconciles checked integrations; clear is source-independent and fences pending saves with a persisted generation. Limits and proof belong to docs/specs/2026-10-26-reuse-read-pr-originals.md.
**Dissent**: Session-only storage minimizes retention and implementation cost. The shared-checkout independent reviewer required clear without a source or commits; that narrowing is accepted. Storage cannot fix observed translation or explanation gaps.
**Falsifier**: Restored text crosses source scope, looks freshly checked/complete, requires a remote/model fallback, or remains undeletable when its source is unavailable. Preserve first failures; withdraw persistence if recovery cannot be proven.
**Owner**: Atlas product owner; authorized sustained Git/PR usability work. Build/recovery proof does not establish human comprehension or accepted ontology meaning.
