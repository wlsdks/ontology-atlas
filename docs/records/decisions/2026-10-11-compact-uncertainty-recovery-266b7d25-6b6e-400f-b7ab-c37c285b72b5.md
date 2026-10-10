---
id: 266b7d25-6b6e-400f-b7ab-c37c285b72b5
date: 2026-10-11
---
## 2026-10-11 — Compact uncertainty remains whole and recoverable by document

**Why**: A source-hidden reader following the existing compact next read could not recover project verification limits: the brief clipped them to 96 characters and omitted the project from its recovery call. CLI also rejected a valid 11,924-byte payload because it counted display indentation.
**Prior**: The 2026-09-05 transmitted-JSON budget decision and the 2026-08-30 opt-in task-handoff decision in `docs/DECISIONS.md` remain standing. Keep compact v2 optional, full detail default, 12,000 serialized UTF-8 bytes and unchanged approval/source boundaries. The current integration guard is 22,000 combined wire characters, including the construction card; this slice does not change it.
**Decision**: Add scoped uncertainty provenance and unit/omission counts referencing whole strings in `focus.unknowns`. Reserve system gaps, coverage and exact project-inclusive recovery before optional text, consider at most eight recorded units in document round-robin order, and omit oversized units intact. CLI accepts the same transport bytes and validates additive metadata while retaining legacy v2 compatibility. Only successful, untruncated full-body rows establish complete read recovery; missing or capped rows remain unknown.
**Dissent**: The independent reviewer identified that full-body reads themselves cap at 40,000 characters. The spec and negative proof now preserve that limit rather than promising unconditional recovery. The strongest remaining objection is that one hand-authored fixture establishes delivery behavior, not general construction quality or coding benefit.
**Falsifier**: Reopen if a retained unit loses a qualification, counts or provenance drift, a system gap disappears, a recovery target omits a scoped document, CLI rejects a valid wire-sized response, or a reader reports complete recovery or accepted meaning from a capped or failed read. Broader usefulness requires separate trials.
**Owner**: jinan
