---
id: f5ad0966-4c12-40bb-b412-f1de3733775d
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: map-perf
---
**Observed**: The focused performance test passed, but its console measurement was hidden by Vitest's silent setting. An external transpilation attempt assumed Vite exposed esbuild and failed with MODULE_NOT_FOUND; the installed Vite version does not provide that dependency. The existing performance runner with --silent=false produced the needed measurement.
**Cost**: One failed scratch instrumentation attempt; time unknown. No extra broad suite or dependency was added.
**Suspected cause**: A remembered tool dependency was treated as current without inspecting the installed package.
**Proposed change**: none. Prefer the existing performance project and explicit reporter settings for a same-process pure computation comparison; inspect installed dependencies before creating an external transpilation harness.
