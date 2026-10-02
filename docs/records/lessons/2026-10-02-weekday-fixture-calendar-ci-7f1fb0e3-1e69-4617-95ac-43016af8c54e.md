---
id: 7f1fb0e3-1e69-4617-95ac-43016af8c54e
date: 2026-10-02
kind: mistake
status: reported
harness_area: frontend-testing
---
**Observed**: Train2257 ejected PR2256 when automations-workspace.spec.ts:210 failed all3 attempts. The service fixture claimed weekdaysOnly:true but seeded tomorrow on Friday, creating Saturday. Existing refresh reconciled that invalid time before machine approval, then serialized the rounds file. Read-only diagnosis reproduced the failure and traced one pre-approval write on Friday versus none on Thursday; approval itself added no write. Correcting the shared future weekday timestamp and capturing the byte baseline in the same ready document restored exact byte equality. Fixed Thursday/Friday/Saturday/Sunday traces pass with zero schedule writes. Production scheduling and the byte assertion are unchanged.
**Cost**: One failed CI train; one exact failing reproduction and two temporal diagnosis cases, followed by one GREEN reproduction and four corrected calendar cases.
**Suspected cause**: A calendar-sensitive fixture generated an impossible weekday slot, and the test compared snapshots across re-seeded documents before refresh settled.
**Proposed change**: none. Fixtures with weekday-only cadence must seed valid weekday timestamps; snapshot the document under test after its observable ready state. Do not replace byte equality with structural equality when the contract forbids a vault write.
