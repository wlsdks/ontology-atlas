---
id: 8369eaa2-4b2b-43cd-a561-7dc27eed5d88
date: 2026-10-04
---
## 2026-10-04 — Preserve existing native sent-log reads by platform

**Why**: The owner requires performance gains without losing existing behavior. Applying the bounded reader to an unproved platform would make previously readable Windows sent logs unavailable.
**Prior**: Narrows b8e1b4cb-a6f8-4fa0-ba5a-a861d9db7518's whole-file-aggregation falsifier to supported bounded readers. It does not authorize fallback after a failed bounded read.
**Decision**: Unix hosts return a reader ID and use generation-validated pulls. Other native hosts return an explicit unsupported capability before reserving or opening anything; the renderer retains their existing native File transport. Web remains FSA. Keep existing Windows read behavior until bounded Windows identity is proved. Memory and generation guarantees are scoped to the supported reader.
**Dissent**: Making every unsupported platform unavailable would provide a uniform truth contract, but would violate the owner's no-regression condition. Native Windows identity APIs remain a later proof obligation.
**Falsifier**: A bounded read error silently falls back, an unsupported prepare reserves resources, or a stable legacy Windows fixture can no longer be read. Actual Windows performance remains unmeasured.
**Owner**: jinan's explicit behavior-preserving performance goal; one independent reviewer checks the amended scope.
