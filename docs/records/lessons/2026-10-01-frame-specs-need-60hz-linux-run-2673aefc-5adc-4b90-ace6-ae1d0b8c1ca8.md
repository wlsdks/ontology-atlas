---
id: 2673aefc-5adc-4b90-ace6-ae1d0b8c1ca8
date: 2026-10-01
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: #2213's morph spec passed every local run on a 120 Hz Mac, then failed its first- and largest-frame shares on Linux CI (0.22-0.37 against 0.2 and 0.25, job 110177453296). The Playwright 1.62 image on 2 CPUs with two workers reproduced it, 5 of 25. Shares were weighted by max(1, 16.7 ms / interval), so at 60 Hz one dropped frame doubled a share, and the travel clock started inside the input task.
**Cost**: one train ejection and a second round of about three hours.
**Suspected cause**: per-frame motion specs ran only on a 120 Hz machine, where short frames are weighted up and the input task is short; nothing ran them at 60 Hz under CPU contention before landing.
**Proposed change**: skill: in motion-verify, before landing a spec that asserts per-frame motion, run it in the Linux Playwright image with --cpus=2, --workers=2 and --repeat-each=10, and normalise its shares on the motion's own clock.
