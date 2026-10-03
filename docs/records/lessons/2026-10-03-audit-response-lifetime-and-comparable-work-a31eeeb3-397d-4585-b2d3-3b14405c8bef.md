---
id: a31eeeb3-397d-4585-b2d3-3b14405c8bef
date: 2026-10-03
kind: mistake
status: reported
harness_area: performance
---
**Observed**: Independent review found that audit_read_pull restores its slot before returning a byte-owning Tauri Response. A staged-response test retains five 1MiB responses while all reader slots have closed. Per-read admission therefore did not prove the drafted 4MiB aggregate transport claim. The first native IPC timing also compared newline counting only on the bounded path, so its elapsed results were not comparable. The full changed-check run stopped at source-comment bytes (native +550, widgets +19); concise source comments restored that gate without a ratchet raise.
**Cost**: One source fix round and one interrupted local 24-recommendation run; wall time unknown, no CI round yet.
**Suspected cause**: Measuring reader ownership as if it included framework delivery lifetime, comparing different work, and adding explanatory comments before checking the existing ratchet.
**Proposed change**: none. Separate source buffers, transport buffers and RSS in claims; use identical work for latency probes; run affected ratchets before the complete recommendation run.
