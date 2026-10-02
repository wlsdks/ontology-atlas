---
id: f52a7c12-f870-4365-869a-7e906ce4d5df
date: 2026-10-02
kind: process
status: reported
harness_area: landing
---
**Observed**: The bounded-history source checks passed before installed proof was delayed. The later landing train failed only `pnpm acp:registry:check`: the verified upstream adapter moved from 0.85.0 to 0.85.1 while the source and local test results stayed unchanged. The other type/lint/docs commands passed.
**Cost**: one rejected CI train; no code regression was established. Elapsed recovery time unknown.
**Suspected cause**: source-stable evidence was reused for a time-dependent upstream freshness check after a long verification wait.
**Proposed change**: none to the harness yet. When an ACP-touched slice waits for runtime proof, name upstream freshness as a risk and rerun only the registry check immediately before queueing. Do not repeat source-stable suites or bypass the gate.
