---
id: b8e1b4cb-a6f8-4fa0-ba5a-a861d9db7518
date: 2026-10-04
---
## 2026-10-04 — Bounded native sent-log reads preserve source truth

**Why**: The owner requests CPU/memory efficiency as local data accumulates. The current audit bridge returned a 67,108,872-byte Vec for a 64MiB scratch file; renderer tail retention is bounded but native transport is not.
**Prior**: Retains 2026-08-17 (52) and 59f33326-5629-4cb7-8601-33c3b2f005fd: vault audit path, safe opening, writer reservations, locks and fsync. No new data store, deletion or external access.
**Decision**: Follow the independently reviewed bounded-native-audit-read spec: caller-owned descriptor pulls, raw responses up to1MiB, 64KiB renderer processing, four aggregate slots reserved before I/O, one slot/pull per native caller, no saturation queue/eviction. Validate generation around pulls and completion; held identity alone cannot prove a snapshot because finalize rewrites the inode. Cancel, retirement, error,30-second idle/five-minute total lease and exit release resources. Changed/unreadable/expired reads show unavailable and Retry, never partial/zero; absence stays empty. Reuse JS admission and count/latest-five facts. Review resolved aggregate admission; runtime and platform proof remain required.
**Dissent**: Stateless ranges avoid a registry; native summary transfers less. Both add source-validation or parser-parity risks. Revisit if actual IPC cost outweighs the measured resource benefit.
**Falsifier**: Growing resources, mixed/stale facts, false zero, altered history, writer blocking, cross-owner access, whole-file aggregation or failed installed-app recovery blocks landing. Capacity probes are not peak RSS or IPC latency.
**Owner**: jinan's ongoing resource-efficiency goal, with independent routed product review.
