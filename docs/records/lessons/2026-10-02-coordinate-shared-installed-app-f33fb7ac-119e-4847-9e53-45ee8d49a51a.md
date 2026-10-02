---
id: f33fb7ac-119e-4847-9e53-45ee8d49a51a
date: 2026-10-02
kind: process
status: reported
harness_area: desktop
---
**Observed**: A second Atlas worktree replaced /Applications/Ontology Atlas.app after this thread completed Stop verification on SHA711711b. Fresh Computer Use state showed a different first-run screen; filesystem readback proved SHA3146edc. The other owner released the app through explicit coordination, and its committed shared-brand change was included without reviving the retired game.
**Cost**: One interrupted settings-restoration step and an additional shared build; elapsed coordination cost was not measured.
**Suspected cause**: Separate Git worktrees do not isolate a shared installed application or its persistent settings. A full app path resolves ambiguity between copies but does not reserve deployment ownership.
**Proposed change**: skill. Before parallel native deployment, state who owns the installed-app window and restore responsibility; exchange the tested hash and hand over explicitly. Re-read bundle identity when the observed UI changes unexpectedly, preserving the other owner's process until coordination completes.
