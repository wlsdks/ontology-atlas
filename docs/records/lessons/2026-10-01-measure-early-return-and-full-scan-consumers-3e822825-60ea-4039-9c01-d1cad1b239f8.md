---
id: 3e822825-60ea-4039-9c01-d1cad1b239f8
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: Replacing eager line arrays with a generator helped an early-return definition preview, but initially slowed firstHeading when CRLF input had no recognized heading: 1,000-line documents, 10,000 calls, 424.0 ms became 618.0 ms. That firstHeading change was reverted; the preview change was retained after 10,000 seeded compatibility comparisons.
**Cost**: One discarded optimization prototype; elapsed engineering time unmeasured.
**Suspected cause**: An iterator saves work only when the consumer stops early; scanning every line still pays generator suspension overhead. The original firstHeading regex does not recognize this CRLF heading, so this fixture exercised the full scan.
**Proposed change**: none; benchmark both early-return and full-scan inputs before sharing an iterator across consumers. Keep exact behavior unless a separately authorized correctness change is intended.
