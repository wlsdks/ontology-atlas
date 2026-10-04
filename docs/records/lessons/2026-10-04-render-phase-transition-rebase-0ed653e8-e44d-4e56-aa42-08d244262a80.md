---
id: 0ed653e8-e44d-4e56-aa42-08d244262a80
date: 2026-10-04
kind: process
status: reported
harness_area: map-motion
---
**Observed**: Train #2507 reproduced the territories-to-galaxy timeout three times. A CPU4 probe proved the same renderer committed a ghost transition with memoized state set but baseState null; a previously queued lane-32 incoming-drawn no-op then rebased from null and removed the overlay before its first travel frame. View, vault identity, and canvas gating stayed unchanged. The next train passed without fixing this scheduling-sensitive defect. Evidence: morph-cause-proof.json in the external task scratch.
**Cost**: Two red landing trains included this timeout; one additional orphan train followed a GitHub API connection error. Full CI/token cost unknown.
**Suspected cause**: Render-phase state updates did not survive rebasing an older deferred update. A normal layout-effect update preserves its position in the queue and keeps the outgoing surface until handoff preparation commits.
**Proposed change**: script, retain CPU4 on the existing territories-to-galaxy regression; require actual transition completion rather than filling in a discarded record or extending the timeout. Restore a failed landing conductor promptly and inspect its persisted train before creating more work. The owner requested background-only verification, so no real-monitor motion approval is claimed.
