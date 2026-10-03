---
id: f20c60a6-283e-4b17-94cf-21e28a3d818b
date: 2026-10-04
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: An unfiltered `orca repo list --json` emitted icon base64 along with repository metadata, producing over13,000 output tokens and truncation. Filtering the JSON to id/path/displayName returned the exact Atlas repository in34tokens. Independent routed review also found that per-owner leases did not prove an aggregate descriptor/buffer bound; the spec was revised to count pending through retiring slots.
**Cost**: One noisy discovery call and one spec fix round; wall time unknown, no wasted CI round.
**Suspected cause**: Treating a rich inventory as a small identifier query, and initially leaving owner registration/admission implicit.
**Proposed change**: none. Filter runtime inventories before printing and state aggregate admission/cleanup bounds explicitly before implementing native resource registries.
