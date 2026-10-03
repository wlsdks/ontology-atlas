---
id: 66d4e53f-5d69-42cd-9c54-c1bbf317a812
date: 2026-10-03
kind: mistake
status: reported
harness_area: performance
---
**Observed**: Train2486 rejected the new camera-authority regression because it compared full floating-point camera objects. Three captured residuals were0.241/0.170/0.271CSSpx with unchanged scale and viewport. waitForMapStill intentionally accepts eight repeated rounded coordinates, not identical floats. The corrected assertion uses the existing0.5CSSpx map tolerance and still requires exact scale/viewport. Executing the actual assertion block against pan-reset, scale-refit and viewport-change planted data produced RED; real CI residuals produce GREEN.
**Cost**: One failed CI train; wall time unknown.
**Suspected cause**: Treating a visual stillness signal as a bit-identical numerical snapshot.
**Proposed change**: none. Express camera authority in screen units and prove a meaningful reframe still turns the gate red; do not retry a deterministic equality failure as flaky.
