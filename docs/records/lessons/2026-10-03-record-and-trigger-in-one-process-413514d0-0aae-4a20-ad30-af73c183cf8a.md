---
id: 413514d0-0aae-4a20-ad30-af73c183cf8a
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: motion-proof
---
**Observed**: starting an 11-second ScreenCaptureKit recording in one tool call and triggering the sequence in the next produced a clip whose six inspected samples all showed the old settled object. The driver counters recorded the sequence, but that clip did not. Model/tool round-trip time consumed the capture window.
**Cost**: one discarded-for-approval 11.6-second clip, extraction and inspection time unknown.
**Suspected cause**: a fixed capture window began before a separate model/tool round trip triggered the UI sequence. Success from both processes did not establish temporal overlap.
**Proposed change**: none. The external proof driver now launches the recorder, waits for its `RECORDING_STARTED` callback, runs the browser sequence in the same Node process, and then awaits recorder completion. It retains the original invalid clip and labels it as insufficient. The corrected baseline uses a preserved static bundle whose constellation scene Git blob is identical to the pre-change main blob.
