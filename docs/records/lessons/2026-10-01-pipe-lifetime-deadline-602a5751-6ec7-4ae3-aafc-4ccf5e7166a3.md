---
id: 602a5751-6ec7-4ae3-aafc-4ccf5e7166a3
date: 2026-10-01
kind: gate-gap
status: reported
harness_area: acp-probes
---
**Observed**: The original `acp.rs` probe waited for process exit before reading stdout. An exact-function reproduction treated 256 KiB of valid output as a timeout, and returned a successful prefix after the configured deadline when a descendant held stdout open. Both new regression cases failed on the original function. Existing tests covered small output and a living process timeout, not pipe capacity or EOF ownership.
**Cost**: The paired baseline reproduction took 5.01 seconds. No CI round.
**Suspected cause**: Tests modeled process lifetime without independently modeling output-pipe lifetime, so the timeout's scope looked complete.
**Proposed change**: gate. Exercise complete output beyond pipe capacity and a parent that exits while another process owns stdout. Include read-consumption and overflow refusal probes so a byte limit cannot be replaced with unbounded reading followed by rejection. These cases are included in this slice.
