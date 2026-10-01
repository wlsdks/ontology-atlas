---
id: af6d8534-a26e-4c5d-90ac-b064f51d108f
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: perf-audit
---
**Observed**: The read-only performance audit tried a custom Node 24 TypeScript loader for frontend function probes. Two runs failed with `SyntaxError: The requested module 'react' does not provide an export named 'useCallback'`; forcing bare-package resolution to the repository root then failed with `ERR_MODULE_NOT_FOUND` for the transitive `use-intl` package. A Vite SSR fallback started dependency optimization for the application before loading the probe. The existing scoped Vitest performance command had already passed all 6 files and 12 tests. Extracting the measured pure functions into the external scratch directory and preserving their bodies completed the probes.
**Cost**: Three failed loader runs and one unnecessary application dependency scan; elapsed time and token cost unknown.
**Suspected cause**: The one-off loader mixed CommonJS package interop and pnpm package resolution with broad frontend barrel imports. The Vite server used default dependency discovery for a function-only measurement.
**Proposed change**: rule — Prefer the existing Vitest performance configuration for TypeScript measurements. If an external probe is necessary, use narrow pure-module imports and disable application dependency discovery instead of adding a bespoke general loader.
