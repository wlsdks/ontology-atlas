---
id: 9c2b5f55-ab6c-4c7b-8323-982bdd43b4b8
date: 2026-09-15
---
## 2026-09-15 — Recover conflicting constellation drafts in place

**Why**: Review found no in-place recovery for a concurrent edit. Coarse-pointer measurements also exposed clipped deletion actions and a list outside the narrow viewport.
**Prior**: The saved scopes decision (`2026-09-15-saved-constellations-task-scopes-6ae6141b-6c37-43ff-af48-dbf28dc3f246.md`) and Galaxy sky decision (`2026-09-15-galaxy-three-arm-ontology-sky-c20717d0-2ec0-4a00-8eda-42f86250092f.md`) stand.
**Decision**: Keep the compact list, centered editor, Library reuse and explicit agent preparation. Preserve a conflicting draft, show a persistent error, read the latest record without writing, display differences, then require Apply against the refreshed version. Recreating a deleted set requires an explicitly named new-save action and a new ID. Keep coarse actions reachable, bound the narrow list to the viewport, and use the fast reopening token. Reuse the existing reversible, distance-aware Galaxy camera.
**Dissent**: Motion requested velocity-preserving camera retargeting and a reduced-motion crossfade. Retain the prior camera: measured focus and exact return work; reduced motion preserves scope without travel. Interruption continuity is not claimed. Handoff requested an installed CLI fallback, but Atlas ships bundled MCP and source CLI. Source CLI recovery is verified; browser preparation remains unavailable without the desktop bridge.
**Falsifier**: Reopen if recovery loses the draft, writes before Apply, silently recreates an ID, a supported viewport hides an action, or interrupted focus prevents the next map input.
**Owner**: Atlas product owner; Astra for the decision and proof, Sol for implementation.
