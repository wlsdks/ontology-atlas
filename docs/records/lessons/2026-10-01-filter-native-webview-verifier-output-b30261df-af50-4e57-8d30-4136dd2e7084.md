---
id: b30261df-af50-4e57-8d30-4136dd2e7084
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: Tailing the native app verifier log printed long escaped WebView JSON payloads and truncated the useful failure context. The tool reported 53,329 tokens before truncation. A filtered read excluding payload lines immediately exposed the actual `WebView document is hidden` rejection; that run is not native UI proof.
**Cost**: One noisy truncated tool response and an extra targeted log read; consumed output/time were not measured separately.
**Suspected cause**: Treating a telemetry log with single-line JSON snapshots as ordinary short error lines.
**Proposed change**: none; print verifier errors and selected payload fields, keep full telemetry outside the repository, and never infer runtime success from process launch alone.
