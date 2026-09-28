---
id: 90154cfa-a838-4a23-ad93-9a09af2d9e92
date: 2026-09-28
---
## 2026-09-28 — Recover connected source access through the native picker

**Why**: The installed app correctly refused a CLI-connected source that had never received a native content grant, but the inspector offered only repeated failure.
**Prior**: Preserve the Gray Area bound-folder preview decision (83ae5afc-2d54-49d8-b901-e5c8ffb14e1a) and the native content grant registry. An on-disk binding does not authorize access.
**Decision**: Return a typed recovery refusal with the source path and binding digest from the already granted vault. Offer the existing native picker, then require the same binding digest and canonical source root on re-preview. Only the original content grant admits reads; Git identity checks follow it. Cancel, mismatch, stale selection and changed binding cannot start inspection. A matching selection returns to the preview and its separate Inspect action.
**Dissent**: A general source-management screen could centralize recovery, but the current valid binding has no picker there and this would widen the observed repair. Reusing the native picker can grant another folder explicitly chosen by the person; the recovery does not bind or inspect it.
**Falsifier**: A renderer path or sidecar grants content access, a wrong folder replaces the binding, a stale picker completion changes the current scope, or collection starts before the explicit Inspect action.
**Owner**: Authorized functional QA and repair; the same independent reviewer approved the spec and security ordering. Product meaning acceptance remains separate.
