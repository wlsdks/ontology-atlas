---
id: 7a837e1c-224b-4638-9820-3bcedc27210a
date: 2026-11-02
---
## 2026-11-02 — Planning observes images separately from documents
**Why**: A document and folder check can finish before an embedded image read; a retained preview beside a new general check time can mislead a reviewer while an image is delayed or deleted.
**Prior**: Extend the selected-folder reader decision bf766fb3. It remains read-only and makes no claim that files cannot change between checks.
**Decision**: Label the folder and document observation separately. Every displayed image identifies whether its own current observation is checking, unconfirmed or checked; a previously displayed image may remain visible while checking. Coalesce repeated image checks to a running request and the latest requested revision, and discard results from older document or folder sessions.
**Dissent**: Per-image status adds visual noise to documents. It is needed when stale previews can influence review; the final installed-app review should evaluate that cost.
**Falsifier**: Revisit if reviewers cannot distinguish a stale image or if the status prevents practical document review; do not silently label a pending image checked.
**Owner**: The requesting project owner delegated the implementation; independent review remains required before landing.
