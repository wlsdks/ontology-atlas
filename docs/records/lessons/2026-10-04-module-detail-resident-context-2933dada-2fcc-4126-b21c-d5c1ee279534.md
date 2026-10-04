---
id: 2933dada-2fcc-4126-b21c-d5c1ee279534
date: 2026-10-04
kind: process
status: reported
harness_area: architecture
---
**Observed**: Adding a per-module pointer to AGENTS.md made `pnpm checks:changed -- --run` fail `rules-path-scope.contract.test.ts`: resident context grew to 19140 bytes. The source split itself passed all 22 Cargo/Rust analysis cases and byte-identical checks for 21 function bodies.
**Cost**: one failed focused check run; elapsed cost unknown.
**Suspected cause**: A module detail already belonged in docs/ARCHITECTURE.md, but was repeated in always-loaded instructions.
**Proposed change**: none; keep the detailed owner table in docs/ARCHITECTURE.md and retain only a shorter responsibility-splitting principle in AGENTS.md. The next check run passed all 21 recommendations.
