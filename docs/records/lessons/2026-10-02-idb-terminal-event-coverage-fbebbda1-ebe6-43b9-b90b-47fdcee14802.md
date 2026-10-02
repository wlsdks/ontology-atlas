---
id: fbebbda1-ebe6-43b9-b90b-47fdcee14802
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: storage
---
**Observed**: Existing local-fs-handle store tests replace idbGet/idbSet/idbDel with successful Map operations. On the original production helper, new direct lifecycle tests fail 12 of 16 cases and real Chromium tests fail all 3 cases: failed structured cloning leaves connections open, and an abort after request success leaves a write and the next queued folder record pending.
**Cost**: Unknown user impact. The browser RED test bodies took about 30 seconds (15.0 s, 15.0 s and 95 ms); runner overhead was not measured; no user data or browser profile was used.
**Suspected cause**: Queue tests cover ordering but cannot establish the underlying IndexedDB transaction terminal-event contract when that layer is mocked.
**Proposed change**: gate — keep direct success/error/abort/setup-failure tests and real browser regressions for connection disposal and queue progress. Require genuine old-code RED before trusting the new cases.
