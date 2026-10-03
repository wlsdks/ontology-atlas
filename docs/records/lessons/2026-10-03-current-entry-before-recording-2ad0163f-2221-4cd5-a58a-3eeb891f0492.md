---
id: 2ad0163f-2221-4cd5-a58a-3eeb891f0492
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: motion-proof
---
**Observed**: the background probe called `getByTestId('first-run-open')` after navigating to `/en/docs/`; it timed out. Current `/docs` redirects to Library's sample document tab, while `tests/e2e/library.spec.ts` mounts a folder on `/en/library/` through `library-open-vault`. Reusing the older helper without checking its route caused two failed probe runs. The baseline then measured 90 off-screen canvas draws in 90 frames.
**Cost**: two 30-second locator timeouts; other debugging time unknown.
**Suspected cause**: the older open-folder helper described an entry that no longer matches this browser surface. Historical successful fixture recipes were treated as current.
**Proposed change**: none. For this slice, reuse the current surface's sibling setup and require its ready element before instrumenting. A broader helper repair belongs to its route owner.
