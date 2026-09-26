---
id: fcc6d81f-033b-443f-97db-5d844ec392f3
date: 2026-09-26
kind: mistake
status: reported
harness_area: computer-use
---
**Observed**: While a Claude Code Computer Use session holds its lock, it installs a system-wide Escape event tap that consumes every Escape except in secure password fields. Every Escape that failed in the installed app fell inside a computer-use call window.
**Cost**: A native Escape monitor and page stand-in were built, shipped, and later removed (#1863, #1883).
**Suspected cause**: A testing tool's side effect looked like a product defect, and no control run was made outside the tool.
**Proposed change**: rule: test keyboard input, Escape above all, with computer-use idle, sending keys through osascript or JXA; reproduce a platform input bug once with the test harness removed before shipping a fix.
