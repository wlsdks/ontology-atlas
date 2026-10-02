---
id: 8c613557-44d0-48d2-9a38-aed7a2b1211f
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: verification
---
**Observed**: The UTF-8 mutation test compared large binary buffers with assert.deepEqual. Failure formatting produced a large byte diff and the spawnSync probe returned status:null rather than a valid failing-test verdict. Its finally restored the source. Before that restoration completed, a bundled MCP build started and passed inventory/version parity while the source still contained the planted UTF-8 mutation. Neither result proved final behavior.
**Cost**: One invalid mutation-probe attempt and one package build that had to be repeated; elapsed cost unknown.
**Suspected cause**: Large binary diff formatting exceeded the probe's output capacity, and an exec yield was treated as completion before a dependent build.
**Proposed change**: none. Compare binary equality with Buffer.equals and assert its boolean, await terminal mutation-probe output plus restoration before any dependent build, and keep inventory/version parity separate from behavioral proof. The corrected byte-equality mutation now produces an actual assertion RED and restores byte-for-byte.
