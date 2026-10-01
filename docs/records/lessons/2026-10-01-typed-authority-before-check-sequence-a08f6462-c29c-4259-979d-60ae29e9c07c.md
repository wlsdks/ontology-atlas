---
id: a08f6462-c29c-4259-979d-60ae29e9c07c
date: 2026-10-01
kind: mistake
status: reported
harness_area: cross-package-types
---
**Observed**: The initial shared archive selector used a JavaScript default `cursor = null`. `pnpm checks:changed -- --run` reached typecheck after 16 passing commands, then rejected three string cursor callers because the inferred parameter accepted only null. The existing analysis codec already demonstrates one browser-safe `.mts` authority used by MCP through Node 24 type stripping.
**Cost**: One interrupted local verification run; elapsed cost unknown. No failed CI round.
**Suspected cause**: The implementation copied the runtime sharing pattern without checking its TypeScript boundary before the recommended check sequence.
**Proposed change**: none. Reuse the existing typed authority pattern and run the public-interface typecheck before the required final sequence when introducing a cross-package helper. No new wrapper package or resident instruction is needed.
