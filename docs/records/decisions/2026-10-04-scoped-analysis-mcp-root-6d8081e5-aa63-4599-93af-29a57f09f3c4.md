---
id: 6d8081e5-aa63-4599-93af-29a57f09f3c4
date: 2026-10-04
---
## 2026-10-04 — Preserve inspected code roots across map analysis

**Why**: A native control investigation read the vault as its code root and failed source lookup. An explicit inspected root let the next run verify both source hashes.
**Prior**: Preserve decision 58 in `docs/DECISIONS.md` (2026-08-17): ordinary deduplication requires valid vault config and matching command. Extend map-analysis decision d4c00b25-124a-44fe-8159-91e36663ea3a.
**Decision**: Explicitly source-scoped sessions inject `atlas-vault` with the inspected `OATLAS_REPO_ROOT`, preserving vault and consent. Vault/command validation alone does not prove code-root equivalence. Carry that root into separate editable improvements/drafts; ordinary deduplication stays unchanged. The existing handoff names `atlas-vault`. No write or meaning approval is granted.
**Dissent**: Codex may also load its own registration, adding tools/processes and an older root. Its isolated config retains the existing consent floor; native scoped Codex replay remains unmeasured. Root-aware reuse needs a validated root contract.
**Falsifier**: Scoped work reads another root, a restored improvement loses the root, ordinary sessions duplicate, or checkpoints are bypassed. Require root readback and ordinary deduplication tests; disclose unmeasured Codex behavior.
**Owner**: Codex, implementing the owner's optional-analysis scope; the person keeps write and meaning authority.
