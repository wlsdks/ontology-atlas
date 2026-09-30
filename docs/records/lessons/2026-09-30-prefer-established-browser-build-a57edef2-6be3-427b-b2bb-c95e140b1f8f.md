---
id: a57edef2-6be3-427b-b2bb-c95e140b1f8f
date: 2026-09-30
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: An ad-hoc browser-harness bundler lookup, `node -e 'console.log(require.resolve("esbuild"))'`, returned `MODULE_NOT_FOUND`. The repository's existing `pnpm build` succeeded and its static export supported the real Library interaction probe without adding a bundler.
**Cost**: One unsuccessful lookup; its separate elapsed time was not measured.
**Suspected cause**: Looking for a familiar root-level bundler rather than using the project's already established static-export workflow.
**Proposed change**: none; use the established build and real application for browser interaction evidence before considering a standalone bundler harness.
