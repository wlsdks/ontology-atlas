---
id: 49f687cf-56b8-4c77-be30-8bffbca3b78e
date: 2026-09-30
kind: tool-efficiency
status: reported
harness_area: e2e
---
**Observed**: timing the M-MORPH handoff at synth 10000 with frames keyed on the rAF argument, the arriving Territories mount (a 105 ms task right after the travel's last frame) read as an 8 ms hold and a 108-118 ms interval inside the 120 ms fade. The first frame after the task carried a time 8 ms after the previous frame while its callback ran about 100 ms later (rAF 8.3 vs `performance.now()` 112.6). The overlay's fade clock took the same stale time, so the fade dropped from opacity 1.00 to 0.15 in one frame.
**Cost**: about 40 minutes of misattributed windows and two extra traces before a per-frame `performance.now()` column showed it.
**Suspected cause**: Chrome gives the first frame after a long task the time of the frame it queued before the task, so a clock or window keyed on the rAF argument places the task's length one frame late.
**Proposed change**: script: the motion sampler records `performance.now()` beside the rAF time and cuts windows on it; a phase clock that starts after heavy work reads `performance.now()`.
