---
id: 2feedbee-7b80-4817-b3bf-066d50f10175
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: #2093's new `tests/e2e/index-tree-window.spec.ts` seeded 121 files through `stubDirectoryPicker`, which writes them one by one inside the pick. It passed on macOS and 3 of 3 in `mcr.microsoft.com/playwright:v1.62.0-noble` at full CPU, then failed 3 of 3 on the train (run 36389500402, "Expected: > 120, Received: 0", snapshot still on "Opening folder..."). A probe in the image timed the writes at 3.6-13 s against 0.4-1.2 s for the app's own open; with `--cpus=2`, `CI=1`, two workers and the shard's neighbour `companion-progression.spec.ts` it failed 2 of 3. Writing the folder in parallel before the click (`writeFolderBeforePick`, 332e5ceb6) passes 3 of 3 there in 1.8-3.5 s. The Linux-image step from 6699fcd6 alone would not have caught it.
**Cost**: two ejected trains for #2093, measured 2026-09-28.
**Suspected cause**: the wait after a user action covered fixture setup, and local proof ran on an unloaded machine, where the setup fits inside the 15 s expect.
**Proposed change**: skill: when a spec seeds more than a few files through the picker stub, write them with `writeFolderBeforePick`; prove a new e2e spec in the Linux image with `--cpus=2 --workers=2` beside another spec, not alone.
