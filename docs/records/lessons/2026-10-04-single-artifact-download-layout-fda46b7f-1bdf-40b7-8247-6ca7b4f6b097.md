---
id: fda46b7f-1bdf-40b7-8247-6ca7b4f6b097
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: desktop-release
---
**Observed**: Production run37218996605 passed both signed/notarized macOS and Windows build/install lanes, then staging failed with missingaarch64 updater input. The download action selected one macOS artifact and extracted it directly into release-assets despite merge-multiple:false. The builder searched only arch subdirectories. The actual signed artifact was RED with the original builder and GREEN with the corrected root lookup; its signature bytes were preserved.
**Cost**: One22-minute hosted release run failed after builds; no draft or public release was created.
**Suspected cause**: Removing the Intel app changed the downloader's single-artifact directory shape. The old two-folder fixture never exercised that exact shape.
**Proposed change**: script; resolve a flattened root only when an archive filename names the requested architecture, keep required-architecture/signature/ambiguity refusal, and retain the single-artifact plus Windows-sibling regression and wrong-architecture negative case.
