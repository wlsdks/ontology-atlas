---
id: 9435a468-7e20-40ee-94fd-b471d7108b71
date: 2026-09-13
---
## 2026-09-13 — Repository analysis returns bounded observed source ranges

**Why**: A frozen backend access probe returned structure and package/README evidence but no implementation predicates or effects needed to judge a proposed behavior. Vault-only read_source has a different authority and citation contract.
**Prior**: Retains 2026-09-13 human judgment and repeated meaning use (7766876a-30d9-40db-b0f7-2504c55e1e1e); adds an evidence read, not a new meaning model.
**Decision**: Add optional bounded sourceReads/sourceEvidence to analyze_repo_structure. Bind exact bytes/ranges to re-read hashes and an opt-in lifecycle source digest; preserve legacy calls, semantic-authority gates, qualification and human acceptance. Evidence/Steward narrowed file-transfer/currentness guards and added complete-versus-incomplete packet judgment proof.
**Dissent**: Native source tools already read code, and repeated analysis may cost too much. The measured core Atlas-only gap justifies one existing-interface extension; a new tool or semantic promotion remains unproven.
**Falsifier**: Reopen if an escaped/sensitive body is exposed, stale selected evidence reuses qualification, raw source alone qualifies meaning, continuation cannot progress, or sufficient returned evidence still fails the bounded judgment task.
**Owner**: Repository owner authorized V1–V4 execution; Astra plans and reviews, Sol low implements this bounded slice.
