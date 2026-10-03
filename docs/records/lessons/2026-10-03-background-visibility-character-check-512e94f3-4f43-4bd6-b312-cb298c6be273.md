---
id: 512e94f3-4f43-4bd6-b312-cb298c6be273
date: 2026-10-03
kind: process
status: reported
harness_area: native-proof
---
**Observed**: The main rebuild completed and the installer measured an exact post-copy bundle identity, but the direct-launch verifier stopped with `WebView document is hidden`. Bringing `/Applications/Ontology Atlas.app` forward through Computer Use showed the fresh 1.5.0 app rendering the previously selected folder. The initial CLI failure described occlusion/visibility, not a missing source asset.
**Cost**: One 12-second verification run failed; active recovery time was not measured.
**Suspected cause**: A background executable launch did not guarantee a visible WebView while another window owned the display. The visibility gate correctly refused frame-dependent proof.
**Proposed change**: none — retain the visibility gate and use a foreground launch plus fresh Computer Use readback for native motion proof.
