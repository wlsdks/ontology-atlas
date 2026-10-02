---
id: 0fee5483-f09d-4000-a70c-1d5b91dd7236
date: 2026-10-02
---
## 2026-10-02 — Preserve quoted frontmatter through reads and edits

**Why**: Four public readers retained quote bytes in mapping keys and changed nested quoted strings into numbers or booleans; the serializer also reinterpreted literal backslash escapes after an edit.
**Prior**: 2026-08-14 (6) stands: malformed nonempty declarations must remain diagnosable. The approved quoted-frontmatter-mappings spec retains existing write and acceptance authority.
**Decision**: Decode bounded quoted mapping keys, preserve quoted scalar types and one-pass escapes, and quote keys on write. Refuse lossy rewrites of malformed source unless an explicitly replaced complete field has unambiguous ownership. No YAML dependency, migration or semantic acceptance.
**Dissent**: A full YAML processor would cover more grammar, but would also change historical scalar behavior and deployment dependencies beyond the reproduced loss.
**Falsifier**: A supported read/edit/read loses a key, rationale, scalar type or unrelated malformed declaration; an ambiguous field becomes silently repairable; or established plain-value behavior changes.
**Owner**: Ontology Atlas maintainers; Codex implements and verifies this bounded repair under the owner's optimization request.
