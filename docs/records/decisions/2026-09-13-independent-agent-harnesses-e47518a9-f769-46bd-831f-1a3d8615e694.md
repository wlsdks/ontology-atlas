---
id: e47518a9-f769-46bd-831f-1a3d8615e694
date: 2026-09-13
---
## 2026-09-13 — Maintain Codex and Claude harness instructions independently

**Why**: The owner explicitly requested Astra-oriented Codex optimization and rejected forced equality with Claude because the harnesses and model generations differ. Existing byte-parity checks blocked legitimate instruction and resource differences.
**Prior**: Overturn the repository's AGENTS.md skill/agent byte-identity rule and the synchronization requirement in 2026-08-29 "Deterministic scratch receipts replace per-run qualification code"; preserve its qualification, isolation, digest, and acceptance contracts. The 2026-07-29 read-only skill-copy report remains a factual comparison, not synchronization authority.
**Decision**: Codex owns .agents instructions/resources and Claude owns .claude instructions/resources. Remove cross-harness content/inventory equality from repository gates. Check each tree's discovery, identity, references, routed roles, language, and authority boundaries independently. Codex task briefs inherit the caller model and available tools; model-specific native configuration belongs to that harness. Keep the public agent-files difference report unchanged.
**Dissent**: Independent copies can drift on shared product and evidence contracts. Preserve executable contract tests and validate each harness's references; copying text is not proof of contract agreement.
**Falsifier**: A harness loses a required routed role, follows a missing reference, violates a shared authorization contract, or cannot complete an existing qualification after the split.
**Owner**: Repository owner, requested in the 2026-09-13 instruction optimization session.
