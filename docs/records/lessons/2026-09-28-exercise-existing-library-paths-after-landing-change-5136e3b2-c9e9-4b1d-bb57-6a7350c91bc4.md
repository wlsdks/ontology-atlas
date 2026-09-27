---
id: 5136e3b2-c9e9-4b1d-bb57-6a7350c91bc4
date: 2026-09-28
kind: process
status: reported
harness_area: retained-journeys
---
**Observed**: Focused checks and the new inquiry proof passed, but landing train #2060 failed retained Library journeys. Replacing the Wiki graph hid the general conversation entry; the report integration also treated ordinary conversation as a read-only Ask and passed a click event into the optional answer override. Existing dock, auto-write and filing E2E tests exposed these regressions.
**Cost**: One failed full CI train; additional local reproduction time was not measured.
**Suspected cause**: The new landing state was verified more thoroughly than the existing entry, configured policy and filing paths it replaced. The generic fallback presentation kind was mistaken for explicit read-only authority.
**Proposed change**: none. Restore the existing entries and callback boundary, distinguish explicit opening requests, and run the affected retained journeys alongside the new one. Keep graph-specific fixtures on Sources and verify Wiki's new return surface explicitly.
