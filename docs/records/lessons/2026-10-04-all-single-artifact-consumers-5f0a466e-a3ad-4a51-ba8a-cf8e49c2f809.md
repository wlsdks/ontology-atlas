---
id: 5f0a466e-a3ad-4a51-ba8a-cf8e49c2f809
date: 2026-10-04
kind: mistake
status: reported
harness_area: desktop-release
---
**Observed**: Retry37221447926 passed macOS/Windows build/install and manifest generation but draft verification found no macOS DMG. The first directory correction covered the manifest lookup alone; upload globs still required an arch subfolder. The contract fixture invented that folder even when the real downloader flattened a sole artifact. Replaying the configured downloader shape makes the actual upload glob case RED; an explicit named architecture download folder makes all8 path contracts GREEN, including manifest URLs and publisher summary coverage.
**Cost**: One additional20-minute release run; a five-asset incomplete draft was backed up and retired without publication.
**Suspected cause**: The directory-shape change had multiple consumers, and the initial fix stopped after the manifest consumer. The fixture did not read the downloader's actual path and single-artifact behavior.
**Proposed change**: none; stage the one required Mac artifact into an explicit architecture folder and replay its configured download layout in the producer/manifest/upload/publisher contract. Preserve all asset, checksum, signature, duplicate and source-pinning checks.
