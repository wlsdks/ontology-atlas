---
id: 228afd78-52ca-49f4-a586-cf12cf683f0d
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: local-cleanup
---
**Observed**: `/bin/rm -rf /Applications/Microsoft\ Teams\ classic.app` failed with repeated permission-denied errors. A subsequent ownership check found UID 0 for the app bundle and UID 501 for the caller; the writable `/Applications` parent did not grant recursive deletion rights inside the bundle.
**Cost**: The failed command reported 19,714 output tokens across 572 lines. Elapsed time is unknown.
**Suspected cause**: The cleanup validated the exact target and inactive state but omitted an ownership preflight, then propagated the complete repeated stderr through an assertion.
**Proposed change**: script — Check target ownership before deleting installed app bundles, use the system authorization path for administrator-owned bundles, and summarize repeated filesystem errors instead of emitting full stderr.
