---
id: 28349d79-c623-46db-a341-c611b524e828
date: 2026-10-03
kind: mistake
status: reported
harness_area: map-motion
---
**Observed**: Native window recording showed large bright discs during Hex-to-Galaxy travel. The regression fixture still had radius 32.412 px after the style had already become a 4 px bright star. Pixel analysis revealed the mismatch despite passing existing layout/arrival tests. An earlier display recording captured another foreground application and could not validate the map.
**Cost**: Additional native rebuild and recording rounds; total cost unknown.
**Suspected cause**: Mark radius followed positional spring progress while shape and color followed the base effect clock. Position tests did not judge the transient silhouette or its brightness.
**Proposed change**: skill — the owner requested 60 fps motion verification, now specified in the Codex motion-verify skill. Bind the exact app window, retain source timestamps, and inspect active phase strips before concluding that a transition is smooth. The new regression test aligns radius with the existing style clock without changing positional travel.
