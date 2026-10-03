---
id: 6f83a253-63a4-4bbc-8951-93edf9e5f8d9
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: motion-proof
---
**Observed**: the first background fixture replaced every `FileSystemWritableFileStream.write` with a deferred write. The Library never reached its ready element: the seeded project document was blocked by the import-only probe. The locator timed out after30seconds. Restricting the gate to the exact chosen fixture payload made the probe reach picker waiting and actual OPFS source writing, exposing their identical button state.
**Cost**: one30-second timeout; other diagnosis time unknown.
**Suspected cause**: a platform prototype hook covered fixture setup as well as the operation under review. The failure named a missing ready control instead of the intercepted setup write.
**Proposed change**: none. The external driver and checked-in E2E fixture now defer only the exact owned source bytes. A callback observer cannot alter the actual source import outcome; that separate API contract has a deliberate throwing-observer case.
