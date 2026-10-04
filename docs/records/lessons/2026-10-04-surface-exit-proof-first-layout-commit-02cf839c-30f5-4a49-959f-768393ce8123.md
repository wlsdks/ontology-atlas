---
id: 02cf839c-30f5-4a49-959f-768393ce8123
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: motion
---
**Observed**: Existing presence tests inspected renderHook results after passive effects. A layout-commit probe recorded open=true/exiting=false, then open=false/mounted=true/exiting=false, followed by open=false/exiting=true. The initial close commit was still interactive even though later assertions passed. The new regression reads the first layout commit and fails before the fix.
**Cost**: One external dependency-resolution launch failed before the probe ran; total previous exposure cost unknown.
**Suspected cause**: An effect-owned exit flag lagged the actual open prop by one commit, and act-based final-state checks hid that intermediate state.
**Proposed change**: gate, retain the first-layout-close and immediate-reopen regression alongside exit-duration/focus checks; final hook state alone cannot prove input lockout throughout an animation.
