---
id: 8dbc959b-a86c-4672-8d03-6067304ad096
date: 2026-11-09
---
## 2026-11-09 — Exclude locally configured Codex permission profiles from mode selection

**Why**: Codex ACP 2.6.0 advertises permission-profile ids without effective sandbox metadata; a disposable session exposed them as selectable.
**Prior**: Narrows the 2026-09-05 mode-policy decision in docs/DECISIONS.md only for the permission-profile namespace; unrelated unknown modes remain offered and labelled.
**Decision**: Exclude normalized permission-profile ids and reject direct selection callbacks. Report unsolicited profile moves as uncertain; keep read-only startup and server consent.
**Dissent**: Keeping every profile selectable preserves local convenience, but its label cannot establish approval behavior. Independent review accepted this bounded exclusion.
**Falsifier**: A profile with inspectable effective permissions and passing installed approval probes reopens the exclusion; any blocked callback reaching the adapter fails this slice.
**Owner**: Repository owner, through the authorized v1.9.2 release work.
