---
id: 9ca74cdd-77f6-47f6-8840-f50fe1593154
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: performance-audit
---
**Observed**: A Vite middleware-mode source-cache probe initially reported about 14 MiB of retained heap growth for both old and pruned caches. A later run logged unrelated `.claude/worktrees/agent-...` file reloads during measurement. Disabling the file watcher and automatic dependency discovery produced 3.436 MiB versus 0.573 MiB of retained growth; direct cache observations independently showed 31 entries versus one and 3,100,579 versus 100,019 text characters.
**Cost**: Two contaminated memory comparisons and additional controlled runs; exact total wall cost unknown.
**Suspected cause**: The profiling server watched a changing repository and retained unrelated watcher/discovery state alongside the cache under measurement.
**Proposed change**: none. Use `server.watch: null` and `optimizeDeps.noDiscovery: true` for fixed-input Vite memory probes, and report cache-owned entries/text separately from whole-process heap. Check installed option types before applying them.
