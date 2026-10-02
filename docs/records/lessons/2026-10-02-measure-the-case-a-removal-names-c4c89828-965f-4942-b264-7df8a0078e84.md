---
id: c4c89828-965f-4942-b264-7df8a0078e84
date: 2026-10-02
kind: mistake
status: reported
harness_area: map-harness
---
**Observed**: in the pan and zoom round (#2286) two removals shipped to review unmeasured on the case they existed for. `ORBIT_SMOOTH_TAU_MS` was deleted for zero lag although its own JSDoc named the 60 Hz pointer on a 120 Hz display it covered; driven that way, 57 of 114 orbit frames then did not move. Every Ctrl + wheel was read as a trackpad pinch, so a Ctrl + mouse notch (deltaY 100) zoomed x2.7 to x3.3 in one frame. The harness had measured only synthetic pinches and unpaced moves.
**Cost**: an independent review round, a third static build and a second set of commits on the pull request.
**Suspected cause**: the harness drove each input one way (unpaced pointer moves, synthesized pinch deltas), and nothing prompts measuring the case a removed constant documents or the other device that sends the same event.
**Proposed change**: skill: in map-perf, before deleting a smoothing or classification constant, reproduce the case its doc names, and for any event-class rule also drive the other device that emits that event (60 Hz paced pointer, CDP `Input.synthesizePinchGesture` beside a Ctrl + mouse notch).
