---
id: 8b7becb1-9f52-4a6a-8a70-0b3836d7b39e
date: 2026-10-25
---
## 2026-10-25 — Confirm Library service setup before activation
**Why**: Five bounded probes reproduced duplicate saves, false credential completion and continuation after Close; a sibling-name collision can also exclude an existing connector.
**Prior**: Library import enabled its new descriptor before credential storage (`import-flow.ts`); decision a8e0fbd2-9695-4834-b771-5ae30d1c5791 requires this Mac's exact-definition consent and remains in force.
**Decision**: Replace the shortcut with disabled staging, an exact stored credential receipt, guarded activation/readback and current-session approval. Preserve IDs on retry, refuse all sibling-name collisions, and show browser file/app remedies without collecting tokens.
**Dissent**: Fresh-context review required preserving existing connectors and narrowing folder identity. Already-issued writes can finish; readback is not cross-process atomicity, and same-path physical replacement is unproven.
**Falsifier**: Any delayed, failed, cancelled or conflicting setup reaches completion/approval, overwrites a changed row, or breaks a previously attachable sibling.
**Owner**: Library service setup; lead implements the reviewed spec and retains failure evidence. Live service access remains unverified.
