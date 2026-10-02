---
id: c7db7972-971d-40e7-9060-a740f346f74f
date: 2026-10-02
kind: process
status: reported
harness_area: verification
---
**Observed**: During the architecture layout optimization, a targeted Vitest baseline command returned a running session, and `graph-layout.ts` was patched before that session's completion was observed. That log cannot reliably establish which source revision the runner imported. The before/after performance and parity probe instead imports an immutable source snapshot captured from `a0554cfd6df0fe7cd63cd50362a6f29d69e46dc3`; final acceptance runs on the completed change.
**Cost**: one baseline test invocation whose revision is uncertain; wall time unknown, no CI round.
**Suspected cause**: a yielded execution was treated as if the dependent test had completed before the next source mutation.
**Proposed change**: skill: require completion of a targeted baseline test before editing its inputs, or run it against a frozen checkout/source snapshot. Record the source revision beside benchmark evidence rather than relying on the start time of a command.
