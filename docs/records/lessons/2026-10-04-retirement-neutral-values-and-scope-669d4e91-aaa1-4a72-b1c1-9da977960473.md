---
id: 669d4e91-aaa1-4a72-b1c1-9da977960473
date: 2026-10-04
kind: tool-efficiency
status: reported
harness_area: map
---
**Observed**: a syntax-tree retirement dry run failed on negative numeric factory literals and required child statements; later blanket replacement of retired-channel identifiers with false produced invalid color assignments and a zero edge-presence factor. Local type checks exposed the defects before rendered approval. Neutral values were corrected from the old mode-off branches; nonretired local identifiers were restored and source formatting was recovered only across identical token sequences.
**Cost**: extra local correction rounds; wall time and token cost unknown. No CI round or landed defect.
**Suspected cause**: a spelling-based transform treated boolean, numeric, optional ink, and presence channels as interchangeable and ignored syntax-node ownership.
**Proposed change**: none. For future retirements, derive each removed channel's neutral value from its live off-state, preserve lexical scope, dry-run transformations, and prove retained behavior before using automation to reduce a large diff.
