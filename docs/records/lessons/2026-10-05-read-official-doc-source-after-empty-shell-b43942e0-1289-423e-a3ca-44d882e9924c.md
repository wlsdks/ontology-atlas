---
id: b43942e0-1289-423e-a3ca-44d882e9924c
date: 2026-10-05
kind: tool-efficiency
status: reported
harness_area: research
---
**Observed**: The browser read of `https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/` returned zero content lines. Reading the matching Markdown from `BabylonJS/Documentation` returned 143 lines, including the all-or-none visibility and mutation costs of thin instances.
**Cost**: Unknown; one empty read and one additional source read.
**Suspected cause**: The documentation site exposes a JavaScript application shell to the text reader.
**Proposed change**: none. When an official documentation page yields an empty shell, read the matching source from the project's official documentation repository before drawing capability or performance conclusions.
