---
id: 1487c6ab-abd7-4f43-ad0f-6c6d66c39727
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: The initial stream memory probe received the entire 50,000-record Blob in one value: only two read calls, with 31.47ms between requests. A stream API did not itself bound decode or processing work. Explicit 64KiB decode segments and host-task yields after a 4ms cooperative target let a dismissal cancel the read; removing either protection made its specific test fail. Native TauriFileHandle still prefetched complete binary file bytes, so the parser improvement alone does not prove bounded native I/O.
**Cost**: One additional focused design/measurement iteration; wall time unknown. No wasted CI round.
**Suspected cause**: Assuming transport chunk size or stream syntax provided a processing budget across browser and native adapters.
**Proposed change**: none. Measure actual chunk delivery, bound processing independently, use a real host task for interruptibility, and distinguish retained live heap from peak allocation and native transfer bytes.
