---
id: d2b749de-a556-4b5b-ab95-109d2a254501
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: desktop-release
---
**Observed**: The untagged1.6.0 release rehearsal failed four packaged download title checks before any tag or release dispatch. The route uses metadata.homeTitle with an absolute title, while desktop-smoke still expected metadata.pages.download plus the site template. The fixture built its own HTML from the same stale expectation. A changed-catalogue absolute-title regression failed before the correction; a deliberately wrong title in the actual exported en/download HTML also fails the corrected gate, and restoring exact bytes passes.
**Cost**: One failed local rehearsal; its unsigned build step took44.8 seconds. No release CI round was spent.
**Suspected cause**: The public SEO route moved to absolute landing metadata, but the release-only static title contract did not follow that route change.
**Proposed change**: none; preserve strict current-title checks, correct the download metadata source, retain nonempty locale inventory and missing-title refusal, and continue the failed packaging step only after actual-artifact RED/GREEN proof. Keep the pre-tag rehearsal in the release sequence.
